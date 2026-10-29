// ============================================================================
// B2B AFS Systems - Yedek Parça Arama Denetleyicisi (controllers/searchController.js)
// Deep Cross-Reference (Çift Yönlü Çapraz Eşleştirme Örümcek Ağı) &
// Aggressive Schema Fetching (Tavizsiz Görsel ve Teknik Şema Taraması)
// Statik / Sahte / Hardcoded Veriye Sıfır Tolerans (KURAL 1, 2, 3, 4)
// ============================================================================

const {
  sanitize,
  executeDeepCrossReferenceSearch,
  enrichProductData,
  searchVinNumber
} = require('../services/partsCatalogService');

/**
 * İstekten (params, query, body) aranan yedek parça sorgusunu çıkarır.
 */
function extractSearchedQuery(req) {
  const candidates = [
    req.params?.query,
    req.params?.oeNumber,
    req.params?.article,
    req.params?.code,
    req.params?.partNumber,
    req.query?.q,
    req.query?.query,
    req.query?.searchedQuery,
    req.query?.oeNumber,
    req.query?.oe,
    req.query?.oem,
    req.query?.article,
    req.query?.code,
    req.query?.partNumber,
    req.body?.q,
    req.body?.query,
    req.body?.searchedQuery,
    req.body?.oeNumber,
    req.body?.oe,
    req.body?.oem,
    req.body?.article,
    req.body?.code,
    req.body?.partNumber
  ];

  for (const val of candidates) {
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return '';
}

/**
 * İstekten opsiyonel araç/marka bağlam parametrelerini çıkarır.
 */
function extractSearchContext(req) {
  const brand = (
    req.query?.brand ||
    req.query?.vehicleBrand ||
    req.query?.manufacturer ||
    req.body?.brand ||
    req.body?.vehicleBrand ||
    ''
  ).trim();

  const vin = (req.query?.vin || req.body?.vin || '').trim();
  const catalogId = (
    req.query?.catalogId ||
    req.body?.catalogId ||
    (brand ? brand.toLowerCase().replace(/[^a-z0-9]/g, '') : '')
  ).trim();
  const carId = (req.query?.carId || req.body?.carId || '').trim();
  const criteria = (req.query?.criteria || req.body?.criteria || '').trim();

  return { brand, vin, catalogId, carId, criteria };
}

/**
 * KURAL 4 Strict Payload oluşturucu:
 * Sadece gerçek verileri döner. Boş/olmayan opsiyonel alanlar undefined bırakılır (KURAL 3).
 */
function buildStrictSearchResponse(result) {
  const hasRealSpecs =
    result.technicalSpecs &&
    typeof result.technicalSpecs === 'object' &&
    Object.keys(result.technicalSpecs).length > 0;

  const payload = {
    success: true,
    searchedCode: result.searchedCode || sanitize(result.searchedQuery),
    searchedQuery: result.searchedQuery,
    rootOEM: result.rootOEM || undefined,
    originalOEMs: Array.isArray(result.originalOEMs) ? result.originalOEMs : [],
    referenceCodes: Array.isArray(result.referenceCodes) ? result.referenceCodes : [],
    technicalSpecs: hasRealSpecs ? result.technicalSpecs : undefined,
    images: Array.isArray(result.images) ? result.images : [],
    schemaSourceCode: result.schemaSourceCode || undefined
  };

  // Gerçek parça meta verileri varsa (DB veya API'den gelen gerçek kayıtlar) ekle; yoksa undefined bırak
  if (result.partName) payload.partName = result.partName;
  if (result.partGroup) payload.partGroup = result.partGroup;
  if (result.vehicleBrand) payload.vehicleBrand = result.vehicleBrand;
  if (result.compatibleModels) payload.compatibleModels = result.compatibleModels;
  if (Array.isArray(result.compatibleVehicles) && result.compatibleVehicles.length > 0) {
    payload.compatibleVehicles = result.compatibleVehicles;
  }
  if (Array.isArray(result.diagrams) && result.diagrams.length > 0) {
    payload.diagrams = result.diagrams;
  }

  return payload;
}

/**
 * @desc  Yedek Parça Arama Endpoint İşleyicisi (KURAL 1, 2, 3, 4)
 *        GET/POST /api/catalog/search, /api/catalog/search-oe/:oeNumber, /api/search, /api/parts/search
 */
async function searchParts(req, res) {
  const searchedQuery = extractSearchedQuery(req);

  if (!searchedQuery) {
    return res.status(400).json({
      success: false,
      message: 'Lütfen aranacak OEM veya Üretici Referans kodunu belirtiniz (Örn: trw gdb1552 veya 7701208122).'
    });
  }

  const context = extractSearchContext(req);

  try {
    const result = await executeDeepCrossReferenceSearch(searchedQuery, context);
    const strictPayload = buildStrictSearchResponse(result);
    return res.status(200).json(strictPayload);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error(`[SEARCH_CONTROLLER_ERROR] Query="${searchedQuery}":`, error.message);
    return res.status(statusCode).json({
      success: false,
      searchedQuery,
      message: error.message || 'Yedek parça çapraz referans sorgulaması sırasında bir hata oluştu.'
    });
  }
}

/**
 * @desc  Admin / Bayi Paneli Zenginleştirme Endpoint İşleyicisi
 *        GET /api/catalog/enrich, /api/catalog/enrich/:oeNumber
 *        Hem KURAL 4 strict alanlarını üst seviyede hem de data içinde döner.
 */
async function enrichPart(req, res) {
  const searchedQuery = extractSearchedQuery(req);

  if (!searchedQuery) {
    return res.status(400).json({
      success: false,
      message: 'Lütfen geçerli bir OE / OEM veya Üretici Referans numarası giriniz.'
    });
  }

  const context = extractSearchContext(req);

  try {
    const enriched = await enrichProductData({
      oeNumber: searchedQuery,
      ...context
    });

    const strictPayload = buildStrictSearchResponse(enriched);

    return res.status(200).json({
      ...strictPayload,
      data: strictPayload
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error(`[ENRICH_CONTROLLER_ERROR] Query="${searchedQuery}":`, error.message);
    return res.status(statusCode).json({
      success: false,
      searchedQuery,
      message: error.message || 'Parça zenginleştirme işlemi tamamlanamadı.'
    });
  }
}

/**
 * İstekten (params, query, body) Şasi (VIN) numarasını çıkarır.
 */
function extractVinFromRequest(req) {
  const candidates = [
    req.params?.vin,
    req.params?.vinNumber,
    req.params?.query,
    req.query?.vin,
    req.query?.vinNumber,
    req.query?.q,
    req.query?.query,
    req.body?.vin,
    req.body?.vinNumber,
    req.body?.q,
    req.body?.query
  ];

  for (const val of candidates) {
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return '';
}

/**
 * @desc  Şasi (VIN) -> Araç Künyesi (vehicleInfo) ve Komple OEM Parça Ağacı (compatibleParts) Denetleyicisi
 *        GET/POST /api/catalog/search-vin/:vin, /api/catalog/search-vin, /api/catalog/vin/:vin
 *        KATI KURALLAR:
 *        - Yanıtta vehicleInfo objesinin yanında kesinlikle compatibleParts dizisi dönülür.
 *        - compatibleParts içindeki her obje: { "partName": "...", "oemCode": "...", "categoryGroup": "..." }
 *        - Katalog API'si şasi için parça ağacı sunmuyorsa [] döner; asla sahte/mock veri üretilmez.
 */
async function searchVin(req, res) {
  // prompt.md Kural 2: Zaman aşımı (timeout) süresini Node seviyesinde güvenceye al (120 sn)
  if (typeof req.setTimeout === 'function') req.setTimeout(120000);
  if (typeof res.setTimeout === 'function') res.setTimeout(120000);

  const rawVin = extractVinFromRequest(req);

  if (!rawVin) {
    return res.status(400).json({
      success: false,
      message: 'Lütfen geçerli bir Şasi (VIN) numarası belirtiniz.'
    });
  }

  try {
    const result = await searchVinNumber(rawVin);

    const vehicleInfo = result.vehicleInfo || {
      vin: result.vin,
      brand: result.brand || result.vehicleBrand,
      vehicleBrand: result.vehicleBrand || result.brand,
      model: result.model || result.compatibleModels,
      compatibleModels: result.compatibleModels,
      modelList: Array.isArray(result.modelList) ? result.modelList : [],
      catalogId: result.catalogId,
      carId: result.carId,
      modelId: result.modelId,
      criteria: result.criteria,
      year: result.year,
      engine: result.engine
    };

    const compatibleParts = Array.isArray(result.compatibleParts)
      ? result.compatibleParts.map((part) => ({
          partName: String(part.partName || '').trim(),
          oemCode: sanitize(part.oemCode || ''),
          categoryGroup: String(part.categoryGroup || '').trim()
        })).filter((p) => p.partName && p.oemCode && p.categoryGroup)
      : [];

    return res.status(200).json({
      success: true,
      message: 'Araç bilgileri ve OEM parça ağacı Şasi (VIN) kataloğundan başarıyla getirildi.',
      vehicleInfo,
      compatibleParts,
      totalCount: compatibleParts.length,
      data: {
        ...vehicleInfo,
        vehicleInfo,
        compatibleParts,
        totalCount: compatibleParts.length,
        diagrams: [],
        images: []
      }
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error(`[VIN_CONTROLLER_ERROR] HTTP ${statusCode}:`, error.message);

    return res.status(statusCode).json({
      success: false,
      statusCode,
      statusText: error.statusText || 'Error',
      message: error.message || 'Şasi (VIN) sorgulaması gerçekleştirilemedi.',
      vehicleInfo: null,
      compatibleParts: [],
      targetUrl: error.targetUrl,
      rawApiResponse: error.apiResponse || null
    });
  }
}

module.exports = {
  searchParts,
  enrichPart,
  searchVin,
  extractVinFromRequest,
  extractSearchedQuery,
  extractSearchContext,
  buildStrictSearchResponse
};

