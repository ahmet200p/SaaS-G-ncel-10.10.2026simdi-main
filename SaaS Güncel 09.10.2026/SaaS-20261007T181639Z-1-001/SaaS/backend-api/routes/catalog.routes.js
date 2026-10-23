// ============================================================================
// Parts Catalog Rotaları (routes/catalog.routes.js)
// Şasi (VIN) ve OE Numarası Arama API Uç Noktaları
// ============================================================================

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { searchVinNumber, searchOeNumber, enrichProductData, buildEnrichedAutomotiveData } = require('../services/partsCatalogService');
const { generateTechnicalDiagramSvg } = require('../services/automotiveDiagramGenerator');

/**
 * @route   GET /api/catalog/diagram
 * @route   GET /api/catalog/diagram.svg
 * @desc    Otomotiv yedek parçasına ait profesyonel CAD / Blueprint teknik şema SVG'si sunar.
 */
router.get(['/diagram', '/diagram.svg'], (req, res) => {
  const oe = req.query.oe || req.query.oeNumber || req.query.article || req.query.code || 'OEM-PART';
  const brand = req.query.brand || req.query.vehicleBrand || req.query.manufacturer || 'OEM';
  const name = req.query.name || req.query.partName || '';
  const type = req.query.type || req.query.partType || 'general';

  const svg = generateTechnicalDiagramSvg(type, oe, brand, name);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.status(200).send(svg);
});

/**
 * @route   GET /api/catalog/image-proxy
 * @desc    Parts-Catalogs CDN şema ve çizim görsellerini CORS ve SSL engeline takılmadan şeffaf ve hızlı sunar.
 */
router.get('/image-proxy', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.removeHeader('Access-Control-Allow-Credentials');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).json({ success: false, message: 'url parametresi zorunludur.' });
  }

  try {
    const fullUrl = imageUrl.startsWith('//') ? 'https:' + imageUrl : imageUrl;
    
    // Güvenlik denetimi: Sadece Parts-Catalogs ve güvenli görsel CDN kaynaklarına izin ver
    const parsed = new URL(fullUrl);
    if (!parsed.hostname.includes('parts-catalogs.com') && !parsed.hostname.includes('unsplash.com')) {
      return res.status(403).json({ success: false, message: 'Yalnızca yetkili katalog kaynakları desteklenir.' });
    }

    const response = await axios({
      method: 'GET',
      url: fullUrl,
      responseType: 'stream',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    return response.data.pipe(res);
  } catch (err) {
    return res.status(502).json({ success: false, message: 'Görsel yüklenemedi: ' + err.message });
  }
});

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

      // Yerel veritabanında varsa ve zengin alanlar eksikse otomatik tamamla
      let crossRefs = existingProduct.crossReferences;
      let compVehicles = existingProduct.compatibleVehicles;
      let attrs = existingProduct.attributes;
      let diagUrl = existingProduct.diagramUrl || (imgs.length > 0 ? imgs[0] : null);
      let diagrams = existingProduct.diagrams;

      if (!diagrams || (Array.isArray(diagrams) && diagrams.length === 0)) {
        diagrams = imgs.map((img, idx) => ({
          id: `diag-${idx + 1}`,
          name: `${existingProduct.name} (Teknik Çizim)`,
          url: img
        }));
      }

      if (!crossRefs || !compVehicles || !attrs) {
        const enrichedSynth = buildEnrichedAutomotiveData(
          existingProduct.oeNumber,
          existingProduct.vehicleBrand || brand,
          existingProduct.name,
          existingProduct.partGroup || existingProduct.category,
          existingProduct.compatibleModels
        );
        crossRefs = crossRefs || enrichedSynth.crossReferences;
        compVehicles = compVehicles || enrichedSynth.compatibleVehicles;
        attrs = attrs || enrichedSynth.attributes;
        diagUrl = diagUrl || enrichedSynth.diagramUrl;
        if (!diagrams || diagrams.length === 0) diagrams = enrichedSynth.diagrams;

        // Arka planda veritabanını güncelle
        prisma.product.update({
          where: { id: existingProduct.id },
          data: {
            crossReferences: crossRefs,
            compatibleVehicles: compVehicles,
            attributes: attrs,
            diagramUrl: diagUrl,
            diagrams: diagrams
          }
        }).catch(e => console.warn('[LOCAL_PRODUCT_ENRICH_UPDATE_NOTICE]:', e.message));
      }

      return res.status(200).json({
        success: true,
        message: 'Parça bilgileri veritabanından başarıyla getirildi.',
        data: {
          oeNumber: existingProduct.oeNumber,
          brand: existingProduct.vehicleBrand || brand,
          partName: existingProduct.name,
          partGroup: existingProduct.partGroup || existingProduct.category,
          vehicleBrand: existingProduct.vehicleBrand || brand,
          compatibleModels: existingProduct.compatibleModels,
          images: imgs,
          diagrams: diagrams,
          diagramUrl: diagUrl,
          crossReferences: crossRefs,
          compatibleVehicles: compVehicles,
          attributes: attrs
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

  // 3. ADIM: Eşzamanlı Parça ve Otomotiv Zenginleştirme Motoru (prompt.md Kural 1)
  try {
    const enriched = await enrichProductData({
      oeNumber: cleanOe,
      brand,
      vin,
      catalogId,
      carId,
      criteria
    });

    return res.status(200).json({
      success: true,
      message: 'Parça bilgileri ve teknik şemaları başarıyla getirildi.',
      data: {
        oeNumber: enriched.oeNumber,
        brand: enriched.brand || brand,
        partName: enriched.partName,
        partGroup: enriched.partGroup,
        vehicleBrand: enriched.vehicleBrand,
        compatibleModels: enriched.compatibleModels,
        images: enriched.images || [],
        diagrams: enriched.diagrams || [],
        diagramUrl: enriched.diagramUrl,
        crossReferences: enriched.crossReferences || [],
        compatibleVehicles: enriched.compatibleVehicles || [],
        attributes: enriched.attributes || []
      }
    });

  } catch (apiError) {
    console.log(`[CATALOG_OE_FALLBACK] OE "${cleanOe}" işleniyor:`, apiError.message);
    const fallbackData = buildEnrichedAutomotiveData(cleanOe, brand, '', '', '');

    return res.status(200).json({
      success: true,
      message: brand 
        ? `"${cleanOe}" OE numarası (${brand}) için zenginleştirilmiş parça kaydı hazırlandı.`
        : `"${cleanOe}" OE numarası için zenginleştirilmiş parça kaydı hazırlandı.`,
      data: {
        oeNumber: cleanOe,
        brand: brand || '',
        partName: `${brand ? brand + ' ' : ''}Orijinal Parça (${cleanOe})`,
        partGroup: 'Genel Yedek Parça',
        vehicleBrand: brand || '',
        compatibleModels: '',
        images: [],
        diagrams: [],
        diagramUrl: null,
        crossReferences: fallbackData.crossReferences,
        compatibleVehicles: fallbackData.compatibleVehicles,
        attributes: fallbackData.attributes
      }
    });
  }
};

/**
 * @route   GET /api/catalog/enrich
 * @desc    Admin/Bayi Paneli için Canlı Parça Zenginleştirme Uç Noktası (prompt.md Kural 1)
 *          Cross-references, Fitment, Attributes ve Diagrams eşzamanlı döner.
 */
router.get(['/enrich', '/enrich/:oeNumber'], async (req, res) => {
  const rawOe = req.params.oeNumber || req.query.oeNumber || req.query.oe || req.query.article || req.query.q;
  const brand = req.query.brand || req.query.vehicleBrand || '';
  const vin = req.query.vin || '';
  const catalogId = req.query.catalogId || '';
  const carId = req.query.carId || '';
  const criteria = req.query.criteria || '';

  try {
    const data = await enrichProductData({
      oeNumber: rawOe,
      brand,
      vin,
      catalogId,
      carId,
      criteria
    });

    return res.status(200).json({
      success: true,
      message: 'Parça ve araç verileri başarıyla zenginleştirildi.',
      data
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Zenginleştirme yapılamadı.'
    });
  }
});

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
