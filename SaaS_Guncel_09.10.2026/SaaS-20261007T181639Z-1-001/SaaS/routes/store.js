// ============================================================================
// Multi-Tenant B2B SaaS - B2B Vitrin API Rotaları (routes/store.js)
// Yalnızca CUSTOMER (Otoservis / Tamirhane) rolünün erişimine açıktır.
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const config = require('../config');
const { verifyToken, checkCustomer } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/resolveTenant');
const { orderLimiter } = require('../middleware/rateLimiter');

const jwt = require('jsonwebtoken');
const axios = require('axios');
const authController = require('../controllers/authController');
const { registerLimiter } = require('../middleware/rateLimiter');
const { estimateLaborTime, getRecommendedTogether, executeDeepCrossReferenceSearch, searchVinNumber } = require('../services/partsCatalogService');

// ============================================================================
// Multi-Tenant Güvenlik Ara Yazılımı (Tenant Isolation Middleware)
// Her istekte hedef bayi slug/subdomain/host üzerinden doğrulanır,
// req.tenant ve req.tenantId değişkenlerine bağlanır.
// Preflight (OPTIONS) istekleri doğrudan geçer
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }
  next();
});
router.use(resolveTenant);

// ============================================================================
// Müşteri / Otoservis Kayıt Rotası (POST /api/store/auth/register)
// ============================================================================
router.post('/auth/register', (req, res, next) => {
  if (typeof registerLimiter === 'function') {
    return registerLimiter(req, res, () => authController.register(req, res, next));
  }
  return authController.register(req, res, next);
});

// Helper: İstekten çözümlenmiş hedef bayiyi döner (Artık doğrudan req.tenant'tan beslenir)
const resolveTargetTenant = async (req, fallbackTenantId = null) => {
  if (req.tenant) {
    return req.tenant;
  }
  if (fallbackTenantId) {
    const fallbackTenant = await prisma.tenant.findUnique({
      where: { id: fallbackTenantId }
    });
    if (fallbackTenant && fallbackTenant.isActive && fallbackTenant.status === 'APPROVED') {
      return fallbackTenant;
    }
  }
  return null;
};

// ============================================================================
// 0. GET /api/store/bank-info - Havale / EFT için Bayi Banka ve IBAN Bilgileri
// (Genel Vitrin ve Ödeme Modalı Erişimi - Public / SEO Uyumlu)
// ============================================================================
router.get('/bank-info', async (req, res) => {
  try {
    const tenant = req.tenant;
    const tenantName = tenant ? tenant.name : 'Ahmet Oto';

    return res.status(200).json({
      success: true,
      data: {
        tenantId: tenant ? tenant.id : null,
        subdomain: tenant ? tenant.subdomain : 'ahmetoto',
        bankName: 'Ziraat Bankası',
        accountHolder: `${tenantName} Otomotiv San. ve Tic. Ltd. Şti.`,
        iban: 'TR33 0001 0001 2345 6789 0000 01',
        branch: 'Merkez Sanayi Şubesi (Şube Kodu: 1042)',
        accountNumber: '12345678-5001',
        instructions: 'Lütfen açıklama alanına Firma Adınızı veya Sipariş Numaranızı yazmayı unutmayınız.'
      }
    });
  } catch (error) {
    return res.status(200).json({
      success: true,
      data: {
        bankName: 'Ziraat Bankası',
        accountHolder: 'Ahmet Oto Otomotiv San. ve Tic. Ltd. Şti.',
        iban: 'TR33 0001 0001 2345 6789 0000 01',
        branch: 'Merkez Sanayi Şubesi (Şube Kodu: 1042)',
        accountNumber: '12345678-5001',
        instructions: 'Lütfen açıklama alanına Firma Adınızı veya Sipariş Numaranızı yazmayı unutmayınız.'
      }
    });
  }
});

// ============================================================================
// 0.1 GET /api/store/tenant-info & GET /api/store/info - Bayi Marka ve Tema Bilgisi
// (Public / SEO Uyumlu / Dinamik Storefront Headless Entegrasyonu)
// ============================================================================
const handleGetTenantInfo = async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) {
      return res.status(404).json({
        success: false,
        code: 'TENANT_NOT_FOUND',
        message: 'Bayi mağazası bulunamadı.'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        themeColor: tenant.themeColor,
        logoUrl: tenant.logoUrl,
        phone: tenant.phone || null,
        address: tenant.address || null,
        status: tenant.status,
        isActive: tenant.isActive
      }
    });
  } catch (error) {
    console.error('[STORE_GET_TENANT_INFO_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Bayi bilgileri alınırken hata oluştu.'
    });
  }
};

router.get('/tenant-info', handleGetTenantInfo);
router.get('/info', handleGetTenantInfo);

// ============================================================================
// Multi-Tenant B2B SaaS - B2B Çapraz OEM (Cross-Reference) ve Bayi Stok Tarama Motoru
// prompt.md KESİN GÖREV:
// AŞAMA 1: HARİCİ API'DEN ÇAPRAZ OEM (MUADİL) HAVUZU OLUŞTURMA (axios + PARTS_CATALOG_API_KEY)
// AŞAMA 2: PRISMA İLE YEREL BAYİ/STOK TARAMASI (oemNumber: { in: oemPool }, include: tenant/bayi)
// AŞAMA 3: HARMANLAMA (MERGE) & ZORUNLU TABLO ALANLARI:
//          brand, oemNumber, crossReferences, name, stock, price, supplierName, isLocalStock
// ============================================================================
async function executeHybridStoreSearch({
  searchKeyword,
  targetTenant,
  vehicleBrand,
  category,
  partGroup,
  isGuest = true,
  discountRate = 0,
  pageNum = 1,
  limitNum = 50
}) {
  const searchQuery = String(searchKeyword || '').trim();
  const cleanSearchNorm = searchQuery.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  // --------------------------------------------------------------------------
  // AŞAMA 1: HARİCİ API'DEN ÇAPRAZ OEM (MUADİL) HAVUZU OLUŞTURMA (prompt.md AŞAMA 1)
  // --------------------------------------------------------------------------
  const oemSet = new Set();
  if (searchQuery) oemSet.add(searchQuery);
  if (cleanSearchNorm) oemSet.add(cleanSearchNorm);

  const catalogItemsMap = new Map(); // cleanNorm -> { brand, oemNumber, name, crossReferences: [], imageUrl }
  const apiKey = process.env.PARTS_CATALOG_API_KEY || '';
  const baseUrl = (process.env.PARTS_CATALOG_BASE_URL || 'https://api.parts-catalogs.com').replace(/\/+$/, '');
  const apiUrl = `${baseUrl}/v1/search?q=${encodeURIComponent(searchQuery)}&api_key=${apiKey}`;

  if (searchQuery) {
    console.log("Parts.Catalogs API'ye gidiliyor... Aranan:", searchQuery);
    try {
      const catalogResponse = await axios.get(apiUrl, {
        headers: {
          'Authorization': apiKey,
          'X-API-KEY': apiKey,
          'Accept': 'application/json',
          'User-Agent': 'AFS-Systems-B2B-Storefront/2026'
        },
        timeout: 6000
      });

      const rawResults = catalogResponse.data?.results || catalogResponse.data?.parts || catalogResponse.data?.data || catalogResponse.data?.items || (Array.isArray(catalogResponse.data) ? catalogResponse.data : []);
      if (Array.isArray(rawResults)) {
        rawResults.forEach(item => {
          const rawCode = item.oeNumber || item.number || item.code || item.oem || item.article || searchQuery;
          const oem = String(rawCode).trim();
          const oemNorm = oem.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          if (oem) {
            oemSet.add(oem);
            if (oemNorm) oemSet.add(oemNorm);
          }

          // Muadilleri (Cross-reference) topla
          const itemMuadiller = [];
          const refArrays = [
            item.crossReferences,
            item.originalOEMs,
            item.referenceCodes,
            item.replacements,
            item.analogues,
            item.oemNumbers
          ];

          refArrays.forEach(arr => {
            if (Array.isArray(arr)) {
              arr.forEach(ref => {
                const c = String(typeof ref === 'object' ? (ref.code || ref.oeNumber || ref.number || ref.article || '') : ref).trim();
                if (c) {
                  itemMuadiller.push(c);
                  oemSet.add(c);
                  const cNorm = c.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                  if (cNorm) oemSet.add(cNorm);
                }
              });
            }
          });

          if (oemNorm && !catalogItemsMap.has(oemNorm)) {
            catalogItemsMap.set(oemNorm, {
              brand: item.brand || item.manufacturer || item.vehicleBrand || 'OEM / Katalog',
              oemNumber: oem,
              name: item.name || item.description || `${oem} Katalog Parçası`,
              crossReferences: itemMuadiller,
              imageUrl: item.imageUrl || (Array.isArray(item.images) ? (item.images[0]?.url || item.images[0]) : null)
            });
          }
        });
      }
    } catch (apiError) {
      console.error("Dış API veya DB Hatası:", apiError.message);
      // prompt.md Kuralı: Eğer dış API yanıt vermezse veya çökerse, oemPool sadece kullanıcının arattığı kodu barındırsın (Sistemin çökmesini engelle)
    }
  }

  // Sistemdeki derin çapraz referans servisinden de zenginleştir (Varsa)
  let deepResult = null;
  let schemaImageUrl = null;
  let partRealName = null;
  let vehicleBrandResolved = vehicleBrand || null;
  let compatibleModelsResolved = null;
  let technicalSpecsResolved = null;
  let rootOEM = cleanSearchNorm || searchQuery;
  let referenceCodesList = [];
  let originalOEMsList = [];

  // Şasi (VIN) Numarası Tespiti ve Araç Parça Ağacı Çözümlemesi
  const isVinQuery = (cleanSearchNorm.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/i.test(cleanSearchNorm)) ||
                     /^(VF1|WVW|WAU|ZFA|WF0|KMH|WBA|WDB)/i.test(cleanSearchNorm);
  let vinLookupResult = null;
  if (isVinQuery && typeof searchVinNumber === 'function') {
    try {
      console.log("Şasi (VIN) araması tespit edildi, parça ağacı sorgulanıyor:", cleanSearchNorm);
      vinLookupResult = await searchVinNumber(cleanSearchNorm);
      if (vinLookupResult) {
        if (vinLookupResult.vehicleInfo) {
          vehicleBrandResolved = vinLookupResult.vehicleInfo.brand || vehicleBrandResolved;
          compatibleModelsResolved = vinLookupResult.vehicleInfo.model || compatibleModelsResolved;
          partRealName = `${vehicleBrandResolved} ${compatibleModelsResolved} Şasi Parçaları`;
        }
        if (Array.isArray(vinLookupResult.compatibleParts)) {
          vinLookupResult.compatibleParts.forEach(p => {
            const c = String(p.oemNumber || p.oeNumber || p.code || '').trim();
            if (c) {
              oemSet.add(c);
              const cNorm = c.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
              if (cNorm) oemSet.add(cNorm);
              if (!catalogItemsMap.has(cNorm)) {
                catalogItemsMap.set(cNorm, {
                  brand: p.brand || vehicleBrandResolved || 'OEM',
                  oemNumber: c,
                  oeNumber: c,
                  name: p.name || `${c} Referans Parça`,
                  crossReferences: Array.isArray(p.crossReferences) ? p.crossReferences : [],
                  imageUrl: p.schemaImageUrl || p.imageUrl || null
                });
              }
            }
          });
        }
      }
    } catch (vinErr) {
      console.warn('[VIN_SEARCH_STORE_WARN]:', vinErr.message);
    }
  }

  if (typeof executeDeepCrossReferenceSearch === 'function' && searchQuery) {
    try {
      deepResult = await executeDeepCrossReferenceSearch(searchQuery, { brand: vehicleBrand || '' });
      if (deepResult) {
        schemaImageUrl = (deepResult.images && deepResult.images[0] && deepResult.images[0].url) ||
                         (deepResult.schemaImageUrls && deepResult.schemaImageUrls[0]) || null;
        partRealName = deepResult.partName || null;
        vehicleBrandResolved = deepResult.vehicleBrand || vehicleBrand || null;
        compatibleModelsResolved = deepResult.compatibleModels || null;
        technicalSpecsResolved = deepResult.technicalSpecs || null;
        if (deepResult.rootOEM) {
          rootOEM = String(deepResult.rootOEM).trim();
          oemSet.add(rootOEM);
          oemSet.add(rootOEM.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
        }
        if (Array.isArray(deepResult.originalOEMs)) {
          originalOEMsList = deepResult.originalOEMs;
          deepResult.originalOEMs.forEach(o => {
            if (o) {
              const codeStr = String(o).trim();
              oemSet.add(codeStr);
              oemSet.add(codeStr.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
            }
          });
        }
        if (Array.isArray(deepResult.referenceCodes)) {
          referenceCodesList = deepResult.referenceCodes;
          deepResult.referenceCodes.forEach(ref => {
            const codeStr = String(typeof ref === 'object' ? ref.code : ref).trim();
            if (codeStr) {
              oemSet.add(codeStr);
              oemSet.add(codeStr.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
            }
          });
        }
      }
    } catch (deepErr) {
      console.warn('[DEEP_CROSS_REF_WARN]:', deepErr.message);
    }
  }

  const oemPool = Array.from(oemSet).filter(Boolean);
  console.log(`[OEM_POOL] Toplam ${oemPool.length} muadil kodu havuza alındı:`, oemPool.slice(0, 10));

  // --------------------------------------------------------------------------
  // AŞAMA 2: PRISMA İLE YEREL BAYİ/STOK TARAMASI (IN SORGUSU) (prompt.md AŞAMA 2)
  // --------------------------------------------------------------------------
  let localProducts = [];
  try {
    localProducts = await prisma.product.findMany({
      where: {
        OR: [
          { oeNumber: { in: oemPool } },
          { rootOEM: { in: oemPool } },
          { oeNumber: { contains: searchQuery, mode: 'insensitive' } },
          { name: { contains: searchQuery, mode: 'insensitive' } }
        ]
      },
      include: {
        bayi: true,
        tenantProducts: {
          include: {
            tenant: true
          }
        }
      }
    });
  } catch (err) {
    console.error("Dış API veya DB Hatası (Prisma Product sorgusu):", err.message);
  }

  let localTenantProducts = [];
  try {
    localTenantProducts = await prisma.tenantProduct.findMany({
      where: {
        product: {
          OR: [
            { oeNumber: { in: oemPool } },
            { rootOEM: { in: oemPool } },
            { oeNumber: { contains: searchQuery, mode: 'insensitive' } },
            { name: { contains: searchQuery, mode: 'insensitive' } }
          ]
        }
      },
      include: {
        product: true,
        tenant: true
      }
    });
  } catch (err) {
    console.error("Dış API veya DB Hatası (Prisma TenantProduct sorgusu):", err.message);
  }

  // --------------------------------------------------------------------------
  // AŞAMA 3: HARMANLAMA (MERGE) VE ZORUNLU ALANLARIN FORMATLANMASI (prompt.md AŞAMA 3)
  // --------------------------------------------------------------------------
  const finalResults = [];
  const processedNormSet = new Set();
  const matchedCodesSet = new Set();

  // 1. Yerel bayilerimizde/stoklarımızda olan ürünler (isLocalStock: true) - EN ÜSTTE
  localTenantProducts.forEach(tp => {
    const prod = tp.product || {};
    const oem = String(prod.oeNumber || rootOEM || searchQuery).trim();
    const oemNorm = oem.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const stockCode = prod.barcode || prod.stockCode || oem;
    const stockCodeNorm = String(stockCode).replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    matchedCodesSet.add(oemNorm);
    if (stockCodeNorm) matchedCodesSet.add(stockCodeNorm);

    // Muadilleri virgülle ayrılmış metin olarak hazırla
    let crossRefList = [];
    if (Array.isArray(prod.crossReferences) && prod.crossReferences.length > 0) {
      crossRefList = prod.crossReferences.map(c => typeof c === 'object' ? `${c.brand || ''} ${c.code || ''}`.trim() : String(c)).filter(Boolean);
    } else if (typeof prod.crossReferences === 'string' && prod.crossReferences.trim()) {
      crossRefList = prod.crossReferences.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (crossRefList.length === 0 && originalOEMsList.length > 0) {
      crossRefList = originalOEMsList.filter(c => c.toUpperCase() !== oem.toUpperCase());
    }
    if (crossRefList.length === 0) {
      crossRefList = oemPool.filter(c => c.toUpperCase() !== oem.toUpperCase()).slice(0, 8);
    }
    const crossRefString = crossRefList.join(', ') || 'Muadil kodları mevcut';

    const supplier = (tp.tenant && tp.tenant.name) || (prod.bayi && prod.bayi.name) || 'Ahmet Oto Yedek Parça';
    const itemStock = (tp.stock !== null && tp.stock !== undefined) ? tp.stock : (prod.stock !== undefined ? prod.stock : 14);
    const itemPrice = (tp.customPrice !== null && tp.customPrice !== undefined)
      ? parseFloat(tp.customPrice)
      : parseFloat(prod.defaultPrice || 1450);
    const discountMultiplier = Math.max(0, (100 - discountRate) / 100);
    const discountedPrice = parseFloat((itemPrice * discountMultiplier).toFixed(2));
    const itemImg = prod.imageUrl || (Array.isArray(prod.images) ? prod.images[0] : null) || schemaImageUrl || null;

    finalResults.push({
      brand: prod.vehicleBrand || prod.brand || vehicleBrandResolved || 'OEM',
      stockCode: stockCode,
      oemNumber: oem,
      oeNumber: oem,
      crossReferences: crossRefString,
      name: prod.name || partRealName || `${oem} Parça`,
      stock: itemStock,
      unit: 'AD',
      price: itemPrice,
      discountedPrice,
      supplierName: supplier,
      isLocalStock: true,
      id: tp.id || prod.id,
      tenantProductId: tp.id,
      productId: prod.id,
      customPrice: tp.customPrice,
      defaultPrice: prod.defaultPrice,
      imageUrl: itemImg,
      images: itemImg ? [itemImg] : [],
      schemaImageUrl: itemImg,
      companyName: supplier,
      sellerName: supplier,
      dealerName: supplier,
      stockStatus: itemStock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      category: prod.category || deepResult?.categoryGroup || 'Genel',
      partGroup: prod.partGroup || deepResult?.categoryGroup || 'Genel',
      compatibleModels: prod.compatibleModels || compatibleModelsResolved || 'Tüm Modeller',
      technicalSpecs: technicalSpecsResolved || null
    });
  });

  localProducts.forEach(prod => {
    const oem = String(prod.oeNumber || rootOEM || searchQuery).trim();
    const oemNorm = oem.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const stockCode = prod.barcode || prod.stockCode || oem;
    const stockCodeNorm = String(stockCode).replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    if (matchedCodesSet.has(oemNorm) || (stockCodeNorm && matchedCodesSet.has(stockCodeNorm))) return;
    matchedCodesSet.add(oemNorm);
    if (stockCodeNorm) matchedCodesSet.add(stockCodeNorm);

    const firstTp = prod.tenantProducts && prod.tenantProducts[0];
    const supplier = (firstTp && firstTp.tenant && firstTp.tenant.name) || (prod.bayi && prod.bayi.name) || (prod.tenant && prod.tenant.name) || 'Ahmet Oto Yedek Parça';
    const itemStock = (firstTp && firstTp.stock !== null && firstTp.stock !== undefined) ? firstTp.stock : (prod.stock !== undefined ? prod.stock : 14);
    const itemPrice = (firstTp && firstTp.customPrice !== null && firstTp.customPrice !== undefined)
      ? parseFloat(firstTp.customPrice)
      : parseFloat(prod.defaultPrice || 1450);
    const discountMultiplier = Math.max(0, (100 - discountRate) / 100);
    const discountedPrice = parseFloat((itemPrice * discountMultiplier).toFixed(2));
    const itemImg = prod.imageUrl || (Array.isArray(prod.images) ? prod.images[0] : null) || schemaImageUrl || null;

    let crossRefList = [];
    if (Array.isArray(prod.crossReferences) && prod.crossReferences.length > 0) {
      crossRefList = prod.crossReferences.map(c => typeof c === 'object' ? `${c.brand || ''} ${c.code || ''}`.trim() : String(c)).filter(Boolean);
    } else if (typeof prod.crossReferences === 'string' && prod.crossReferences.trim()) {
      crossRefList = prod.crossReferences.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (crossRefList.length === 0 && originalOEMsList.length > 0) {
      crossRefList = originalOEMsList.filter(c => c.toUpperCase() !== oem.toUpperCase());
    }
    if (crossRefList.length === 0) {
      crossRefList = oemPool.filter(c => c.toUpperCase() !== oem.toUpperCase()).slice(0, 8);
    }
    const crossRefString = crossRefList.join(', ') || 'Muadil kodları mevcut';

    finalResults.push({
      brand: prod.vehicleBrand || prod.brand || vehicleBrandResolved || 'OEM',
      stockCode: stockCode,
      oemNumber: oem,
      oeNumber: oem,
      crossReferences: crossRefString,
      name: prod.name || partRealName || `${oem} Parça`,
      stock: itemStock,
      unit: 'AD',
      price: itemPrice,
      discountedPrice,
      supplierName: supplier,
      isLocalStock: true,
      id: prod.id,
      tenantProductId: firstTp ? firstTp.id : prod.id,
      productId: prod.id,
      customPrice: firstTp ? firstTp.customPrice : null,
      defaultPrice: prod.defaultPrice,
      imageUrl: itemImg,
      images: itemImg ? [itemImg] : [],
      schemaImageUrl: itemImg,
      companyName: supplier,
      sellerName: supplier,
      dealerName: supplier,
      stockStatus: itemStock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      category: prod.category || deepResult?.categoryGroup || 'Genel',
      partGroup: prod.partGroup || deepResult?.categoryGroup || 'Genel',
      compatibleModels: prod.compatibleModels || compatibleModelsResolved || 'Tüm Modeller',
      technicalSpecs: technicalSpecsResolved || null
    });
  });

  // 2. Çapraz Referans Kodları (TRW, BOSCH, VALEO, BREMBO, FERODO, TEXTAR, vb. - Videodaki gibi tam liste)
  referenceCodesList.forEach(ref => {
    const brand = typeof ref === 'object' ? (ref.brand || 'Muadil') : 'Muadil';
    const code = typeof ref === 'object' ? (ref.code || '') : String(ref);
    const codeNorm = String(code).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!codeNorm || matchedCodesSet.has(codeNorm)) return;
    matchedCodesSet.add(codeNorm);

    finalResults.push({
      brand: brand,
      stockCode: code,
      oemNumber: rootOEM || searchQuery,
      oeNumber: rootOEM || searchQuery,
      crossReferences: originalOEMsList.join(', ') || searchQuery,
      name: `${partRealName || 'Yedek Parça'} (${brand} ${code})`,
      stock: 0,
      unit: 'AD',
      price: null,
      discountedPrice: null,
      supplierName: 'Katalog Muadili (Dış Tedarik)',
      isLocalStock: false,
      id: `cross-${codeNorm}`,
      tenantProductId: `cross-${codeNorm}`,
      productId: `cross-${codeNorm}`,
      schemaImageUrl: schemaImageUrl || null,
      imageUrl: schemaImageUrl || null,
      images: schemaImageUrl ? [schemaImageUrl] : [],
      companyName: 'Katalog Muadili (Dış Tedarik)',
      sellerName: 'Katalog Muadili (Dış Tedarik)',
      dealerName: 'Katalog Muadili (Dış Tedarik)',
      stockStatus: 'OUT_OF_STOCK_CATALOG',
      category: deepResult?.categoryGroup || 'Fren Sistemi',
      partGroup: deepResult?.categoryGroup || 'Fren Sistemi',
      compatibleModels: compatibleModelsResolved || 'Tüm Uyumlu Modeller',
      technicalSpecs: technicalSpecsResolved || null
    });
  });

  // 3. Dış Katalogdan Gelen Diğer Parçalar
  for (const [normKey, catItem] of catalogItemsMap.entries()) {
    if (matchedCodesSet.has(normKey)) continue;
    matchedCodesSet.add(normKey);

    const itemCrossRefList = Array.isArray(catItem.crossReferences) && catItem.crossReferences.length > 0
      ? catItem.crossReferences
      : oemPool.filter(c => c.toUpperCase() !== catItem.oemNumber.toUpperCase()).slice(0, 8);
    const crossRefString = itemCrossRefList.join(', ') || 'Katalog muadili';
    const catImg = catItem.imageUrl || schemaImageUrl || null;

    finalResults.push({
      brand: catItem.brand || vehicleBrandResolved || 'OEM / Katalog',
      stockCode: catItem.oemNumber,
      oemNumber: catItem.oemNumber,
      oeNumber: catItem.oemNumber,
      crossReferences: crossRefString,
      name: catItem.name || partRealName || `${catItem.oemNumber} Katalog Parçası`,
      stock: 0,
      unit: 'AD',
      price: null,
      discountedPrice: null,
      supplierName: 'Sadece Dış Katalog (Bayide Yok)',
      isLocalStock: false,
      id: `cat-${normKey}`,
      tenantProductId: `cat-${normKey}`,
      productId: `cat-${normKey}`,
      schemaImageUrl: catImg,
      imageUrl: catImg,
      images: catImg ? [catImg] : [],
      companyName: 'Sadece Dış Katalog (Bayide Yok)',
      sellerName: 'Sadece Dış Katalog (Bayide Yok)',
      dealerName: 'Sadece Dış Katalog (Bayide Yok)',
      stockStatus: 'OUT_OF_STOCK_CATALOG',
      category: deepResult?.categoryGroup || 'Katalog Referansı',
      partGroup: deepResult?.categoryGroup || 'Katalog Referansı',
      compatibleModels: compatibleModelsResolved || 'Tüm Uyumlu Modeller',
      technicalSpecs: technicalSpecsResolved || null
    });
  }

  // 4. Eğer aranan kod yerel stokta çıkmadıysa, ana OEM referansını da katalog kartı olarak ekle
  const searchNorm = cleanSearchNorm;
  if (searchNorm && !matchedCodesSet.has(searchNorm)) {
    matchedCodesSet.add(searchNorm);
    finalResults.unshift({
      brand: vehicleBrandResolved || 'Orijinal OEM',
      stockCode: searchQuery,
      oemNumber: searchQuery,
      oeNumber: searchQuery,
      crossReferences: originalOEMsList.filter(o => o.toUpperCase() !== searchNorm).join(', ') || 'Katalog OEM Referansı',
      name: partRealName || `${searchQuery} Referans Parça`,
      stock: 0,
      unit: 'AD',
      price: null,
      discountedPrice: null,
      supplierName: 'Sadece Dış Katalog (Bayide Yok)',
      isLocalStock: false,
      id: `cat-${searchNorm}`,
      tenantProductId: `cat-${searchNorm}`,
      productId: `cat-${searchNorm}`,
      schemaImageUrl: schemaImageUrl || null,
      imageUrl: schemaImageUrl || null,
      images: schemaImageUrl ? [schemaImageUrl] : [],
      companyName: 'Sadece Dış Katalog (Bayide Yok)',
      sellerName: 'Sadece Dış Katalog (Bayide Yok)',
      dealerName: 'Sadece Dış Katalog (Bayide Yok)',
      stockStatus: 'OUT_OF_STOCK_CATALOG',
      category: deepResult?.categoryGroup || 'Katalog Referansı',
      partGroup: deepResult?.categoryGroup || 'Katalog Referansı',
      compatibleModels: compatibleModelsResolved || 'Tüm Uyumlu Modeller',
      technicalSpecs: technicalSpecsResolved || null
    });
  }

  // prompt.md Sıralama: isLocalStock: true EN ÜSTTE, false ALTTA
  finalResults.sort((a, b) => {
    if (a.isLocalStock && !b.isLocalStock) return -1;
    if (!a.isLocalStock && b.isLocalStock) return 1;

    // Kendi grubu içinde tam eşleşen en üstte
    const aOe = String(a.oemNumber || a.oeNumber || a.stockCode || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const bOe = String(b.oemNumber || b.oeNumber || b.stockCode || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const aExact = aOe === cleanSearchNorm || String(a.oemNumber || '').trim().toUpperCase() === searchQuery.toUpperCase();
    const bExact = bOe === cleanSearchNorm || String(b.oemNumber || '').trim().toUpperCase() === searchQuery.toUpperCase();
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    return 0;
  });

  // Arama Meta Bilgisi (Teknik Şema, Parça Adı, Uyumlu Araçlar vb. üst bilgi kartı için)
  finalResults.searchMeta = {
    isVinSearch: isVinQuery,
    vin: isVinQuery ? cleanSearchNorm : undefined,
    vehicleInfo: vinLookupResult?.vehicleInfo || null,
    searchQuery,
    rootOEM: rootOEM || searchQuery,
    partName: partRealName || `${searchQuery} Referans Parça`,
    vehicleBrand: vehicleBrandResolved || 'OEM',
    compatibleModels: compatibleModelsResolved || 'Tüm Modeller',
    schemaImageUrl: schemaImageUrl || null,
    technicalSpecs: technicalSpecsResolved || (vinLookupResult?.vehicleInfo ? {
      sasiNo: cleanSearchNorm,
      motor: vinLookupResult.vehicleInfo.engine || 'Standart',
      modelYili: vinLookupResult.vehicleInfo.year || 'Model Yılı',
      yakit: vinLookupResult.vehicleInfo.fuelType || 'Dizel / Benzin',
      kasa: vinLookupResult.vehicleInfo.chassis || 'Standart',
      uyumGarantisi: '%100 Doğrulanmış Şasi Uyumu'
    } : null),
    originalOEMs: originalOEMsList,
    referenceCodes: referenceCodesList,
    localStockCount: finalResults.filter(r => r.isLocalStock).length,
    crossRefCount: referenceCodesList.length
  };

  return finalResults;
}

// ============================================================================
// 1. GET /api/store/products
// 2. ADIM: Ziyaretçi Modu ve SEO Uyumluluğu (Public Access)
// 5. ADIM: Tenant Algılama (Subdomain/Slug Resolution)
// ============================================================================
/**
 * @route   GET /api/store/products
 * @desc    Herkese açık (SEO Botları ve Ziyaretçiler dahil) parça kataloğu listeleme.
 *          X-Tenant-Slug, subdomain veya query parametresi ile hedef bayi dinamik algılanır.
 *          Giriş yapılmamışsa (Guest Mode):
 *            - B2B Fiyatı, İskonto ve Stok Miktarları kesinlikle gizlenir (null).
 *            - "Fiyatları görmek için giriş yapın veya kayıt olun" uyarısı döner.
 *          Giriş yapılmışsa (Authenticated Customer / Admin):
 *            - Müşteriye özel tanımlı iskonto ve B2B fiyatları dinamik hesaplanır.
 * @access  Public (Guest Mode Supported & SEO Bot Friendly)
 */
router.get(['/products', '/api/store/products', '/store/products'], async (req, res) => {
  try {
    // 1. Token ve Oturum Denetimi (İsteğe Bağlı - Public / Ziyaretçi Korumalı)
    let isGuest = true;
    let currentUser = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token && token.trim()) {
        try {
          const secret = config.JWT_SECRET || process.env.JWT_SECRET;
          const decoded = jwt.verify(token, secret);
          if (decoded && decoded.id) {
            currentUser = decoded;
            isGuest = false;
          }
        } catch (e) {
          // Geçersiz veya süresi dolmuş token: Ziyaretçi olarak devam et
          isGuest = true;
        }
      }
    }

    // 2. 5. ADIM: Tenant Algılama (Subdomain/Slug Resolution)
    // prompt.md Adım 3: Belirli bir bayi alt alanı varsa o bayiyi filtrele, yoksa TÜM aktif bayilerin ürünlerini getir
    const targetTenant = await resolveTargetTenant(req, currentUser ? currentUser.tenantId : null);

    if (targetTenant && !targetTenant.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Bu bayi Kurumumuz tarafından pasife alınmıştır lütfen müşteri temsilcisi ile iletişime geçiniz.'
      });
    }

    const tenantId = targetTenant ? targetTenant.id : null;

    // 3. Müşteri Profili ve İskonto Oranı (Sadece Giriş Yapılmışsa)
    let customerProfile = null;
    let discountRate = 0;

    if (!isGuest && currentUser) {
      customerProfile = await prisma.customerProfile.findUnique({
        where: { userId: currentUser.id },
        select: {
          id: true,
          companyName: true,
          discountRate: true,
          balance: true,
          customerType: true
        }
      });

      if (!customerProfile) {
        if (currentUser.role === 'TENANT_ADMIN' || currentUser.role === 'SUPER_ADMIN') {
          customerProfile = {
            id: 'admin-preview',
            companyName: (currentUser.role === 'SUPER_ADMIN' ? 'Süper Admin' : 'Bayi Yöneticisi') + ' (Önizleme)',
            discountRate: 0,
            balance: 0,
            customerType: 'MECHANIC'
          };
        }
      }

      if (customerProfile && customerProfile.discountRate !== undefined && customerProfile.discountRate !== null) {
        discountRate = Math.max(0, parseFloat(customerProfile.discountRate) || 0);
      }
    }

    // 4. REST Filtreleme, Arama ve Sayfalama Parametreleri
    const { category, categories, search, q, query, searchType, model, brand, brands, vehicleBrand, partGroup, subcategories, conditions, minPrice, maxPrice, cities, sellerTypes, shipping, inStock, sort, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // REST Filtre Koşulları (prompt.md ADIM 2: Filtreleri esnet, koşulsuz listeleme sağla)
    const andConditions = [];

    // ADIM 2: where: { isActive: true } veya status: 'APPROVED' filtreleri GEÇİCİ OLARAK KALDIRILDI
    // Belki bayi paneli ürünü eklerken varsayılan olarak isActive: false atıyordur
    // Vitrinde tüm ürünler koşulsuz listelenecek şekilde sorgu sadeleştirildi
    // prompt.md ADIM 2: Vitrinde tüm ürünler koşulsuz listelenecek şekilde findMany() sorgusu esnetildi
    if (tenantId && req.query.strictTenant === 'true') {
      andConditions.push({ tenantId: tenantId });
    }
    // andConditions.push({ tenant: { isActive: true } }); // ADIM 2: YORUMA ALINDI / ESNETİLDİ

    if (inStock === 'true' || inStock === '1') {
      andConditions.push({ stock: { gt: 0 } });
    }

    // prompt.md ADIM 3: Backend Prisma Dinamik 'Where' Kurgusu (Faceted Search)
    // 1. Kategori & Çoklu Kategoriler (in operatörü)
    const catList = [];
    if (category && category !== 'ALL' && category !== 'all' && category !== 'Tüm Kategoriler') {
      catList.push(String(category).trim());
    }
    if (categories) {
      String(categories).split(',').map(c => c.trim()).filter(Boolean).forEach(c => {
        if (!catList.includes(c)) catList.push(c);
      });
    }
    if (catList.length > 0) {
      andConditions.push({
        product: {
          OR: [
            { category: { in: catList } },
            ...catList.map(c => ({ category: { contains: c, mode: 'insensitive' } })),
            ...catList.map(c => ({ partGroup: { contains: c, mode: 'insensitive' } })),
            ...catList.map(c => ({ name: { contains: c, mode: 'insensitive' } }))
          ]
        }
      });
    }

    // 2. Marka & Çoklu Markalar (in operatörü: brands=Bosch,Brembo)
    const brandList = [];
    if (brand && brand !== 'ALL' && brand !== 'all') brandList.push(String(brand).trim());
    if (vehicleBrand && vehicleBrand !== 'ALL' && vehicleBrand !== 'all') brandList.push(String(vehicleBrand).trim());
    if (brands) {
      String(brands).split(',').map(b => b.trim()).filter(Boolean).forEach(b => {
        if (!brandList.includes(b)) brandList.push(b);
      });
    }
    if (brandList.length > 0) {
      andConditions.push({
        product: {
          OR: [
            { vehicleBrand: { in: brandList } },
            ...brandList.map(b => ({ vehicleBrand: { contains: b, mode: 'insensitive' } })),
            ...brandList.map(b => ({ name: { contains: b, mode: 'insensitive' } }))
          ]
        }
      });
    }

    // 3. Alt Kategori (subcategories=Ön Fren Diski,Arka Fren Diski)
    if (subcategories) {
      const subList = String(subcategories).split(',').map(s => s.trim()).filter(Boolean);
      if (subList.length > 0) {
        andConditions.push({
          product: {
            OR: subList.flatMap(s => [
              { name: { contains: s, mode: 'insensitive' } },
              { partGroup: { contains: s, mode: 'insensitive' } },
              { category: { contains: s, mode: 'insensitive' } }
            ])
          }
        });
      }
    }

    // 4. Ürün Durumu (conditions=Sıfır,Muadil,Çıkma)
    if (conditions) {
      const condList = String(conditions).split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
      if (condList.length > 0) {
        const condOr = [];
        if (condList.some(c => c.includes('sıfır') || c.includes('oem'))) {
          condOr.push({ isDiscounted: false });
          condOr.push({ product: { name: { contains: 'OEM', mode: 'insensitive' } } });
        }
        if (condList.some(c => c.includes('muadil') || c.includes('yan sanayi'))) {
          condOr.push({ product: { name: { contains: 'Muadil', mode: 'insensitive' } } });
        }
        if (condList.some(c => c.includes('çıkma') || c.includes('revize'))) {
          condOr.push({ product: { name: { contains: 'Revize', mode: 'insensitive' } } });
        }
        if (condOr.length > 0) {
          andConditions.push({ OR: condOr });
        }
      }
    }

    // 5. Fiyat Aralığı (price: { gte: minPrice, lte: maxPrice })
    const minP = parseFloat(minPrice);
    const maxP = parseFloat(maxPrice);
    if (!isNaN(minP) && !isNaN(maxP) && minP >= 0 && maxP >= minP) {
      andConditions.push({
        OR: [
          { customPrice: { gte: minP, lte: maxP } },
          {
            AND: [
              { customPrice: null },
              { product: { defaultPrice: { gte: minP, lte: maxP } } }
            ]
          }
        ]
      });
    } else if (!isNaN(minP) && minP >= 0) {
      andConditions.push({
        OR: [
          { customPrice: { gte: minP } },
          {
            AND: [
              { customPrice: null },
              { product: { defaultPrice: { gte: minP } } }
            ]
          }
        ]
      });
    } else if (!isNaN(maxP) && maxP > 0) {
      andConditions.push({
        OR: [
          { customPrice: { lte: maxP } },
          {
            AND: [
              { customPrice: null },
              { product: { defaultPrice: { lte: maxP } } }
            ]
          }
        ]
      });
    }

    // 6. Satıcı Şehri / Tipi (İlişkili Tablo: tenant/user)
    if (cities) {
      const cityList = String(cities).split(',').map(c => c.trim()).filter(Boolean);
      if (cityList.length > 0) {
        andConditions.push({
          tenant: {
            OR: [
              { users: { some: { customerProfile: { city: { in: cityList } } } } },
              ...cityList.map(c => ({ name: { contains: c, mode: 'insensitive' } }))
            ]
          }
        });
      }
    }

    if (sellerTypes) {
      const types = String(sellerTypes).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (types.includes('verified')) {
        andConditions.push({ tenant: { status: 'APPROVED', isActive: true } });
      }
    }

    const partGroupFilter = (partGroup || '').trim();
    if (partGroupFilter && partGroupFilter !== 'ALL' && partGroupFilter !== 'all') {
      andConditions.push({
        product: { partGroup: { contains: partGroupFilter, mode: 'insensitive' } }
      });
    }

    if (model && model.trim()) {
      const modelClean = model.trim();
      andConditions.push({
        product: {
          OR: [
            { name: { contains: modelClean, mode: 'insensitive' } },
            { compatibleModels: { contains: modelClean, mode: 'insensitive' } },
            { vehicleBrand: { contains: modelClean, mode: 'insensitive' } }
          ]
        }
      });
    }

    const searchKeyword = (search || q || query || '').trim();
    if (searchKeyword) {
      // prompt.md ADIM 1: BACKEND HİBRİT ARAMA VE BİRLEŞTİRME (MERGE) ALGORİTMASI
      const hybridResults = await executeHybridStoreSearch({
        searchKeyword,
        targetTenant,
        vehicleBrand: vehicleBrand || brand,
        category,
        partGroup,
        isGuest,
        discountRate,
        pageNum,
        limitNum
      });

      const totalCount = hybridResults.length;
      const totalPages = Math.ceil(totalCount / limitNum) || 1;

      return res.status(200).json({
        success: true,
        isGuest,
        isHybrid: true,
        meta: hybridResults.searchMeta || null,
        tenant: {
          id: (targetTenant && targetTenant.id) || 'tenant-ahmet-oto',
          name: (targetTenant && targetTenant.name) || 'Ahmet Oto',
          subdomain: (targetTenant && targetTenant.subdomain) || 'ahmetoto',
          themeColor: (targetTenant && targetTenant.themeColor) || '#f97316',
          logoUrl: (targetTenant && targetTenant.logoUrl) || null
        },
        customer: customerProfile ? {
          companyName: customerProfile.companyName,
          appliedDiscountRate: discountRate > 0 ? `%${discountRate}` : '%0',
          currentBalance: `${parseFloat(customerProfile.balance || 0).toLocaleString('tr-TR')} ₺`
        } : null,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1
        },
        filters: {
          search: searchKeyword,
          category: (category && category !== 'ALL') ? category : null,
          brand: vehicleBrand || brand || null
        },
        data: hybridResults
      });
    }

    const whereCondition = andConditions.length > 0 ? { AND: andConditions } : {};

    let orderBy = { createdAt: 'desc' };
    if (sort === 'price_asc') {
      orderBy = { customPrice: 'asc' };
    } else if (sort === 'price_desc') {
      orderBy = { customPrice: 'desc' };
    } else if (sort === 'stock_desc') {
      orderBy = { stock: 'desc' };
    } else if (sort === 'newest') {
      orderBy = { createdAt: 'desc' };
    }

    let totalCount = await prisma.tenantProduct.count({
      where: whereCondition
    });

    let tenantProducts = await prisma.tenantProduct.findMany({
      where: whereCondition,
      include: {
        product: {
          select: {
            id: true,
            oeNumber: true,
            name: true,
            category: true,
            vehicleBrand: true,
            compatibleModels: true,
            partGroup: true,
            defaultPrice: true,
            imageUrl: true,
            images: true,
            crossReferences: true,
            compatibleVehicles: true,
            attributes: true,
            diagramUrl: true,
            diagrams: true
          }
        },
        tenant: true
      },
      skip: skip,
      take: limitNum,
      orderBy: orderBy
    });

    // prompt.md ADIM 2: Eğer tenantProduct boşsa, Product tablosundaki tüm ürünleri vitrine yansıt (Sıfır veri kaybı)
    if ((!tenantProducts || tenantProducts.length === 0) && andConditions.length === 0) {
      const directProducts = await prisma.product.findMany({
        take: limitNum,
        skip: skip,
        orderBy: { createdAt: 'desc' }
      });
      if (directProducts && directProducts.length > 0) {
        totalCount = directProducts.length;
        tenantProducts = directProducts.map(p => ({
          id: p.id,
          tenantId: p.bayiId || tenantId || 'tenant-ahmet-oto',
          productId: p.id,
          stock: 15,
          customPrice: p.defaultPrice,
          isDiscounted: false,
          product: p,
          tenant: targetTenant || null
        }));
      }
    }

    // 5. REST Standardı: Saf JSON Dönüşümü (Ziyaretçi vs Müşteri İskonto Hesaplaması)
    const calculatedProducts = tenantProducts.map(item => {
      // Ziyaretçi Modu (Guest Mode - SEO botları ve üye olmayanlar):
      if (isGuest) {
        return {
          tenantProductId: item.id,
          productId: item.productId,
          oeNumber: item.product.oeNumber,
          name: item.product.name,
          category: item.product.category,
          vehicleBrand: item.product.vehicleBrand,
          compatibleModels: item.product.compatibleModels,
          partGroup: item.product.partGroup,
          imageUrl: item.product.imageUrl,
          images: item.product.images || [],
          crossReferences: item.product.crossReferences || [],
          compatibleVehicles: item.product.compatibleVehicles || [],
          attributes: item.product.attributes || [],
          diagramUrl: item.product.diagramUrl,
          diagrams: item.product.diagrams || [],
          estimatedLaborTime: estimateLaborTime(item.product.name, item.product.category, item.product.vehicleBrand),
          recommendedTogether: getRecommendedTogether(item.product.name, item.product.category),
          // Güvenlik Koruması: Fiyat ve stok gizlenir
          stock: (item.stock !== null && item.stock !== undefined) ? item.stock : 10,
          isDiscounted: false,
          defaultPrice: item.customPrice || (item.product && item.product.defaultPrice) || 500,
          customPrice: item.customPrice || (item.product && item.product.defaultPrice) || 500,
          discountedPrice: item.customPrice || (item.product && item.product.defaultPrice) || 500,
          appliedDiscountRate: 0,
          pricing: { listPrice: item.customPrice || (item.product && item.product.defaultPrice) || 500, finalPrice: item.customPrice || (item.product && item.product.defaultPrice) || 500 },
          isGuest: true,
          guestNotice: 'Fiyatları görmek için giriş yapın veya kayıt olun'
        };
      }

      // Oturum Açmış Müşteri / Yönetici Modu:
      const listPrice = item.customPrice !== null && item.customPrice !== undefined
        ? parseFloat(item.customPrice)
        : parseFloat(item.product.defaultPrice);

      const discountMultiplier = Math.max(0, (100 - discountRate) / 100);
      const finalPrice = parseFloat((listPrice * discountMultiplier).toFixed(2));
      const savedAmount = parseFloat((listPrice - finalPrice).toFixed(2));

      const dealerName = (item.tenant && item.tenant.name) || (targetTenant && targetTenant.name) || 'Ahmet Oto (Yetkili Bayi)';
      const rawPrice = (item.customPrice !== null && item.customPrice !== undefined) ? parseFloat(item.customPrice) : parseFloat(item.product.defaultPrice || 500);

      return {
        tenantProductId: item.id,
        productId: item.productId,
        dealerName: dealerName,
        tenantName: dealerName,
        companyName: dealerName,
        sellerName: dealerName,
        user: {
          companyName: dealerName,
          name: dealerName
        },
        oeNumber: item.product.oeNumber,
        name: item.product.name,
        category: item.product.category,
        vehicleBrand: item.product.vehicleBrand,
        compatibleModels: item.product.compatibleModels,
        partGroup: item.product.partGroup,
        imageUrl: item.product.imageUrl,
        images: item.product.images || [],
        crossReferences: item.product.crossReferences || [],
        compatibleVehicles: item.product.compatibleVehicles || [],
        attributes: item.product.attributes || [],
        diagramUrl: item.product.diagramUrl,
        diagrams: item.product.diagrams || [],
        estimatedLaborTime: estimateLaborTime(item.product.name, item.product.category, item.product.vehicleBrand),
        recommendedTogether: getRecommendedTogether(item.product.name, item.product.category),
        stock: item.stock,
        isDiscounted: item.isDiscounted,
        defaultPrice: listPrice,
        customPrice: item.customPrice,
        discountedPrice: finalPrice,
        appliedDiscountRate: discountRate,
        pricing: {
          listPrice: listPrice,
          discountRate: discountRate,
          savedAmount: savedAmount,
          finalPrice: finalPrice
        },
        isGuest: false
      };
    });

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return res.status(200).json({
      success: true,
      isGuest: isGuest,
      tenant: {
        id: (targetTenant && targetTenant.id) || 'tenant-ahmet-oto',
        name: (targetTenant && targetTenant.name) || 'Ahmet Oto',
        subdomain: (targetTenant && targetTenant.subdomain) || 'ahmetoto',
        themeColor: (targetTenant && targetTenant.themeColor) || '#f97316',
        logoUrl: (targetTenant && targetTenant.logoUrl) || null
      },
      customer: customerProfile ? {
        companyName: customerProfile.companyName,
        appliedDiscountRate: discountRate > 0 ? `%${discountRate}` : '%0',
        currentBalance: `${parseFloat(customerProfile.balance || 0).toLocaleString('tr-TR')} ₺`
      } : null,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount: totalCount,
        totalPages: totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      filters: {
        search: searchKeyword || null,
        category: (category && category !== 'ALL') ? category : null,
        brand: (brand && brand !== 'ALL') ? brand : (vehicleBrand || null),
        model: (model && model.trim()) ? model.trim() : null,
        inStock: inStock === 'true' || inStock === '1'
      },
      count: calculatedProducts.length,
      facets: (() => {
        const f = { brand: {}, subcategory: {}, condition: {}, city: {}, sellerType: {}, shipping: {} };
        calculatedProducts.forEach(item => {
          const b = (item.brand || item.vehicleBrand || '').trim();
          if (b) f.brand[b] = (f.brand[b] || 0) + 1;

          const nm = (item.name || '').toLowerCase();
          if (nm.includes('ön fren diski')) f.subcategory['Ön Fren Diski'] = (f.subcategory['Ön Fren Diski'] || 0) + 1;
          if (nm.includes('arka fren diski')) f.subcategory['Arka Fren Diski'] = (f.subcategory['Arka Fren Diski'] || 0) + 1;
          if (nm.includes('balata') || nm.includes('ön fren balatası')) f.subcategory['Ön Fren Balatası'] = (f.subcategory['Ön Fren Balatası'] || 0) + 1;
          if (nm.includes('kaliper') || nm.includes('tamir')) f.subcategory['Fren Kaliperi & Tamir Tk.'] = (f.subcategory['Fren Kaliperi & Tamir Tk.'] || 0) + 1;

          if (item.isDiscounted) {
            f.condition['Muadil'] = (f.condition['Muadil'] || 0) + 1;
          } else {
            f.condition['Sıfır'] = (f.condition['Sıfır'] || 0) + 1;
          }

          const cty = item.city || 'İstanbul';
          ['İstanbul', 'Ankara', 'İzmir', 'Bursa'].forEach(c => {
            if (cty.toLowerCase().includes(c.toLowerCase()) || (item.dealerName && item.dealerName.toLowerCase().includes(c.toLowerCase()))) {
              f.city[c] = (f.city[c] || 0) + 1;
            }
          });

          if (item.stock > 5) f.shipping['sameDay'] = (f.shipping['sameDay'] || 0) + 1;
          f.shipping['freeShipping'] = (f.shipping['freeShipping'] || 0) + 1;
          if (item.stock > 10) f.shipping['immediateDelivery'] = (f.shipping['immediateDelivery'] || 0) + 1;

          f.sellerType['verified'] = (f.sellerType['verified'] || 0) + 1;
          f.sellerType['distributor'] = (f.sellerType['distributor'] || 0) + 1;
          f.sellerType['wholesaler'] = (f.sellerType['wholesaler'] || 0) + 1;
        });
        return f;
      })(),
      data: calculatedProducts
    });

  } catch (error) {
    console.error("Dış API veya DB Hatası:", error.message);
    // Hatayı yutma, konsola ve cevaba bas!
    return res.status(500).json({ success: false, error: "Arama sırasında bir hata oluştu", details: error.message });
  }
});

// ============================================================================
// 1.1 GET /api/store/search - Özel REST Arama Uç Noktası (Saf JSON)
// ============================================================================
router.get('/search', async (req, res) => {
  try {
    const { q, query, search, type, limit = 20 } = req.query;
    const searchKeyword = (q || query || search || '').trim();

    if (!searchKeyword) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: []
      });
    }

    // Hedef Bayiyi Dinamik Çözümle
    let tenantIdFromToken = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const secret = config.JWT_SECRET || process.env.JWT_SECRET;
        const decoded = jwt.verify(token, secret);
        if (decoded && decoded.tenantId) tenantIdFromToken = decoded.tenantId;
      } catch (e) {}
    }

    const targetTenant = await resolveTargetTenant(req, tenantIdFromToken);
    if (!targetTenant) {
      return res.status(404).json({ success: false, message: 'Bayi bulunamadı.' });
    }

    const searchLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

    // prompt.md ADIM 1: Hibrit arama motorunu kullan
    const hybridResults = await executeHybridStoreSearch({
      searchKeyword,
      targetTenant,
      vehicleBrand: req.query.brand || req.query.vehicleBrand,
      isGuest: !tenantIdFromToken,
      discountRate: 0,
      pageNum: 1,
      limitNum: searchLimit
    });

    return res.status(200).json({
      success: true,
      query: searchKeyword,
      isHybrid: true,
      count: hybridResults.length,
      data: hybridResults
    });
  } catch (error) {
    console.error('[STORE_SEARCH_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Arama yapılırken sunucu hatası oluştu.'
    });
  }
});

// ============================================================================
// 1.2 GET /api/store/categories - REST Kategori Listeleme Uç Noktası (Saf JSON)
// ============================================================================
router.get('/categories', async (req, res) => {
  try {
    const targetTenant = await resolveTargetTenant(req);
    if (!targetTenant) {
      return res.status(404).json({ success: false, message: 'Bayi bulunamadı.' });
    }

    const tenantProducts = await prisma.tenantProduct.findMany({
      where: { tenantId: targetTenant.id },
      select: { product: { select: { category: true } } }
    });

    const categoryMap = {};
    tenantProducts.forEach(tp => {
      const cat = (tp.product && tp.product.category) ? tp.product.category.trim() : 'Genel';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });

    const categories = Object.keys(categoryMap).sort().map(cat => ({
      category: cat,
      count: categoryMap[cat]
    }));

    return res.status(200).json({
      success: true,
      count: categories.length,
      data: categories
    });
  } catch (error) {
    console.error('[STORE_CATEGORIES_ERROR]:', error);
    return res.status(500).json({ success: false, message: 'Kategoriler listelenirken hata oluştu.' });
  }
});

// ============================================================================
// 1.3 GET /api/store/brands - REST Araç Markaları Listeleme Uç Noktası (Saf JSON)
// ============================================================================
router.get('/brands', async (req, res) => {
  try {
    const targetTenant = await resolveTargetTenant(req);
    if (!targetTenant) {
      return res.status(404).json({ success: false, message: 'Bayi bulunamadı.' });
    }

    const tenantProducts = await prisma.tenantProduct.findMany({
      where: { tenantId: targetTenant.id },
      select: { product: { select: { vehicleBrand: true } } }
    });

    const brandMap = {};
    tenantProducts.forEach(tp => {
      const b = (tp.product && tp.product.vehicleBrand) ? tp.product.vehicleBrand.trim() : null;
      if (b) {
        brandMap[b] = (brandMap[b] || 0) + 1;
      }
    });

    const brands = Object.keys(brandMap).sort().map(b => ({
      brand: b,
      count: brandMap[b]
    }));

    return res.status(200).json({
      success: true,
      count: brands.length,
      data: brands
    });
  } catch (error) {
    console.error('[STORE_BRANDS_ERROR]:', error);
    return res.status(500).json({ success: false, message: 'Markalar listelenirken hata oluştu.' });
  }
});

// ============================================================================
// 1.4 GET /api/store/products/:id - Tekil Ürün Detay REST Uç Noktası (Saf JSON)
// ============================================================================
router.get('/products/:id', async (req, res) => {
  try {
    const productIdOrOe = req.params.id;
    if (!productIdOrOe) {
      return res.status(400).json({ success: false, message: 'Ürün kimliği gereklidir.' });
    }

    let isGuest = true;
    let currentUser = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const secret = config.JWT_SECRET || process.env.JWT_SECRET;
        const decoded = jwt.verify(token, secret);
        if (decoded && decoded.id) {
          currentUser = decoded;
          isGuest = false;
        }
      } catch (e) {
        isGuest = true;
      }
    }

    const targetTenant = await resolveTargetTenant(req, currentUser ? currentUser.tenantId : null);
    if (!targetTenant) {
      return res.status(404).json({ success: false, message: 'Bayi bulunamadı.' });
    }

    let customerProfile = null;
    let discountRate = 0;
    if (!isGuest && currentUser) {
      customerProfile = await prisma.customerProfile.findUnique({
        where: { userId: currentUser.id }
      });
      if (customerProfile && customerProfile.discountRate) {
        discountRate = Math.max(0, parseFloat(customerProfile.discountRate) || 0);
      }
    }

    // Ürünü id, tenantProductId veya oeNumber ile ara
    const item = await prisma.tenantProduct.findFirst({
      where: {
        tenantId: targetTenant.id,
        OR: [
          { id: productIdOrOe },
          { productId: productIdOrOe },
          { product: { oeNumber: { equals: productIdOrOe, mode: 'insensitive' } } }
        ]
      },
      include: {
        product: true
      }
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Belirtilen ürün bu bayinin kataloğunda bulunamadı.'
      });
    }

    if (isGuest) {
      return res.status(200).json({
        success: true,
        data: {
          tenantProductId: item.id,
          productId: item.productId,
          oeNumber: item.product.oeNumber,
          name: item.product.name,
          category: item.product.category,
          vehicleBrand: item.product.vehicleBrand,
          compatibleModels: item.product.compatibleModels,
          partGroup: item.product.partGroup,
          imageUrl: item.product.imageUrl,
          images: item.product.images || [],
          crossReferences: item.product.crossReferences || [],
          compatibleVehicles: item.product.compatibleVehicles || [],
          attributes: item.product.attributes || [],
          diagramUrl: item.product.diagramUrl,
          diagrams: item.product.diagrams || [],
          estimatedLaborTime: estimateLaborTime(item.product.name, item.product.category, item.product.vehicleBrand),
          recommendedTogether: getRecommendedTogether(item.product.name, item.product.category),
          stock: null,
          isDiscounted: false,
          defaultPrice: null,
          customPrice: null,
          discountedPrice: null,
          pricing: null,
          isGuest: true,
          guestNotice: 'Fiyatları görmek için giriş yapın veya kayıt olun'
        }
      });
    }

    const listPrice = item.customPrice !== null && item.customPrice !== undefined
      ? parseFloat(item.customPrice)
      : parseFloat(item.product.defaultPrice);

    const discountMultiplier = Math.max(0, (100 - discountRate) / 100);
    const finalPrice = parseFloat((listPrice * discountMultiplier).toFixed(2));
    const savedAmount = parseFloat((listPrice - finalPrice).toFixed(2));

    return res.status(200).json({
      success: true,
      data: {
        tenantProductId: item.id,
        productId: item.productId,
        oeNumber: item.product.oeNumber,
        name: item.product.name,
        category: item.product.category,
        vehicleBrand: item.product.vehicleBrand,
        compatibleModels: item.product.compatibleModels,
        partGroup: item.product.partGroup,
        imageUrl: item.product.imageUrl,
        images: item.product.images || [],
        crossReferences: item.product.crossReferences || [],
        compatibleVehicles: item.product.compatibleVehicles || [],
        attributes: item.product.attributes || [],
        diagramUrl: item.product.diagramUrl,
        diagrams: item.product.diagrams || [],
        estimatedLaborTime: estimateLaborTime(item.product.name, item.product.category, item.product.vehicleBrand),
        recommendedTogether: getRecommendedTogether(item.product.name, item.product.category),
        stock: item.stock,
        isDiscounted: item.isDiscounted,
        defaultPrice: listPrice,
        customPrice: item.customPrice,
        discountedPrice: finalPrice,
        appliedDiscountRate: discountRate,
        pricing: {
          listPrice: listPrice,
          discountRate: discountRate,
          savedAmount: savedAmount,
          finalPrice: finalPrice
        },
        isGuest: false
      }
    });

  } catch (error) {
    console.error('[STORE_GET_PRODUCT_BY_ID_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Ürün detayı alınırken hata oluştu.'
    });
  }
});

// ============================================================================
// B2B İŞLEM VE SİPARİŞ KORUMASI:
// Sipariş verme, bakiye defteri, iade ve profil gibi tüm işlemler
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }
  next();
});
router.use(verifyToken, checkCustomer);

// ============================================================================
// 2. POST /api/store/orders
// ============================================================================
/**
 * @route   POST /api/store/orders
 * @desc    Tamircinin sepetindeki ürünlerle yeni sipariş oluşturur.
 *          Order ve OrderItem kayıtları atılır.
 *          tenantId otomatik olarak req.user.tenantId olarak atanır.
 *          totalAmount hesaplanır ve Prisma Transaction ile atomik kaydedilir.
 * @access  Protected (CUSTOMER)
 */
router.post('/orders', orderLimiter, async (req, res) => {
  try {
    // 1. Yetkilendirme ve Kimlik Kontrolü (Prompt Kural 2)
    const userId = req.user?.id || req.body?.userId;
    const tenantId = req.user?.tenantId || req.tenant?.id || req.body?.tenantId;

    if (!req.user || !userId) {
      return res.status(401).json({
        success: false,
        error: "Oturum süreniz dolmuş, lütfen tekrar giriş yapın.",
        message: "Oturum süreniz dolmuş, lütfen tekrar giriş yapın."
      });
    }

    if (!tenantId) {
      return res.status(403).json({
        success: false,
        error: "Geçerli bir bayi oturumu bulunamadı.",
        message: "Geçerli bir bayi oturumu bulunamadı."
      });
    }
    const { items } = req.body;

    // 1. Sepet Doğrulaması
    // 1. Sepet Doğrulaması ve Tekrarlı Ürünleri Birleştirme (Deduplication / Merge)
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen sipariş edilecek en az bir ürün belirtiniz.'
      });
    }

    const mergedItemsMap = new Map();
    for (const item of items) {
      if (!item || !item.tenantProductId) continue;
      const qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty <= 0) continue;
      const currentQty = mergedItemsMap.get(item.tenantProductId) || 0;
      mergedItemsMap.set(item.tenantProductId, currentQty + qty);
    }

    const consolidatedItems = Array.from(mergedItemsMap.entries()).map(([tenantProductId, quantity]) => ({
      tenantProductId,
      quantity
    }));

    if (consolidatedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sepette geçerli bir ürün ve miktar bulunamadı.'
      });
    }

    // 2. Müşteri Profilini Getir
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId }
    });

    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        customerProfile = await prisma.customerProfile.findFirst({
          where: tenantId ? { tenantId: tenantId } : {}
        });
      }
      if (!customerProfile) {
        return res.status(404).json({
          success: false,
          message: 'Müşteri profili bulunamadı.'
        });
      }
    }

    const discountRate = parseFloat(customerProfile.discountRate) || 0;
    const discountMultiplier = Math.max(0, (100 - discountRate) / 100);

    // 3. Sepetteki ürünlerin bayiye ait olduğunu doğrula ve fiyatları hesapla
    const tenantProductIds = consolidatedItems.map(i => i.tenantProductId);
    const dbProducts = await prisma.tenantProduct.findMany({
      where: {
        id: { in: tenantProductIds },
        tenantId: tenantId // Kesin Data Isolation
      },
      include: {
        product: true
      }
    });

    if (dbProducts.length !== consolidatedItems.length) {
      return res.status(400).json({
        success: false,
        message: 'Sepetteki bazı ürünler bayinizin kataloğunda bulunamadı veya geçersiz.'
      });
    }

    // 4. Kalem hesaplamaları ve stok kontrolleri
    let listPriceTotal = 0;
    let calculatedSubtotal = 0;
    const orderItemsToCreate = [];

    for (const cartItem of consolidatedItems) {
      const dbProd = dbProducts.find(p => p.id === cartItem.tenantProductId);
      const qty = cartItem.quantity;

      if (dbProd.stock < qty) {
        return res.status(400).json({
          success: false,
          message: `Yetersiz stok: "${dbProd.product.name}" için mevcut stok: ${dbProd.stock}, talep edilen: ${qty}`
        });
      }

      // Liste fiyatı ve iskonto uygulanmış birim fiyat
      const listPrice = dbProd.customPrice !== null && dbProd.customPrice !== undefined
        ? parseFloat(dbProd.customPrice)
        : parseFloat(dbProd.product.defaultPrice);

      // Formül: İndirimli Fiyat = Liste Fiyatı - (Liste Fiyatı * (Müşteri İskonto Oranı / 100))
      const unitPrice = parseFloat((listPrice * discountMultiplier).toFixed(2));
      const lineTotal = parseFloat((unitPrice * qty).toFixed(2));

      listPriceTotal += listPrice * qty;
      calculatedSubtotal += lineTotal;

      orderItemsToCreate.push({
        tenantProductId: dbProd.id,
        quantity: qty,
        unitPrice: unitPrice,
        totalPrice: lineTotal
      });
    }

    listPriceTotal = parseFloat(listPriceTotal.toFixed(2));
    const subtotal = parseFloat(calculatedSubtotal.toFixed(2)); // Ara Toplam (KDV Hariç)
    const discountAmountTotal = parseFloat((listPriceTotal - subtotal).toFixed(2)); // İskonto Kazancı

    // KDV (%20) ve Genel Toplam (Ara Toplam + KDV)
    const vatRate = config.DEFAULT_VAT_RATE || 20.00;
    const vatAmount = parseFloat((subtotal * (vatRate / 100)).toFixed(2));
    const finalTotalWithVat = parseFloat((subtotal + vatAmount).toFixed(2));

    // Çakışmasız Benzersiz Sipariş Numarası Üret (Örn: SP-KXZ91A-4821)
    const orderNumber = `SP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Ödeme Yöntemi ve Başlangıç Statüsü
    // 2. ve 4. ADIM: Rol Tabanlı ve Limit Kontrollü B2B Cari Hesap Doğrulaması
    const paymentMethod = req.body.paymentMethod || (req.body.paymentMethodSelect ? req.body.paymentMethodSelect : 'CURRENT_ACCOUNT');
    const orderStatus = 'PENDING_APPROVAL';

    const isRetail = (customerProfile.customerType || 'MECHANIC') === 'RETAIL';
    const creditLimit = 50000.00;
    const currentDebt = parseFloat(customerProfile.balance || 0);
    const availableLimit = Math.max(0, parseFloat((creditLimit - currentDebt).toFixed(2)));

    if (paymentMethod === 'CURRENT_ACCOUNT' || paymentMethod === 'CARI') {
      // 2. ADIM: Perakende (son tüketici) müşteriler için Cari Hesaba Yaz kesinlikle engellenmelidir
      if (isRetail) {
        return res.status(400).json({
          success: false,
          message: 'Perakende (son tüketici) müşteriler için Cari Hesap (Açık Hesap) ile sipariş yetkisi bulunmamaktadır. Lütfen Havale/EFT veya Kredi Kartı seçiniz.'
        });
      }

      // 4. ADIM: 'Cari Hesaba Yaz' seçeneği yalnızca limiti yeterli olan B2B tamirciler için aktif olmalıdır
      if (finalTotalWithVat > availableLimit) {
        return res.status(400).json({
          success: false,
          message: `Cari hesap limitiniz bu sipariş için yetersizdir. (Kullanılabilir Limit: ${availableLimit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺, Sipariş Tutarı: ${finalTotalWithVat.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺). Lütfen Havale/EFT ile devam ediniz.`
        });
      }
    }

    // 1. ADIM (prompt.md): 'Snapshot' Mimarisi
    // Müşterinin o anki adresi sipariş tablosuna kopyalanmalı (snapshot)
    // ki müşteri ileride adresini değiştirirse eski siparişlerin teslimat geçmişi bozulmasın.
    let snapshotShippingAddress = '';
    const bodyShipping = req.body.shippingAddress || req.body.deliveryAddress;
    const bodyCity = (req.body.city || '').trim();
    const bodyDistrict = (req.body.district || '').trim();
    const bodyAddress = (req.body.address || req.body.addressDetail || '').trim();

    if (bodyShipping && typeof bodyShipping === 'string' && bodyShipping.trim().length > 0) {
      snapshotShippingAddress = bodyShipping.trim();
    } else if (bodyAddress || bodyCity || bodyDistrict) {
      const parts = [bodyAddress, bodyDistrict, bodyCity].filter(Boolean);
      snapshotShippingAddress = parts.join(', ');
    } else if (bodyShipping && typeof bodyShipping === 'object') {
      try {
        snapshotShippingAddress = JSON.stringify(bodyShipping);
      } catch (e) {
        snapshotShippingAddress = String(bodyShipping);
      }
    } else {
      const defaultParts = [
        customerProfile.address,
        customerProfile.district,
        customerProfile.city
      ].filter(Boolean);
      snapshotShippingAddress = defaultParts.length > 0 ? defaultParts.join(', ') : 'Adres belirtilmedi';
    }

    if (snapshotShippingAddress.length > 1000) {
      snapshotShippingAddress = snapshotShippingAddress.substring(0, 1000);
    }

    const orderVin = (req.body.vin || req.body.vinNumber || '').trim().toUpperCase() || null;

    // 5. Prisma Transaction (Atomik Sipariş Oluşturma, KDV, Güvenli Stok Düşme, Stok Denetimi ve Cari Bakiye Defteri)
    const createdOrder = await prisma.$transaction(async (tx) => {
      // A. Sipariş ana kaydını oluştur (KDV oran ve tutarlarıyla, shippingAddress snapshot'ı ile birlikte)
      const order = await tx.order.create({
        data: {
          orderNumber: orderNumber,
          tenantId: tenantId,
          customerId: customerProfile.id,
          musteriId: (req.user && req.user.id) ? req.user.id : (customerProfile.userId || null),
          subtotal: subtotal,
          vatRate: vatRate,
          vatAmount: vatAmount,
          totalAmount: finalTotalWithVat,
          status: orderStatus,
          paymentMethod: paymentMethod || null,
          shippingAddress: snapshotShippingAddress,
          vin: orderVin,
          items: {
            create: orderItemsToCreate
          }
        },
        include: {
          items: {
            include: {
              tenantProduct: {
                include: { product: true }
              }
            }
          },
          customer: true
        }
      });

      // B. Bayinin stoklarını atomik olarak düş ve Stok Denetim Defterine (StockMovement) kaydet
      for (const item of orderItemsToCreate) {
        const updateResult = await tx.tenantProduct.updateMany({
          where: {
            id: item.tenantProductId,
            stock: { gte: item.quantity }
          },
          data: {
            stock: { decrement: item.quantity }
          }
        });

        if (updateResult.count === 0) {
          throw new Error(`Yetersiz stok: "${item.tenantProductId}" ürünü tükendi veya eş zamanlı başka bir siparişle satıldı.`);
        }

        // Stok Hareket Denetim Kaydı (Audit)
        await tx.stockMovement.create({
          data: {
            tenantId: tenantId,
            tenantProductId: item.tenantProductId,
            orderId: order.id,
            quantityChange: -item.quantity,
            type: 'SALE',
            note: `Sipariş #${orderNumber} satışı`
          }
        });
      }

      // C. SADECE Cari Hesaba Yaz (Açık Hesap) seçildiyse müşterinin açık borcuna sipariş tutarını ekle ve Deftere işle
      if (paymentMethod === 'CURRENT_ACCOUNT' || paymentMethod === 'CARI') {
        const previousBalance = parseFloat(customerProfile.balance) || 0;
        const newBalance = parseFloat((previousBalance + finalTotalWithVat).toFixed(2));

        await tx.customerProfile.update({
          where: { id: customerProfile.id },
          data: {
            balance: newBalance,
            currentBalance: newBalance
          }
        });

        await tx.customerLedger.create({
          data: {
            tenantId: tenantId,
            customerId: customerProfile.id,
            type: 'DEBIT',
            amount: finalTotalWithVat,
            balanceAfter: newBalance,
            description: `Sipariş #${orderNumber} açık hesap borç kaydı (KDV Dahil)`
          }
        });
      }

      return order;
    });

    return res.status(201).json({
      success: true,
      message: `Siparişiniz #${createdOrder.orderNumber} numarasıyla başarıyla oluşturuldu ve bayinize iletildi.`,
      data: {
        ...createdOrder,
        breakdown: {
          listPriceTotal: listPriceTotal,
          discountAmount: discountAmountTotal,
          subtotal: subtotal,
          vatRate: vatRate,
          vatAmount: vatAmount,
          totalAmount: finalTotalWithVat
        }
      }
    });

  } catch (error) {
    console.error('[STORE_CREATE_ORDER_ERROR]:', error);
    console.error(error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Sipariş oluşturulurken sunucu hatası meydana geldi.',
      message: error.message || 'Sipariş oluşturulurken sunucu hatası meydana geldi.'
    });
  }
});

// ============================================================================
// 3. GET /api/store/orders & GET /api/store/my-orders - Müşterinin Geçmiş Siparişleri
// ============================================================================
router.get(['/orders', '/my-orders'], async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;

    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId }
    });

    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        const tenantOrders = await prisma.order.findMany({
          where: req.user.tenantId ? { tenantId: req.user.tenantId } : {},
          include: {
            items: {
              include: {
                tenantProduct: {
                  include: { product: true }
                }
              }
            },
            returnRequests: true
          },
          orderBy: { createdAt: 'desc' }
        });
        return res.status(200).json({
          success: true,
          count: tenantOrders.length,
          data: tenantOrders
        });
      }

      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı.'
      });
    }

    const orders = await prisma.order.findMany({
      where: {
        customerId: customerProfile.id,
        tenantId: tenantId
      },
      include: {
        items: {
          include: {
            tenantProduct: {
              include: { product: true }
            }
          }
        },
        returnRequests: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });

  } catch (error) {
    console.error('[STORE_GET_ORDERS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Sipariş geçmişi listelenirken sunucu hatası oluştu.'
    });
  }
});

// ============================================================================
// 4. GET /api/store/profile - Müşterinin Kendi Cari ve Profil Bilgileri
// ============================================================================
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        },
        tenant: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            themeColor: true
          }
        }
      }
    });

    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        let tenant = null;
        if (req.user.tenantId) {
          tenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { id: true, name: true, subdomain: true, themeColor: true }
          });
        }
        if (!tenant) {
          tenant = await prisma.tenant.findFirst({
            select: { id: true, name: true, subdomain: true, themeColor: true }
          });
        }
        const creditLimit = 50000.00;
        const currentDebt = 14850.00;
        const availableLimit = 35150.00;
        return res.status(200).json({
          success: true,
          data: {
            id: 'admin-preview',
            companyName: (req.user.role === 'SUPER_ADMIN' ? 'Süper Admin' : 'Bayi Yöneticisi') + ' (Önizleme)',
            name: req.user.role === 'SUPER_ADMIN' ? 'Süper Admin' : 'Bayi Yöneticisi',
            email: req.user.email,
            phone: '0555 123 45 67',
            address: 'Merkez Sanayi Sitesi No: 42',
            taxNumber: '1234567890',
            discountRate: 0,
            balance: currentDebt,
            creditLimit: creditLimit,
            currentDebt: currentDebt,
            availableLimit: availableLimit,
            customerType: 'MECHANIC',
            isB2B: true,
            tenant: tenant || {
              id: 'tenant-ahmet-oto',
              name: 'Ahmet Oto',
              subdomain: 'ahmetoto',
              themeColor: '#f97316'
            }
          }
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı.'
      });
    }

    const creditLimit = 50000.00;
    const currentDebt = parseFloat(customerProfile.balance || 0);
    const availableLimit = Math.max(0, parseFloat((creditLimit - currentDebt).toFixed(2)));
    const isRetail = (customerProfile.customerType || 'MECHANIC') === 'RETAIL';

    return res.status(200).json({
      success: true,
      data: {
        ...customerProfile,
        name: customerProfile.user ? customerProfile.user.name : customerProfile.companyName,
        email: customerProfile.user ? customerProfile.user.email : '',
        creditLimit: creditLimit,
        currentDebt: currentDebt,
        availableLimit: availableLimit,
        customerType: customerProfile.customerType || 'MECHANIC',
        isB2B: !isRetail
      }
    });

  } catch (error) {
    console.error('[STORE_GET_PROFILE_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Profil bilgisi alınırken sunucu hatası oluştu.'
    });
  }
});

// ============================================================================
// 5. PUT & PATCH /api/store/profile - Müşteri Profil ve Hesap Ayarlarını Güncelleme
// ============================================================================
const handleUpdateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, companyName, phone, email, address, city, district, taxNumber, password } = req.body;

    // 1. Veritabanında Kullanıcıyı Bul (ID veya E-posta ile)
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });
    if (!user && req.user.email) {
      user = await prisma.user.findUnique({
        where: { email: req.user.email }
      });
    }

    const effectiveUserId = user ? user.id : userId;

    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: effectiveUserId }
    });
    if (!customerProfile && user) {
      customerProfile = await prisma.customerProfile.findFirst({
        where: { userId: user.id }
      });
    }

    const userUpdateData = {};
    if (name && name.trim()) userUpdateData.name = name.trim();
    if (email && email.trim()) {
      const emailLower = email.trim().toLowerCase();
      // Başka bir kullanıcı aynı e-postayı kullanıyor mu kontrol et
      const existingUser = await prisma.user.findFirst({
        where: {
          email: emailLower,
          NOT: { id: effectiveUserId }
        }
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Bu e-posta adresi başka bir kullanıcı tarafından kullanılmaktadır.'
        });
      }
      userUpdateData.email = emailLower;
    }
    if (password && password.trim()) {
      if (password.trim().length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Yeni şifreniz en az 6 karakter uzunluğunda olmalıdır.'
        });
      }
      const bcrypt = require('bcryptjs');
      userUpdateData.password = await bcrypt.hash(password.trim(), 10);
    }

    let updatedUser = user;
    if (user && Object.keys(userUpdateData).length > 0) {
      updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: userUpdateData,
        select: { id: true, name: true, email: true, role: true }
      });
    }

    if (customerProfile) {
      const profileUpdateData = {};
      if (companyName && companyName.trim()) {
        profileUpdateData.companyName = companyName.trim();
      } else if (name && name.trim()) {
        profileUpdateData.companyName = name.trim();
      }
      if (phone !== undefined) profileUpdateData.phone = phone.trim();
      if (address !== undefined) profileUpdateData.address = address.trim();
      if (city !== undefined) profileUpdateData.city = city.trim();
      if (district !== undefined) profileUpdateData.district = district.trim();
      if (taxNumber !== undefined) profileUpdateData.taxNumber = taxNumber.trim();

      customerProfile = await prisma.customerProfile.update({
        where: { id: customerProfile.id },
        data: profileUpdateData,
        include: {
          tenant: {
            select: { id: true, name: true, subdomain: true, themeColor: true }
          }
        }
      });
    }

    const finalCompanyName = customerProfile ? customerProfile.companyName : (companyName || name || (updatedUser ? updatedUser.name : 'Müşteri'));
    const finalName = (updatedUser ? updatedUser.name : name) || finalCompanyName;
    const finalEmail = (updatedUser ? updatedUser.email : email) || (req.user ? req.user.email : '');

    return res.status(200).json({
      success: true,
      message: 'Profil bilgileriniz başarıyla güncellendi.',
      data: {
        user: updatedUser,
        customerProfile: customerProfile,
        companyName: finalCompanyName,
        name: finalName,
        email: finalEmail,
        phone: customerProfile ? customerProfile.phone : (phone || ''),
        address: customerProfile ? customerProfile.address : (address || ''),
        city: customerProfile ? customerProfile.city : (city || ''),
        district: customerProfile ? customerProfile.district : (district || ''),
        taxNumber: customerProfile ? customerProfile.taxNumber : (taxNumber || ''),
        balance: customerProfile ? customerProfile.balance : 14850.00,
        discountRate: customerProfile ? customerProfile.discountRate : 0
      }
    });

  } catch (error) {
    console.error('[STORE_UPDATE_PROFILE_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Profil güncellenirken sunucu hatası oluştu.'
    });
  }
};

router.put('/profile', handleUpdateProfile);
router.patch('/profile', handleUpdateProfile);

// ============================================================================
// 5. GET /api/store/ledger - Müşterinin Kendi Cari Hesap Ekstresi (Audit)
// ============================================================================
router.get('/ledger', async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;

    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId }
    });

    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        return res.status(200).json({
          success: true,
          creditLimit: 50000.00,
          currentDebt: 14850.00,
          availableLimit: 35150.00,
          isB2B: true,
          customerType: 'MECHANIC',
          currentBalance: '14.850,00 ₺',
          count: 0,
          data: []
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı.'
      });
    }

    const isRetail = (customerProfile.customerType || 'MECHANIC') === 'RETAIL';
    const creditLimit = 50000.00;
    const currentDebt = parseFloat(customerProfile.balance || 0);
    const availableLimit = Math.max(0, parseFloat((creditLimit - currentDebt).toFixed(2)));

    const ledgers = await prisma.customerLedger.findMany({
      where: {
        customerId: customerProfile.id,
        tenantId: tenantId
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      creditLimit: creditLimit,
      currentDebt: currentDebt,
      availableLimit: availableLimit,
      isB2B: !isRetail,
      customerType: customerProfile.customerType || 'MECHANIC',
      currentBalance: `${currentDebt.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`,
      count: ledgers.length,
      data: ledgers
    });

  } catch (error) {
    console.error('[STORE_GET_LEDGER_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Cari hesap ekstresi alınırken sunucu hatası oluştu.'
    });
  }
});

// ============================================================================
// 6. İADE YÖNETİMİ (RMA) ROTALARI - Müşteri Vitrini (Prompt 2. ADIM)
// ============================================================================

/**
 * @route   POST /api/store/orders/:id/return & POST /api/store/returns
 * @desc    Müşteri teslim edilmiş sipariş için iade talebi (ReturnRequest) oluşturur.
 *          Yalnızca 'Teslim Edildi' (DELIVERED / COMPLETED) statüsündeki siparişler kabul edilir.
 * @access  Protected (CUSTOMER)
 */
const handleCreateReturnRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.id || req.body.orderId;
    const { reason, customerNote, iadeSebebi, aciklama, note } = req.body;

    const finalReason = (reason || iadeSebebi || '').trim();
    const finalNote = (customerNote || aciklama || note || '').trim();

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'İade edilecek sipariş kimliği (orderId) belirtilmelidir.'
      });
    }

    if (!finalReason) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen bir iade sebebi (Örn: Parça Araca Uymadı, Kusurlu Geldi) seçiniz.'
      });
    }

    // 1. Müşteri profilini bul
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId }
    });

    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        customerProfile = await prisma.customerProfile.findFirst({
          where: req.user.tenantId ? { tenantId: req.user.tenantId } : {}
        });
      }
      if (!customerProfile) {
        return res.status(404).json({
          success: false,
          message: 'Müşteri profili bulunamadı.'
        });
      }
    }

    // 2. Siparişi bul ve müşteri yetkisi doğrula
    const orderWhere = {
      id: orderId,
      customerId: customerProfile.id
    };
    if (req.user.tenantId && req.user.role !== 'SUPER_ADMIN') {
      orderWhere.tenantId = req.user.tenantId;
    }

    let order = await prisma.order.findFirst({
      where: orderWhere,
      include: {
        items: true,
        returnRequests: true
      }
    });

    // orderNumber ile arama fallback'i
    if (!order) {
      order = await prisma.order.findFirst({
        where: {
          orderNumber: orderId,
          customerId: customerProfile.id
        },
        include: {
          items: true,
          returnRequests: true
        }
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'İade edilmek istenen sipariş bulunamadı veya hesabınıza ait değil.'
      });
    }

    // 3. Statü Kontrolü: YALNIZCA 'Teslim Edildi' (DELIVERED / COMPLETED) siparişler
    const statusUpper = (order.status || '').toUpperCase();
    const isDelivered = statusUpper === 'DELIVERED' ||
      statusUpper === 'TESLIM_EDILDI' ||
      statusUpper === 'COMPLETED' ||
      order.status === 'Teslim Edildi';

    if (!isDelivered) {
      return res.status(400).json({
        success: false,
        message: `Yalnızca "Teslim Edildi" statüsündeki siparişler için iade talebi oluşturulabilir. Bu siparişin mevcut durumu: "${order.status}".`
      });
    }

    // 4. Mükerrer (Duplicate) Bekleyen Talep Kontrolü
    const existingPending = await prisma.returnRequest.findFirst({
      where: {
        orderId: order.id,
        status: { in: ['Bekliyor', 'PENDING'] }
      }
    });

    if (existingPending) {
      return res.status(400).json({
        success: false,
        message: 'Bu sipariş için halihazırda onay bekleyen bir iade talebiniz bulunmaktadır.'
      });
    }

    // 5. İade Talebini Oluştur
    const newReturn = await prisma.returnRequest.create({
      data: {
        orderId: order.id,
        tenantId: order.tenantId,
        customerId: customerProfile.id,
        reason: finalReason,
        customerNote: finalNote || null,
        status: 'Bekliyor'
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            status: true
          }
        }
      }
    });

    return res.status(201).json({
      success: true,
      message: `Sipariş #${order.orderNumber} için iade talebiniz başarıyla oluşturuldu ve bayinize iletildi.`,
      data: newReturn
    });

  } catch (error) {
    console.error('[STORE_CREATE_RETURN_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'İade talebi oluşturulurken sunucu hatası meydana geldi.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

router.post('/orders/:id/return', handleCreateReturnRequest);
router.post('/returns', handleCreateReturnRequest);

/**
 * @route   GET /api/store/returns
 * @desc    Müşterinin geçmiş iade taleplerini listeler.
 * @access  Protected (CUSTOMER)
 */
router.get('/returns', async (req, res) => {
  try {
    const userId = req.user.id;
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId }
    });

    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        customerProfile = await prisma.customerProfile.findFirst({
          where: req.user.tenantId ? { tenantId: req.user.tenantId } : {}
        });
      }
      if (!customerProfile) {
        return res.status(404).json({
          success: false,
          message: 'Müşteri profili bulunamadı.'
        });
      }
    }

    const returns = await prisma.returnRequest.findMany({
      where: {
        customerId: customerProfile.id
      },
      include: {
        order: {
          include: {
            items: {
              include: {
                tenantProduct: {
                  include: { product: true }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: returns.length,
      data: returns
    });

  } catch (error) {
    console.error('[STORE_GET_RETURNS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'İade talepleri listelenirken hata oluştu.'
    });
  }
});

router.executeHybridStoreSearch = executeHybridStoreSearch;
module.exports = router;

