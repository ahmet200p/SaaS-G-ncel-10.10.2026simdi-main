// ============================================================================
// Parts Catalogs API Entegrasyon Servisi (services/partsCatalogService.js)
// Şasi (VIN) ve OE Numarası ile Canlı Harici Parça Kataloğu Entegrasyonu
// ============================================================================

const axios = require('axios');

const BASE_URL = (process.env.PARTS_CATALOG_BASE_URL || 'https://api.parts-catalogs.com').replace(/\/+$/, '');
const API_KEY = (process.env.PARTS_CATALOG_API_KEY || 'OEM-API-BD39DFA8-9AE9-4E7F-8B6D-3D1011BF973F').trim();

/**
 * Ortak API Başlıkları Konfigürasyonu
 */
function getRequestHeaders() {
  return {
    'Authorization': API_KEY, // Parts-Catalogs OAS 3.0 doğrudan anahtar bekler
    'X-API-KEY': API_KEY,
    'Accept': 'application/json',
    'Accept-Language': 'en',
    'User-Agent': 'SaaS-Parts-Catalog-Client/2026'
  };
}

/**
 * 1. ŞASİ (VIN) NUMARASI İLE SORGULAMA FONKSİYONU
 * Parts Catalogs API üzerinden /v1/car/info ve şemaları çeker.
 * Dönen verilerden 'Araç Markası', 'Uyumlu Modeller' ve varsa teknik şemaları/görselleri döner.
 * Fiyat ve Stok ASLA dönülmez!
 * 
 * @param {string} vinNumber - 17 Karakter Şasi / VIN Numarası
 * @returns {Promise<Object>} Araç bilgileri ve şema görselleri
 */
async function searchVinNumber(vinNumber) {
  if (!vinNumber || typeof vinNumber !== 'string') {
    const err = new Error('Lütfen geçerli bir Şasi (VIN) numarası giriniz.');
    err.statusCode = 400;
    throw err;
  }

  // VIN Güvenlik Sanitization (17 karakter alfanümerik, I, O, Q hariç)
  const cleanVin = vinNumber.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  if (!cleanVin || cleanVin.length < 5) {
    const err = new Error('Girilen Şasi (VIN) numarası geçersiz.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Bölge (Market/Region/Country) Parametresi: Avrupa (EU / Europe) varsayılan olarak eklenir
  const targetUrl = `${BASE_URL}/v1/car/info?q=${encodeURIComponent(cleanVin)}&market=Europe&region=EU`;
  console.log(`[PARTS_CATALOG_VIN_REQUEST] URL: ${targetUrl}`);

  try {
    const response = await axios.get(targetUrl, {
      headers: getRequestHeaders(),
      timeout: 8000
    });

    const carList = response.data;
    if (!carList || !Array.isArray(carList) || carList.length === 0) {
      const notFoundErr = new Error(`"${cleanVin}" Şasi (VIN) numarasına ait araç bulunamadı.`);
      notFoundErr.statusCode = 404;
      notFoundErr.targetUrl = targetUrl;
      notFoundErr.apiResponse = response.data;
      throw notFoundErr;
    }

    const primaryCar = carList[0];
    const vehicleBrand = primaryCar.brand || primaryCar.catalogId || '';

    // 2. Ham Şasi JSON Yanıtını Terminale Yazdır (Kullanıcının talimatı doğrultusunda)
    console.log('======================================================');
    console.log('[PARTS_CATALOG_RAW_VIN_CAR_INFO]:');
    console.log(JSON.stringify(primaryCar, null, 2));
    console.log('======================================================');

    // 3. Çoklu İsim (Array) Yönetimi:
    // API'den model isimleri dizi (array) veya zengin platform isimleri olarak geliyorsa
    // bunları virgülle birleştirip kutuya yazdırmak için topla
    const modelCandidates = [];

    // A) primaryCar.parameters içindeki 'car_name' veya 'model' parametresi (Örn: "Clio II / Thalia / Symbol / Lutecia")
    if (Array.isArray(primaryCar.parameters)) {
      const carNameParam = primaryCar.parameters.find(p => p.key === 'car_name' || p.key === 'model');
      if (carNameParam && carNameParam.value) {
        const parts = String(carNameParam.value).split(/\s*[\/,]\s*/).map(p => p.trim()).filter(Boolean);
        modelCandidates.push(...parts);
      }
    }

    // B) primaryCar.title alanı (Örn: "Clio II (Lutecia)" -> "Clio II", "Lutecia")
    if (primaryCar.title && typeof primaryCar.title === 'string') {
      const match = primaryCar.title.match(/^([^()]+)\s*(?:\(([^()]+)\))?$/);
      if (match) {
        if (match[1] && match[1].trim()) modelCandidates.push(match[1].trim());
        if (match[2] && match[2].trim()) modelCandidates.push(match[2].trim());
      } else {
        const titleParts = primaryCar.title.split(/\s*[\/,]\s*/).map(p => p.trim()).filter(Boolean);
        modelCandidates.push(...titleParts);
      }
    }

    // C) primaryCar.modelName (Dizi veya String)
    if (Array.isArray(primaryCar.modelName)) {
      modelCandidates.push(...primaryCar.modelName);
    } else if (typeof primaryCar.modelName === 'string' && primaryCar.modelName.trim()) {
      modelCandidates.push(primaryCar.modelName.trim());
    }

    // D) primaryCar.models (Dizi ise)
    if (Array.isArray(primaryCar.models)) {
      modelCandidates.push(...primaryCar.models);
    }

    // Benzersiz ve temiz model listesi oluştur (Marka adını filtrele, boşlukları temizle)
    const uniqueModelList = [];
    const seenLower = new Set();

    for (const m of modelCandidates) {
      const str = String(m).trim();
      const lower = str.toLowerCase();
      if (!str || lower === vehicleBrand.toLowerCase() || seenLower.has(lower)) {
        continue;
      }
      seenLower.add(lower);
      uniqueModelList.push(str);
    }

    // Çoklu isimleri virgülle birleştir (Örn: "Clio II, Thalia, Symbol, Lutecia")
    const compatibleModels = uniqueModelList.length > 0
      ? uniqueModelList.join(', ')
      : (primaryCar.title || primaryCar.modelName || '');

    // Kural: Şasi (VIN) sorgusundan görüntü/şema gelmez; sadece araç markası, modelleri ve bağlam döner.
    console.log(`[PARTS_CATALOG_VIN_SUCCESS] ${cleanVin} -> ${vehicleBrand} [${compatibleModels}]`);

    return {
      vin: cleanVin,
      vehicleBrand: vehicleBrand,
      compatibleModels: compatibleModels,
      modelList: uniqueModelList,
      catalogId: primaryCar.catalogId || '',
      carId: primaryCar.carId || '',
      criteria: primaryCar.criteria || '',
      diagrams: [],
      images: []
    };

  } catch (err) {
    if (err.statusCode === 404 || err.response?.status === 404) {
      const e = new Error(`"${cleanVin}" Şasi (VIN) numarası katalogda bulunamadı.`);
      e.statusCode = 404;
      e.targetUrl = targetUrl;
      e.apiResponse = err.response?.data;
      throw e;
    }

    if (err.response) {
      const apiErr = new Error(err.response.data?.message || `Harici API Hatası: HTTP ${err.response.status}`);
      apiErr.statusCode = err.response.status;
      apiErr.targetUrl = targetUrl;
      apiErr.apiResponse = err.response.data;
      throw apiErr;
    }

    const netErr = new Error(`Parts Catalogs API bağlantı hatası: ${err.message}`);
    netErr.statusCode = 502;
    netErr.targetUrl = targetUrl;
    throw netErr;
  }
}

/**
 * 2. OE NUMARASI VE ARAÇ MARKASI İLE SORGULAMA FONKSİYONU
 * Parts Catalogs API üzerinden OE ve Araç Markası (brand) ile sorgu atar.
 * Dönen verilerden 'Parça Adı', 'Parça Grubu' ve varsa görselleri döner.
 * Fiyat ve Stok ASLA dönülmez!
 * 
 * @param {string} oeNumber - OE / OEM Numarası
 * @param {string} [brand] - Araç Markası (Örn: Renault, Volkswagen, BMW)
 * @returns {Promise<Object>} Parça bilgileri ve görseller
 */
async function searchOeNumber(oeNumber, brand = '') {
  if (!oeNumber || typeof oeNumber !== 'string') {
    const err = new Error('Lütfen geçerli bir OE numarası belirtiniz.');
    err.statusCode = 400;
    throw err;
  }

  // OE Güvenlik Sanitization
  const cleanOe = oeNumber.trim().replace(/[^a-zA-Z0-9\-_]/g, '');
  if (!cleanOe) {
    const err = new Error('OE numarası geçersiz karakterler içeriyor.');
    err.statusCode = 400;
    throw err;
  }

  // Araç Markası (Brand) Sanitization
  let cleanBrand = '';
  if (brand && typeof brand === 'string') {
    const rawBrand = brand.trim();
    if (!rawBrand.toLowerCase().includes('universal') && !rawBrand.toLowerCase().includes('seçiniz')) {
      cleanBrand = rawBrand.replace(/[^a-zA-Z0-9\-_ ]/g, '').trim();
    }
  }

  const endpointPath = process.env.PARTS_CATALOG_OE_PATH || process.env.PARTS_CATALOG_PATH || '/v1/search/articles';
  const targetUrl = `${BASE_URL}${endpointPath}`;

  // TradeSoft & Parts Catalog API standart parametre eşlemesi
  // Dokümantasyondaki resmi terimler: 'article' ve 'code' (OE/OEM yerine 'article' geçer)
  const requestParams = {
    article: cleanOe,
    code: cleanOe,
    number: cleanOe,
    oe: cleanOe,
    q: cleanOe
  };
  if (cleanBrand) {
    requestParams.brand = cleanBrand;
    requestParams.manufacturer = cleanBrand;
    requestParams.catalogId = cleanBrand.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  console.log(`[PARTS_CATALOG_ARTICLE_REQUEST] URL: ${targetUrl} (Article/OE: "${cleanOe}", Marka: "${cleanBrand || 'Belirtilmedi'}")`);

  try {
    const response = await axios.get(targetUrl, {
      params: requestParams,
      headers: getRequestHeaders(),
      timeout: 8000
    });

    const item = response.data?.data || response.data;
    if (!item || (Array.isArray(item) && item.length === 0)) {
      const emptyErr = new Error(`"${cleanOe}" OE numarasına ait parça katalogda bulunamadı.`);
      emptyErr.statusCode = 404;
      emptyErr.targetUrl = targetUrl;
      emptyErr.apiResponse = response.data;
      throw emptyErr;
    }

    const primaryItem = Array.isArray(item) ? item[0] : item;

    const images = Array.isArray(primaryItem.images)
      ? primaryItem.images
      : (primaryItem.imageUrl ? [primaryItem.imageUrl] : []);

    const diagrams = Array.isArray(primaryItem.diagrams)
      ? primaryItem.diagrams
      : [];

    return {
      oeNumber: cleanOe,
      brand: cleanBrand,
      partName: primaryItem.partName || primaryItem.name || primaryItem.productName || primaryItem.title || '',
      partGroup: primaryItem.partGroup || primaryItem.category || primaryItem.group || '',
      images: images,
      diagrams: diagrams
    };

  } catch (err) {
    // 1. Hata Ayıklama (Debug) Logları (prompt.md direktifi)
    console.log("GİDEN İSTEK URL:", err.config?.url);
    console.log("GÖNDERİLEN PARAMETRELER:", err.config?.params);
    console.log("API GERÇEK YANITI:", err.response?.data);

    if (err.statusCode === 404 || err.response?.status === 404) {
      const e = new Error(`"${cleanOe}" OE numarasına ait parça katalogda bulunamadı.`);
      e.statusCode = 404;
      e.targetUrl = err.config?.url || targetUrl;
      e.apiResponse = err.response?.data;
      throw e;
    }

    if (err.response) {
      const apiErr = new Error(err.response.data?.message || `Harici API Hatası: HTTP ${err.response.status}`);
      apiErr.statusCode = err.response.status;
      apiErr.targetUrl = err.config?.url || targetUrl;
      apiErr.apiResponse = err.response.data;
      throw apiErr;
    }

    const netErr = new Error(`Parts Catalogs API bağlantı hatası: ${err.message}`);
    netErr.statusCode = 502;
    netErr.targetUrl = err.config?.url || targetUrl;
    throw netErr;
  }
}

module.exports = {
  searchVinNumber,
  searchOeNumber
};
