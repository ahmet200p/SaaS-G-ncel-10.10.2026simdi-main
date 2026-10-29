// ============================================================================
// Parts Catalog Rotaları (routes/catalog.routes.js)
// Deep Cross-Reference (Çift Yönlü Çapraz Eşleştirme) &
// Aggressive Schema Fetching (Tavizsiz Görsel ve Teknik Şema Taraması)
// Statik / Sahte / Hardcoded Veriye Sıfır Tolerans (KURAL 1, 2, 3, 4)
// ============================================================================

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { searchParts, enrichPart, searchVin } = require('../controllers/searchController');
const { generateTechnicalDiagramSvg } = require('../services/automotiveDiagramGenerator');

/**
 * @route   GET /api/catalog/diagram
 * @route   GET /api/catalog/diagram.svg
 * @desc    Otomotiv yedek parçasına ait CAD / Blueprint teknik şema SVG'si sunar.
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
 * @route   GET/POST /api/catalog/search-vin/:vin, /api/catalog/search-vin, /api/catalog/vin/:vin
 * @desc    Şasi (VIN) Numarası ile Araç Künyesi (vehicleInfo) ve Komple OEM Parça Ağacı (compatibleParts) sorgular.
 *          Katalog API'si parça ağacı sunmuyorsa compatibleParts: [] döner; asla sahte veri üretilmez!
 */
const vinSearchAliases = [
  '/search-vin/:vin',
  '/search-vin',
  '/vin/:vin',
  '/vin'
];
router.get(vinSearchAliases, searchVin);
router.post(vinSearchAliases, searchVin);

// Marka ve Model Önbelleği (Kota ve Hız Koruması)
let cachedBrands = null;
let cachedBrandsTime = 0;

/**
 * @route   GET /api/catalog/brands
 * @desc    Parts Catalog API'sinde desteklenen tüm markaları döner.
 */
router.get(['/brands', '/catalogs'], async (req, res) => {
  const now = Date.now();
  if (cachedBrands && (now - cachedBrandsTime < 3600000)) {
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
 * @route   GET/POST /api/catalog/enrich & /api/catalog/enrich/:oeNumber
 * @desc    Admin/Bayi Paneli Canlı Parça Zenginleştirme Uç Noktası (KURAL 1, 2, 3, 4)
 */
router.get(['/enrich', '/enrich/:oeNumber'], enrichPart);
router.post(['/enrich', '/enrich/:oeNumber'], enrichPart);

/**
 * @route   GET/POST /api/catalog/search, /api/catalog/search-oe/:oeNumber, vb.
 * @desc    Deep Cross-Reference & Aggressive Schema Fetching Yedek Parça Arama Endpoint'i (KURAL 1, 2, 3, 4)
 */
const searchAliases = [
  '/search',
  '/search/:query',
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
  '/search-part'
];

router.get(searchAliases, searchParts);
router.post(searchAliases, searchParts);

module.exports = router;
