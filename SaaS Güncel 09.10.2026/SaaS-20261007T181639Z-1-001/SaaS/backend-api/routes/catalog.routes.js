// ============================================================================
// Parts Catalog Rotaları (routes/catalog.routes.js)
// Şasi (VIN) ve OE Numarası Arama API Uç Noktaları
// ============================================================================

const express = require('express');
const router = express.Router();
const { searchVinNumber, searchOeNumber } = require('../services/partsCatalogService');

/**
 * @route   GET /api/catalog/search-vin/:vin
 * @desc    Şasi (VIN) Numarası ile Araç Markası ve Uyumlu Modelleri sorgular.
 *          Dönen teknik çizimler/şemalar katalog görseli olarak sunulur.
 *          Fiyat ve Stok ASLA dönülmez!
 * @access  Public / Authenticated
 */
router.get('/search-vin/:vin', async (req, res) => {
  const rawVin = req.params.vin;

  if (!rawVin || typeof rawVin !== 'string' || rawVin.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Lütfen geçerli bir Şasi (VIN) numarası belirtiniz.'
    });
  }

  const cleanVin = rawVin.trim();

  try {
    const result = await searchVinNumber(cleanVin);

    // Kural: Şasi sorgusunda 'Araç Markası' ve 'Uyumlu Modeller' + görseller döner.
    // Fiyat ve Stok ASLA döndürülmez.
    return res.status(200).json({
      success: true,
      message: 'Araç bilgileri Şasi (VIN) kataloğundan başarıyla getirildi.',
      data: {
        vin: result.vin,
        vehicleBrand: result.vehicleBrand,
        compatibleModels: result.compatibleModels,
        modelList: result.modelList || [],
        catalogId: result.catalogId,
        carId: result.carId,
        criteria: result.criteria,
        diagrams: [],
        images: []
      }
    });

  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error(`[ROUTE_SEARCH_VIN_ERROR] HTTP ${statusCode}:`, error.message);

    return res.status(statusCode).json({
      success: false,
      statusCode: statusCode,
      statusText: error.statusText || 'Error',
      message: error.message || 'Şasi (VIN) sorgulaması gerçekleştirilemedi.',
      targetUrl: error.targetUrl,
      rawApiResponse: error.apiResponse || null
    });
  }
});

const axios = require('axios');
const prisma = require('../lib/prisma');

// Marka ve Model Önbelleği (Kota ve Hız Koruması)
let cachedBrands = null;
let cachedBrandsTime = 0;

/**
 * @route   GET /api/catalog/brands
 * @desc    Parts Catalog API'sinde desteklenen tüm 80 markayı ve model sayılarını döner.
 * @access  Public / Authenticated
 */
router.get(['/brands', '/catalogs'], async (req, res) => {
  const now = Date.now();
  if (cachedBrands && (now - cachedBrandsTime < 3600000)) { // 1 saat önbellek
    return res.status(200).json({
      success: true,
      totalBrands: cachedBrands.length,
      data: cachedBrands
    });
  }

  try {
    const apiKey = process.env.PARTS_CATALOG_API_KEY || 'OEM-API-BD39DFA8-9AE9-4E7F-8B6D-3D1011BF973F';
    const baseUrl = process.env.PARTS_CATALOG_BASE_URL || 'https://api.parts-catalogs.com';
    const response = await axios.get(`${baseUrl}/v1/catalogs/`, {
      headers: {
        'Authorization': apiKey,
        'X-API-KEY': apiKey,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (Array.isArray(response.data)) {
      cachedBrands = response.data.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type || 'passenger'
      }));
      cachedBrandsTime = now;

      return res.status(200).json({
        success: true,
        totalBrands: cachedBrands.length,
        data: cachedBrands
      });
    }

    return res.status(200).json({ success: true, data: [] });
  } catch (err) {
    console.error('[CATALOG_BRANDS_ERROR]:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Marka listesi harici API üzerinden alınamadı: ' + err.message
    });
  }
});

/**
 * @route   GET /api/catalog/brands/:brandId/models
 * @desc    Seçilen markaya ait tüm modelleri ve model görsellerini döner.
 * @access  Public / Authenticated
 */
router.get('/brands/:brandId/models', async (req, res) => {
  const brandId = (req.params.brandId || '').toLowerCase().trim();
  if (!brandId) {
    return res.status(400).json({ success: false, message: 'Lütfen bir marka belirtiniz.' });
  }

  try {
    const apiKey = process.env.PARTS_CATALOG_API_KEY || 'OEM-API-BD39DFA8-9AE9-4E7F-8B6D-3D1011BF973F';
    const baseUrl = process.env.PARTS_CATALOG_BASE_URL || 'https://api.parts-catalogs.com';
    const response = await axios.get(`${baseUrl}/v1/catalogs/${encodeURIComponent(brandId)}/models/`, {
      headers: {
        'Authorization': apiKey,
        'X-API-KEY': apiKey,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    const models = Array.isArray(response.data) ? response.data : [];
    return res.status(200).json({
      success: true,
      brand: brandId,
      totalModels: models.length,
      data: models.map(m => ({
        id: m.id,
        name: m.name,
        imageUrl: m.img ? (m.img.startsWith('//') ? 'https:' + m.img : m.img) : ''
      }))
    });
  } catch (err) {
    console.error(`[CATALOG_MODELS_ERROR] (${brandId}):`, err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      message: `"${brandId}" markasına ait modeller alınamadı: ` + err.message
    });
  }
});

/**
 * OE / OEM / ARTICLE NUMARASI İLE PARÇA ARAMA İŞLEYİCİSİ (CONTROLLER)
 * Tüm URL varyasyonlarını (search-oe, search-oem, search-article, article, oe) tek bir işleyicide birleştirir.
 * Terim uyuşmazlığından kaynaklanabilecek tüm 404 ihtimallerini sıfırlar.
 * Fiyat ve Stok ASLA dönülmez!
 */
const handlePartSearch = async (req, res) => {
  const rawOe = req.params.oeNumber 
    || req.params.article 
    || req.params.code 
    || req.params.partNumber
    || req.query.oeNumber 
    || req.query.oe 
    || req.query.oem 
    || req.query.article 
    || req.query.code 
    || req.query.partNumber
    || req.query.q;

  const brand = req.query.brand 
    || req.query.vehicleBrand 
    || req.query.manufacturer 
    || req.query.catalogId 
    || '';

  if (!rawOe || typeof rawOe !== 'string' || rawOe.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Lütfen geçerli bir OE / OEM / Parça (Article) numarası belirtiniz.'
    });
  }

  const cleanOe = rawOe.trim();

  // 1. ADIM: Önce yerel veritabanındaki Parça Havuzunda (Product) sorgula
  try {
    const existingProduct = await prisma.product.findFirst({
      where: {
        oeNumber: {
          equals: cleanOe,
          mode: 'insensitive'
        }
      }
    });

    if (existingProduct) {
      let imgs = [];
      if (existingProduct.images) {
        try {
          imgs = JSON.parse(existingProduct.images);
        } catch (e) {
          imgs = existingProduct.images.split(',').map(s => s.trim()).filter(Boolean);
        }
      } else if (existingProduct.imageUrl) {
        imgs = [existingProduct.imageUrl];
      }

      console.log(`[CATALOG_LOCAL_HIT] OE/Article "${cleanOe}" yerel veritabanında bulundu: "${existingProduct.name}" (${existingProduct.category})`);

      const diagrams = imgs.map((img, idx) => ({
        id: `diag-${idx + 1}`,
        name: `${existingProduct.name} (Teknik Çizim)`,
        url: img
      }));

      return res.status(200).json({
        success: true,
        message: 'Parça bilgileri veritabanından başarıyla getirildi.',
        data: {
          oeNumber: existingProduct.oeNumber,
          brand: existingProduct.vehicleBrand || brand,
          partName: existingProduct.name,
          partGroup: existingProduct.partGroup || existingProduct.category,
          images: imgs,
          diagrams: diagrams
        }
      });
    }
  } catch (dbErr) {
    console.warn('[LOCAL_PRODUCT_LOOKUP_WARN]:', dbErr.message);
  }

  // 2. ADIM: Araç Şemalarında Spesifik Parça Arama (Sadece İlgili Çizim, Ekstra Şema Eklenmez)
  const vin = req.query.vin || '';
  const carId = req.query.carId || '';
  const criteria = req.query.criteria || '';
  const catalogId = (req.query.catalogId || (brand ? brand.toLowerCase().replace(/[^a-z0-9]/g, '') : '')).trim();

  const apiKey = process.env.PARTS_CATALOG_API_KEY || 'OEM-API-BD39DFA8-9AE9-4E7F-8B6D-3D1011BF973F';
  const baseUrl = process.env.PARTS_CATALOG_BASE_URL || 'https://api.parts-catalogs.com';

  // 2.A: Şasi bağlamı varsa (kullanıcı önce şasi sorguladıysa), sadece bu parçaya uyan TEKİL teknik çizimi bul
  if (catalogId && carId && criteria) {
    try {
      const schemaUrl = `${baseUrl}/v1/catalogs/${catalogId}/schemas?carId=${encodeURIComponent(carId)}&criteria=${encodeURIComponent(criteria)}`;
      const schemaRes = await axios.get(schemaUrl, {
        headers: { 'Authorization': apiKey, 'X-API-KEY': apiKey, 'Accept': 'application/json' },
        timeout: 8000
      });

      const list = schemaRes.data?.list || (Array.isArray(schemaRes.data) ? schemaRes.data : []);
      
      // SADECE aranan OE numarası veya parçanın adı/tanımıyla eşleşen TEKİL şemayı bul (Ekstraya girme kuralı)
      let matchedSchema = list.find(s => {
        const str = JSON.stringify(s).toLowerCase();
        return str.includes(cleanOe.toLowerCase());
      });

      // Eğer doğrudan OE numarası geçmiyorsa, dış servisten parça adını öğrenip ilgili montaj şemasını bul:
      if (!matchedSchema) {
        try {
          const tecDocPart = await searchOeNumber(cleanOe, brand);
          if (tecDocPart && tecDocPart.partName) {
            const pNameLower = tecDocPart.partName.toLowerCase();
            matchedSchema = list.find(s => {
              const sNameLower = (s.name || '').toLowerCase();
              return (s.partNames && s.partNames.some(pn => pNameLower.includes(pn.name.toLowerCase()) || pn.name.toLowerCase().includes(pNameLower)))
                || sNameLower.includes(pNameLower) 
                || (pNameLower.includes('yağ') && sNameLower.includes('oil'))
                || (pNameLower.includes('filtre') && sNameLower.includes('filter'))
                || (pNameLower.includes('triger') && sNameLower.includes('timing'))
                || (pNameLower.includes('termostat') && sNameLower.includes('thermostat'))
                || (pNameLower.includes('fren') && sNameLower.includes('brake'));
            });

            if (matchedSchema && matchedSchema.img) {
              let imgUrl = matchedSchema.img;
              if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
              return res.status(200).json({
                success: true,
                message: `"${cleanOe}" OE numarasına ait teknik montaj çizimi getirildi.`,
                data: {
                  oeNumber: cleanOe,
                  brand: brand || catalogId,
                  partName: tecDocPart.partName || matchedSchema.name,
                  partGroup: tecDocPart.partGroup || '',
                  images: tecDocPart.images && tecDocPart.images.length > 0 ? tecDocPart.images : [imgUrl],
                  diagrams: [{
                    id: matchedSchema.groupId || matchedSchema.id || 'matched-1',
                    name: `${tecDocPart.partName || matchedSchema.name} (Teknik Montaj Çizimi)`,
                    url: imgUrl,
                    description: matchedSchema.description || ''
                  }]
                }
              });
            }
          }
        } catch (subErr) {
          // ignore
        }
      } else if (matchedSchema && matchedSchema.img) {
        let imgUrl = matchedSchema.img;
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
        console.log(`[CATALOG_EXACT_SCHEMA_MATCH] OE "${cleanOe}" -> Spesifik Şema: "${matchedSchema.name}" (${imgUrl})`);

        return res.status(200).json({
          success: true,
          message: `"${cleanOe}" OE numarasına ait teknik montaj çizimi getirildi.`,
          data: {
            oeNumber: cleanOe,
            brand: brand || catalogId,
            partName: matchedSchema.name || '',
            partGroup: '',
            images: [imgUrl],
            diagrams: [{
              id: matchedSchema.groupId || matchedSchema.id || 'matched-1',
              name: `${matchedSchema.name} (Teknik Montaj Çizimi)`,
              url: imgUrl,
              description: matchedSchema.description || ''
            }]
          }
        });
      }
    } catch (schemaErr) {
      console.warn('[VEHICLE_SCHEMAS_LOOKUP_WARN]:', schemaErr.message);
    }
  }

  // 3. ADIM: Harici API'yi (TradeSoft / TecDoc) dene
  try {
    const result = await searchOeNumber(cleanOe, brand);

    return res.status(200).json({
      success: true,
      message: 'Parça bilgileri OE/Article kataloğundan başarıyla getirildi.',
      data: {
        oeNumber: result.oeNumber,
        brand: result.brand || brand,
        partName: result.partName,
        partGroup: result.partGroup,
        images: result.images || [],
        diagrams: result.diagrams || []
      }
    });

  } catch (apiError) {
    // 4. ADIM: ASLA Araç Fotoğrafı Ekleme! Yalnızca Parça Şemaları ve Parça Verisi
    console.log(`[CATALOG_OE_FALLBACK] OE "${cleanOe}" dış API'de bağımsız bulunamadı. Temiz parça kaydı yapılıyor (Araç modelleri eklenmez).`);

    return res.status(200).json({
      success: true,
      message: brand 
        ? `"${cleanOe}" OE numarası (${brand}) için parça kaydı hazırlandı.`
        : `"${cleanOe}" OE numarası başarıyla kaydedildi. Aracın patlatılmış montaj şemalarını görmek için Şasi (VIN) numarası ile sorgulayabilirsiniz.`,
      data: {
        oeNumber: cleanOe,
        brand: brand || '',
        partName: '',
        partGroup: '',
        images: [],
        diagrams: []
      }
    });
  }
};

// URL Terim Uyuşmazlığını Sıfırlayan Alias Eşleşmeleri:
// Frontend /search-oe, /search-oem, /search-article veya /article atsa da hepsi aynı rotada çalışır.
const searchAliases = [
  '/search-oe/:oeNumber',
  '/search-oem/:oeNumber',
  '/search-article/:oeNumber',
  '/search-article/:article',
  '/search-part/:oeNumber',
  '/article/:oeNumber',
  '/article/:article',
  '/oem/:oeNumber',
  '/oe/:oeNumber',
  '/search-oe',
  '/search-oem',
  '/search-article',
  '/search'
];

router.get(searchAliases, handlePartSearch);

module.exports = router;
