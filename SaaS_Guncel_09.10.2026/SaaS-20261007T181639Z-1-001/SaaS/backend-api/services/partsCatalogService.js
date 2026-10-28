// ============================================================================
// B2B AFS Systems - Derin Çapraz Referans (Deep Cross-Reference) &
// Tavizsiz Şema Tarama (Aggressive Schema Fetching) Servisi
// Konum: backend-api/services/partsCatalogService.js
// ============================================================================

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');

let pgliteInstance = null;
async function getPgliteDb() {
  if (!pgliteInstance) {
    try {
      const { PGlite } = require('@electric-sql/pglite');
      const candidates = [
        path.join(__dirname, '..', 'prisma', 'pgdata'),
        path.join(__dirname, 'prisma', 'pgdata'),
        path.join(process.cwd(), 'backend-api', 'prisma', 'pgdata'),
        path.join(process.cwd(), 'prisma', 'pgdata')
      ];
      for (const dir of candidates) {
        if (fs.existsSync(dir)) {
          pgliteInstance = new PGlite(dir);
          await pgliteInstance.waitReady;
          break;
        }
      }
    } catch (_) {}
  }
  return pgliteInstance;
}

async function fetchDbCrossReferences(norms) {
  const normList = Array.from(norms);
  if (normList.length === 0) return [];

  try {
    return await prisma.partCrossReference.findMany({
      where: {
        OR: [
          { normalizedCode: { in: normList } },
          { rootOEM: { in: normList } }
        ]
      }
    });
  } catch (err) {
    const db = await getPgliteDb();
    if (db) {
      try {
        const placeholders = normList.map((_, i) => `$${i + 1}`).join(', ');
        const res = await db.query(
          `SELECT * FROM "PartCrossReference" WHERE "normalizedCode" IN (${placeholders}) OR "rootOEM" IN (${placeholders})`,
          normList
        );
        return res.rows || [];
      } catch (_) {}
    }
    return [];
  }
}

async function fetchDbSiblingCrossReferences(rootOem) {
  if (!rootOem) return [];
  const clean = String(rootOem).trim().toUpperCase();
  const norm = normalizeCode(clean);

  try {
    return await prisma.partCrossReference.findMany({
      where: {
        OR: [
          { rootOEM: { equals: clean, mode: 'insensitive' } },
          { normalizedCode: norm }
        ]
      }
    });
  } catch (err) {
    const db = await getPgliteDb();
    if (db) {
      try {
        const res = await db.query(
          `SELECT * FROM "PartCrossReference" WHERE UPPER("rootOEM") = $1 OR "normalizedCode" = $2`,
          [clean, norm]
        );
        return res.rows || [];
      } catch (_) {}
    }
    return [];
  }
}

async function fetchDbProducts() {
  try {
    return await prisma.product.findMany();
  } catch (err) {
    const db = await getPgliteDb();
    if (db) {
      try {
        const res = await db.query(`SELECT * FROM "Product"`);
        return (res.rows || []).map(r => {
          let origOems = r.originalOEMs;
          if (typeof origOems === 'string') {
            try { origOems = JSON.parse(origOems); } catch (_) {}
          }
          let refCodes = r.referenceCodes;
          if (typeof refCodes === 'string') {
            try { refCodes = JSON.parse(refCodes); } catch (_) {}
          }
          let techSpecs = r.technicalSpecs;
          if (typeof techSpecs === 'string') {
            try { techSpecs = JSON.parse(techSpecs); } catch (_) {}
          }
          let crossRefs = r.crossReferences;
          if (typeof crossRefs === 'string') {
            try { crossRefs = JSON.parse(crossRefs); } catch (_) {}
          }
          let compVeh = r.compatibleVehicles;
          if (typeof compVeh === 'string') {
            try { compVeh = JSON.parse(compVeh); } catch (_) {}
          }
          let attrs = r.attributes;
          if (typeof attrs === 'string') {
            try { attrs = JSON.parse(attrs); } catch (_) {}
          }
          let diags = r.diagrams;
          if (typeof diags === 'string') {
            try { diags = JSON.parse(diags); } catch (_) {}
          }
          return {
            ...r,
            originalOEMs: origOems,
            referenceCodes: refCodes,
            technicalSpecs: techSpecs,
            crossReferences: crossRefs,
            compatibleVehicles: compVeh,
            attributes: attrs,
            diagrams: diags
          };
        });
      } catch (_) {}
    }
    return [];
  }
}

const DEFAULT_BASE_URL = (process.env.PARTS_CATALOG_BASE_URL || 'https://api.parts-catalogs.com').replace(/\/+$/, '');
const DEFAULT_API_KEY = (process.env.PARTS_CATALOG_API_KEY || '').trim();

// Bilinen üretici / yan sanayi ve OEM marka isimleri (Sorgu ayrıştırma için)
const KNOWN_MANUFACTURERS = new Set([
  'TRW', 'BOSCH', 'VALEO', 'AYD', 'BREMBO', 'FERODO', 'TEXTAR', 'ATE', 'ZIMMERMANN',
  'MEYLE', 'FEBI', 'FEBIBILSTEIN', 'LEMFORDER', 'SACHS', 'LUK', 'INA', 'FAG', 'SKF',
  'SNR', 'NTN', 'GATES', 'CONTITECH', 'CONTINENTAL', 'DAYCO', 'OPTIBELT', ' HUTCHINSON',
  'MANN', 'MANNFILTER', 'MAHLE', 'KNECHT', 'PURFLUX', 'FILTRON', 'HENGST', 'UFI',
  'WAHLER', 'BORGWARNER', 'VERNET', 'CALORSTAT', 'BEHR', 'NISSENS', 'NRF', 'DENSO',
  'DELPHI', 'NGK', 'BERU', 'HELLA', 'MAGNETIMARELLI', 'PIERBURG', 'ELRING', 'VICTORREINZ',
  'CORTECO', 'GOETZE', 'PAYEN', 'KYB', 'KAYABA', 'MONROE', 'BILSTEIN', 'MOOG', 'DELPHI',
  'OPTIMAL', 'SWAG', 'TOPRAN', 'VAICO', 'SASIC', 'METALCAUCHO', 'BIRTH', 'OPAR', 'MOTOCRAFT',
  'ACDELCO', 'MOPAR', 'RENAULT', 'DACIA', 'PEUGEOT', 'CITROEN', 'PSA', 'FIAT', 'ALFAROMEO',
  'LANCIA', 'VW', 'VOLKSWAGEN', 'AUDI', 'SEAT', 'SKODA', 'VAG', 'BMW', 'MERCEDES', 'FORD',
  'OPEL', 'GM', 'TOYOTA', 'HYUNDAI', 'KIA', 'NISSAN', 'HONDA', 'MAZDA', 'VOLVO', 'MITSUBISHI'
]);

/**
 * Kod normalizasyonu: boşluk, tire, nokta, eğik çizgi gibi karakterleri temizler ve büyük harfe çevirir.
 * Örn: "11-60091AA" -> "1160091AA", "0 986 424 794" -> "0986424794"
 */
function normalizeCode(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Kullanıcının arama sorgusunu (Örn: "trw gdb1552" veya "7701208122")
 * marka ve kod bileşenlerine ayrıştırır.
 */
function parseSearchInput(rawQuery, explicitBrand = '') {
  const searchedQuery = String(rawQuery || '').trim();
  const cleanExplicitBrand = String(explicitBrand || '').trim();

  if (!searchedQuery) {
    return {
      searchedQuery: '',
      brand: cleanExplicitBrand,
      code: '',
      normalizedCode: '',
      fullNormalized: ''
    };
  }

  const fullNormalized = normalizeCode(searchedQuery);
  const tokens = searchedQuery.split(/\s+/).filter(Boolean);

  if (tokens.length >= 2) {
    const firstTokenNorm = normalizeCode(tokens[0]);
    const restJoined = tokens.slice(1).join(' ').trim();
    const restNorm = normalizeCode(restJoined);

    // İlk kelime bilinen bir üretici markasıysa veya sadece harflerden oluşup geri kalanında rakam varsa
    if (
      KNOWN_MANUFACTURERS.has(firstTokenNorm) ||
      (/^[A-Z]+$/i.test(tokens[0]) && /[0-9]/.test(restNorm))
    ) {
      return {
        searchedQuery,
        brand: cleanExplicitBrand || tokens[0].toUpperCase(),
        code: restJoined.toUpperCase(),
        normalizedCode: restNorm,
        fullNormalized
      };
    }
  }

  return {
    searchedQuery,
    brand: cleanExplicitBrand,
    code: searchedQuery.toUpperCase(),
    normalizedCode: fullNormalized,
    fullNormalized
  };
}

/**
 * Harici Katalog API yapılandırmasını (.env veya SystemSettings) getirir.
 */
async function getCatalogConfig() {
  let baseUrl = DEFAULT_BASE_URL;
  let apiKey = DEFAULT_API_KEY;

  try {
    let settings = null;
    try {
      settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    } catch (_) {
      const db = await getPgliteDb();
      if (db) {
        try {
          const res = await db.query(`SELECT * FROM "SystemSettings" WHERE id = 1 LIMIT 1`);
          if (res.rows && res.rows.length > 0) settings = res.rows[0];
        } catch (_) {}
      }
    }
    if (settings) {
      if (settings.tecdocApiKey && settings.tecdocApiKey.trim()) {
        apiKey = settings.tecdocApiKey.trim();
      }
      if (
        settings.tecdocEndpoint &&
        settings.tecdocEndpoint.trim() &&
        !settings.tecdocEndpoint.includes('api.tecalliance.net/v2/catalog')
      ) {
        baseUrl = settings.tecdocEndpoint.trim().replace(/\/+$/, '');
      }
    }
  } catch (_) {}

  return {
    baseUrl: baseUrl || 'https://api.parts-catalogs.com',
    apiKey
  };
}

function buildRequestHeaders(apiKey) {
  const headers = {
    'Accept': 'application/json',
    'Accept-Language': 'en',
    'User-Agent': 'AFS-Systems-B2B-DeepSearch/2026'
  };
  if (apiKey) {
    headers['Authorization'] = apiKey;
    headers['X-API-KEY'] = apiKey;
  }
  return headers;
}

/**
 * KURAL 3: Sadece ve sadece API'den veya veritabanından gelen GERÇEK teknik özellikleri
 * ayrıştırır. Uydurma/varsayılan hiçbir alan eklemez. Boşsa undefined döner.
 */
function extractRealTechnicalSpecs(...sources) {
  const specs = {};

  for (const src of sources) {
    if (!src) continue;

    // 1. Düz obje formatı: { thickness: "18mm", fittingPosition: "Front Axle" }
    if (typeof src === 'object' && !Array.isArray(src)) {
      for (const [k, v] of Object.entries(src)) {
        if (v === null || v === undefined) continue;
        const keyStr = String(k).trim();
        const valStr = String(v).trim();
        if (!keyStr || !valStr || valStr === 'undefined' || valStr === 'null') continue;
        if (specs[keyStr] === undefined) {
          specs[keyStr] = valStr;
        }
      }
    }

    // 2. Dizi formatı: [{ name: "thickness", value: "18", unit: "mm" }, ...]
    if (Array.isArray(src)) {
      for (const item of src) {
        if (!item || typeof item !== 'object') continue;
        const rawKey = item.key || item.name || item.title || item.parameter || item.attribute;
        const rawVal = item.value !== undefined ? item.value : item.val;
        const rawUnit = item.unit ? String(item.unit).trim() : '';
        if (!rawKey || rawVal === null || rawVal === undefined) continue;

        const keyStr = String(rawKey).trim();
        let valStr = String(rawVal).trim();
        if (!keyStr || !valStr || valStr === 'undefined' || valStr === 'null') continue;
        if (rawUnit && !valStr.endsWith(rawUnit)) {
          valStr = `${valStr}${rawUnit}`;
        }
        if (specs[keyStr] === undefined) {
          specs[keyStr] = valStr;
        }
      }
    }
  }

  return Object.keys(specs).length > 0 ? specs : undefined;
}

/**
 * Görsel URL dizisini temizler ve geçerli URL'leri döndürür.
 */
function extractValidImageUrls(rawImages, rawDiagrams, rawSingleUrl) {
  const urls = [];
  const seen = new Set();

  const addUrl = (u) => {
    if (!u) return;
    let urlStr = typeof u === 'string' ? u.trim() : (u.url || u.img || u.imageUrl || '').trim();
    if (!urlStr) return;
    if (urlStr.startsWith('//')) {
      urlStr = 'https:' + urlStr;
    }
    // Statik/sahte SVG veya geçersiz placeholder URL'lerini reddet
    if (
      urlStr.includes('/api/catalog/diagram?') ||
      urlStr === 'null' ||
      urlStr === 'undefined'
    ) {
      return;
    }
    if (!seen.has(urlStr)) {
      seen.add(urlStr);
      urls.push(urlStr);
    }
  };

  if (Array.isArray(rawImages)) {
    rawImages.forEach(addUrl);
  } else if (typeof rawImages === 'string' && rawImages.trim()) {
    try {
      const parsed = JSON.parse(rawImages);
      if (Array.isArray(parsed)) parsed.forEach(addUrl);
      else addUrl(rawImages);
    } catch {
      rawImages.split(',').forEach(addUrl);
    }
  }

  if (Array.isArray(rawDiagrams)) {
    rawDiagrams.forEach(addUrl);
  }

  if (rawSingleUrl) {
    addUrl(rawSingleUrl);
  }

  return urls;
}

/**
 * Harici Parts Catalogs / TecDoc API'sinden tekil bir kod (OEM veya Referans) için
 * ham parça, çapraz referans, teknik özellik ve görsel verilerini sorgular.
 */
async function queryExternalCatalogApi(code, brand = '') {
  const cleanCode = String(code || '').trim();
  if (!cleanCode) return null;

  const { baseUrl, apiKey } = await getCatalogConfig();
  const endpointPath = process.env.PARTS_CATALOG_OE_PATH || process.env.PARTS_CATALOG_PATH || '/v1/search/articles';
  const targetUrl = `${baseUrl}${endpointPath}`;

  const requestParams = {
    article: cleanCode,
    code: cleanCode,
    number: cleanCode,
    oe: cleanCode,
    q: brand ? `${brand} ${cleanCode}` : cleanCode
  };
  if (brand && String(brand).trim()) {
    requestParams.brand = String(brand).trim();
    requestParams.manufacturer = String(brand).trim();
  }

  try {
    const response = await axios.get(targetUrl, {
      params: requestParams,
      headers: buildRequestHeaders(apiKey),
      timeout: 6000
    });

    const rawData = response.data?.data !== undefined ? response.data.data : response.data;
    if (!rawData) return null;

    const items = Array.isArray(rawData) ? rawData : [rawData];
    if (items.length === 0) return null;

    let rootOEM = null;
    const originalOEMs = [];
    const referenceCodes = [];
    const specSources = [];
    const imageUrls = [];
    let partName;
    let partGroup;
    let vehicleBrand;
    let compatibleModels;
    const compatibleVehicles = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      if (!partName) {
        const candidateName = item.partName || item.name || item.productName || item.title || item.description;
        if (candidateName && typeof candidateName === 'string' && candidateName.trim()) {
          partName = candidateName.trim();
        }
      }
      if (!partGroup) {
        const candidateGroup = item.partGroup || item.category || item.group;
        if (candidateGroup && typeof candidateGroup === 'string' && candidateGroup.trim()) {
          partGroup = candidateGroup.trim();
        }
      }
      if (!vehicleBrand) {
        const candidateBrand = item.vehicleBrand || item.carBrand || item.make;
        if (candidateBrand && typeof candidateBrand === 'string' && candidateBrand.trim()) {
          vehicleBrand = candidateBrand.trim();
        }
      }
      if (!compatibleModels && item.compatibleModels) {
        compatibleModels = Array.isArray(item.compatibleModels)
          ? item.compatibleModels.join(', ')
          : String(item.compatibleModels).trim();
      }
      if (Array.isArray(item.compatibleVehicles)) {
        compatibleVehicles.push(...item.compatibleVehicles);
      }

      // Root OEM tespiti
      const itemRootOem = item.rootOEM || item.baseOEM || item.baseOem || item.oemNumber || item.oeNumber || item.oem;
      if (itemRootOem && typeof itemRootOem === 'string' && itemRootOem.trim()) {
        if (!rootOEM) rootOEM = itemRootOem.trim().toUpperCase();
        originalOEMs.push(itemRootOem.trim().toUpperCase());
      }

      // OEM listesi tespiti
      const oemArrays = [
        item.originalOEMs,
        item.oemNumbers,
        item.oeNumbers,
        item.oems,
        item.revisions,
        item.originalNumbers
      ];
      for (const arr of oemArrays) {
        if (Array.isArray(arr)) {
          for (const entry of arr) {
            const c = typeof entry === 'string' ? entry : (entry?.code || entry?.oeNumber || entry?.oem || entry?.number);
            if (c && String(c).trim()) {
              const clean = String(c).trim().toUpperCase();
              originalOEMs.push(clean);
              if (!rootOEM) rootOEM = clean;
            }
          }
        }
      }

      // Üretici / Yan Sanayi Referans kodları tespiti
      const refArrays = [
        item.referenceCodes,
        item.crossReferences,
        item.crosses,
        item.replacements,
        item.analogues,
        item.aftermarketCodes
      ];
      for (const arr of refArrays) {
        if (Array.isArray(arr)) {
          for (const ref of arr) {
            if (!ref || typeof ref !== 'object') continue;
            const rBrand = (ref.brand || ref.manufacturer || ref.supplier || '').trim();
            const rCode = (ref.code || ref.article || ref.number || ref.oeNumber || '').trim();
            if (rCode) {
              if (ref.isOEM || ref.type === 'OEM') {
                originalOEMs.push(rCode.toUpperCase());
                if (!rootOEM) rootOEM = rCode.toUpperCase();
              } else if (rBrand) {
                referenceCodes.push({ brand: rBrand, code: rCode.toUpperCase() });
              }
            }
          }
        }
      }

      // Eğer dönen kaydın kendisi bir yan sanayi referansıysa
      const itemBrand = (item.brand || item.manufacturer || item.supplier || '').trim();
      const itemCode = (item.article || item.code || item.number || '').trim();
      if (itemBrand && itemCode && normalizeCode(itemCode) !== normalizeCode(rootOEM || '')) {
        referenceCodes.push({ brand: itemBrand, code: itemCode.toUpperCase() });
      }

      // Gerçek Teknik Özellikler
      if (item.technicalSpecs) specSources.push(item.technicalSpecs);
      if (item.specifications) specSources.push(item.specifications);
      if (item.attributes) specSources.push(item.attributes);
      if (item.properties) specSources.push(item.properties);
      if (item.parameters) specSources.push(item.parameters);
      if (item.criteria && typeof item.criteria === 'object') specSources.push(item.criteria);

      // Görsel ve Şemalar
      const itemImgs = extractValidImageUrls(
        item.images || item.schemas,
        item.diagrams,
        item.imageUrl || item.diagramUrl || item.img || item.photo
      );
      imageUrls.push(...itemImgs);
    }

    return {
      rootOEM,
      originalOEMs,
      referenceCodes,
      technicalSpecs: extractRealTechnicalSpecs(...specSources),
      imageUrls,
      partName,
      partGroup,
      vehicleBrand,
      compatibleModels,
      compatibleVehicles
    };
  } catch (err) {
    // 404 veya bağlantı hatasında sahte veri üretmeden null dön
    return null;
  }
}

/**
 * Araç bağlamı (catalogId, carId, criteria) mevcutsa Parts-Catalogs API'den
 * YALNIZCA aranan OEM / parça koduyla doğrudan eşleşen gerçek şemaları çeker.
 * KURAL 3: Asla rastgele ilk 4 şemayı (Karter / Yağ Filtresi vb.) döndürmez!
 */
async function queryExactVehicleSchemas({ catalogId, carId, criteria, targetCodes = [] }) {
  if (!catalogId || !carId || !Array.isArray(targetCodes) || targetCodes.length === 0) {
    return [];
  }

  const normalizedTargets = new Set(targetCodes.map(normalizeCode).filter(Boolean));
  if (normalizedTargets.size === 0) return [];

  const { baseUrl, apiKey } = await getCatalogConfig();
  const endpoint = `${baseUrl}/v1/catalogs/${encodeURIComponent(catalogId)}/schemas`;
  const params = { carId, page: 0 };
  if (criteria) params.criteria = criteria;

  try {
    const res = await axios.get(endpoint, {
      params,
      headers: buildRequestHeaders(apiKey),
      timeout: 6000
    });

    const rawList = res.data?.list || [];
    const matchedUrls = [];

    for (const item of rawList) {
      if (!item || !item.img) continue;
      let imgUrl = String(item.img).trim();
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;

      // Sadece şema içindeki parça kodları veya parça listesi hedef OEM kodlarıyla eşleşiyorsa kabul et
      const partEntries = Array.isArray(item.parts)
        ? item.parts
        : (Array.isArray(item.partNames) ? item.partNames : []);

      const hasExactCodeMatch = partEntries.some((p) => {
        const pCode = normalizeCode(p?.oe || p?.oem || p?.code || p?.number || p?.id || '');
        return pCode && normalizedTargets.has(pCode);
      });

      if (hasExactCodeMatch) {
        matchedUrls.push({
          url: imgUrl,
          sourceCode: targetCodes[0]
        });
      }
    }

    return matchedUrls;
  } catch (_) {
    return [];
  }
}

/**
 * Veritabanındaki Product kaydının içinden tüm OEM, Referans, Teknik Özellik ve Görsel
 * verilerini ayrıştırır.
 */
function parseProductRecord(product) {
  if (!product) return null;

  const oems = new Set();
  const refs = [];

  if (product.rootOEM && String(product.rootOEM).trim()) {
    oems.add(String(product.rootOEM).trim().toUpperCase());
  }
  if (product.oeNumber && String(product.oeNumber).trim()) {
    oems.add(String(product.oeNumber).trim().toUpperCase());
  }

  const rawOriginalOems = product.originalOEMs;
  if (Array.isArray(rawOriginalOems)) {
    for (const o of rawOriginalOems) {
      const str = typeof o === 'string' ? o : (o?.code || o?.oeNumber || o?.oem);
      if (str && String(str).trim()) {
        oems.add(String(str).trim().toUpperCase());
      }
    }
  }

  const rawRefLists = [product.referenceCodes, product.crossReferences];
  for (const list of rawRefLists) {
    if (Array.isArray(list)) {
      for (const r of list) {
        if (!r || typeof r !== 'object') continue;
        const brand = String(r.brand || r.manufacturer || '').trim();
        const code = String(r.code || r.oeNumber || r.article || '').trim().toUpperCase();
        if (!code) continue;
        if (r.isOEM || r.type === 'OEM' || brand.toUpperCase() === 'OEM' || brand.toUpperCase() === 'OE') {
          oems.add(code);
        } else if (brand) {
          refs.push({ brand, code });
        }
      }
    }
  }

  const technicalSpecs = extractRealTechnicalSpecs(product.technicalSpecs, product.attributes);
  const imageUrls = extractValidImageUrls(product.images, product.diagrams, product.imageUrl || product.diagramUrl);

  return {
    id: product.id,
    oeNumber: product.oeNumber ? String(product.oeNumber).trim().toUpperCase() : undefined,
    rootOEM: product.rootOEM
      ? String(product.rootOEM).trim().toUpperCase()
      : (product.oeNumber ? String(product.oeNumber).trim().toUpperCase() : undefined),
    originalOEMs: Array.from(oems),
    referenceCodes: refs,
    technicalSpecs,
    imageUrls,
    schemaSourceCode: product.schemaSourceCode || undefined,
    partName: product.name || undefined,
    partGroup: product.partGroup || product.category || undefined,
    vehicleBrand: product.vehicleBrand || undefined,
    compatibleModels: product.compatibleModels || undefined,
    compatibleVehicles: Array.isArray(product.compatibleVehicles) ? product.compatibleVehicles : undefined
  };
}

/**
 * Bir Product kaydının verilen normalize edilmiş kod kümesiyle (OEM veya Yan Sanayi Referans)
 * herhangi bir kan bağı olup olmadığını kontrol eder.
 */
function productMatchesNormalizedSet(parsedProd, normSet, brandFilter = '') {
  if (!parsedProd || normSet.size === 0) return false;

  if (parsedProd.rootOEM && normSet.has(normalizeCode(parsedProd.rootOEM))) {
    return true;
  }
  if (parsedProd.oeNumber && normSet.has(normalizeCode(parsedProd.oeNumber))) {
    return true;
  }
  for (const oem of parsedProd.originalOEMs) {
    if (normSet.has(normalizeCode(oem))) return true;
  }
  for (const ref of parsedProd.referenceCodes) {
    const refNorm = normalizeCode(ref.code);
    const combinedNorm = normalizeCode(`${ref.brand}${ref.code}`);
    if (normSet.has(refNorm) || normSet.has(combinedNorm)) {
      if (!brandFilter) return true;
      if (normalizeCode(ref.brand).includes(normalizeCode(brandFilter)) || normSet.has(combinedNorm)) {
        return true;
      }
      return true;
    }
  }
  return false;
}

/**
 * ============================================================================
 * ANA DERİN ÇAPRAZ REFERANS VE AGRESİF ŞEMA MOTORU (DEEP CROSS-REFERENCE ENGINE)
 * ============================================================================
 * KURAL 1: Çift Yönlü Çapraz Eşleştirme (Senaryo A: Referans -> Kök OEM -> Tüm OEM & Muadiller,
 *          Senaryo B: OEM -> Kök OEM -> Tüm Versiyon OEM'ler & Tüm Üretici Referansları)
 * KURAL 2: Tavizsiz Görsel ve Teknik Şema Taraması (Aggressive Schema Fallback)
 * KURAL 3: Statik (Sahte) Veriye Sıfır Tolerans (Sadece gerçek veriler, eksikler undefined)
 * KURAL 4: Kesin API JSON Çıktı Standardı (Strict Payload)
 */
async function executeDeepCrossReferenceSearch(arg1, arg2 = {}) {
  let query = '';
  let brand = '';
  let vin = '';
  let catalogId = '';
  let carId = '';
  let criteria = '';

  if (typeof arg1 === 'string') {
    query = arg1;
    if (arg2 && typeof arg2 === 'object') {
      brand = arg2.brand || arg2.vehicleBrand || '';
      vin = arg2.vin || '';
      catalogId = arg2.catalogId || '';
      carId = arg2.carId || '';
      criteria = arg2.criteria || '';
    }
  } else if (arg1 && typeof arg1 === 'object') {
    query = arg1.query || arg1.oeNumber || arg1.code || arg1.searchedQuery || arg1.article || '';
    brand = arg1.brand || arg1.vehicleBrand || '';
    vin = arg1.vin || '';
    catalogId = arg1.catalogId || '';
    carId = arg1.carId || '';
    criteria = arg1.criteria || '';
  }

  const parsedInput = parseSearchInput(query, brand);
  const { searchedQuery, brand: parsedBrand, code: parsedCode, normalizedCode, fullNormalized } = parsedInput;

  if (!searchedQuery || !normalizedCode) {
    const err = new Error('Lütfen geçerli bir OEM veya Yan Sanayi Referans kodu giriniz.');
    err.statusCode = 400;
    throw err;
  }

  // Keşfedilen tüm kodların ve verilerin toplandığı Örümcek Ağı (Spider Web) havuzları
  let resolvedRootOEM = null;
  const oemPool = new Map(); // normalizedOEM -> displayOEM
  const refPool = new Map(); // `${normalizedBrand}:${normalizedCode}` -> { brand, code }
  const specSources = [];
  const codeImagesMap = new Map(); // normalizedCode -> { displayCode, urls: [] }
  let resolvedPartName;
  let resolvedPartGroup;
  let resolvedVehicleBrand = parsedBrand || undefined;
  let resolvedCompatibleModels;
  let resolvedCompatibleVehicles = [];

  const addOemToPool = (oemStr) => {
    if (!oemStr || typeof oemStr !== 'string') return;
    const clean = oemStr.trim().toUpperCase();
    const norm = normalizeCode(clean);
    if (!norm) return;
    if (!oemPool.has(norm)) {
      oemPool.set(norm, clean);
    }
  };

  const addRefToPool = (refBrand, refCode) => {
    if (!refBrand || !refCode) return;
    const cleanBrand = String(refBrand).trim();
    const cleanCode = String(refCode).trim().toUpperCase();
    const normBrand = normalizeCode(cleanBrand);
    const normCode = normalizeCode(cleanCode);
    if (!normBrand || !normCode) return;
    // Eğer bu kod zaten OEM havuzundaysa referanslara OEM olarak tekrar ekleme
    if (normBrand === 'OEM' || normBrand === 'OE') {
      addOemToPool(cleanCode);
      return;
    }
    const key = `${normBrand}:${normCode}`;
    if (!refPool.has(key)) {
      refPool.set(key, { brand: cleanBrand, code: cleanCode });
    }
  };

  const registerCodeImages = (codeStr, urls) => {
    if (!codeStr || !Array.isArray(urls) || urls.length === 0) return;
    const clean = String(codeStr).trim().toUpperCase();
    const norm = normalizeCode(clean);
    if (!norm) return;
    const existing = codeImagesMap.get(norm) || { displayCode: clean, urls: [] };
    for (const u of urls) {
      if (u && !existing.urls.includes(u)) {
        existing.urls.push(u);
      }
    }
    if (existing.urls.length > 0) {
      codeImagesMap.set(norm, existing);
    }
  };

  const mergeNodeData = (node, sourceCodeHint) => {
    if (!node) return;
    if (node.rootOEM) {
      if (!resolvedRootOEM) resolvedRootOEM = node.rootOEM.trim().toUpperCase();
      addOemToPool(node.rootOEM);
    }
    if (node.oeNumber) {
      addOemToPool(node.oeNumber);
    }
    if (Array.isArray(node.originalOEMs)) {
      node.originalOEMs.forEach(addOemToPool);
    }
    if (Array.isArray(node.referenceCodes)) {
      node.referenceCodes.forEach((r) => addRefToPool(r.brand, r.code));
    }
    if (node.technicalSpecs) {
      specSources.push(node.technicalSpecs);
    }
    if (Array.isArray(node.imageUrls) && node.imageUrls.length > 0) {
      const imgOwnerCode = node.schemaSourceCode || sourceCodeHint || node.rootOEM || node.oeNumber || parsedCode;
      registerCodeImages(imgOwnerCode, node.imageUrls);
    }
    if (!resolvedPartName && node.partName) resolvedPartName = node.partName;
    if (!resolvedPartGroup && node.partGroup) resolvedPartGroup = node.partGroup;
    if (!resolvedVehicleBrand && node.vehicleBrand) resolvedVehicleBrand = node.vehicleBrand;
    if (!resolvedCompatibleModels && node.compatibleModels) resolvedCompatibleModels = node.compatibleModels;
    if (Array.isArray(node.compatibleVehicles) && node.compatibleVehicles.length > 0) {
      resolvedCompatibleVehicles.push(...node.compatibleVehicles);
    }
  };

  // ==========================================================================
  // ADIM 1: VERİTABANI ÖRÜMCEK AĞI TARAMASI (BFS TRANSITIVE CLOSURE)
  // Senaryo A (Referans -> Kök OEM -> Tüm OEM & Muadiller)
  // Senaryo B (OEM -> Kök OEM -> Tüm Versiyon OEM & Muadiller)
  // ==========================================================================
  const activeSearchNorms = new Set([normalizedCode, fullNormalized].filter(Boolean));
  const visitedProductIds = new Set();

  try {
    // 1A. PartCrossReference indeks tablosundan hızlı Kök OEM çözümlemesi
    try {
      const indexMatches = await fetchDbCrossReferences(activeSearchNorms);

      for (const idxRow of indexMatches) {
        if (idxRow.rootOEM) {
          const rOem = idxRow.rootOEM.trim().toUpperCase();
          if (!resolvedRootOEM) resolvedRootOEM = rOem;
          addOemToPool(rOem);
          activeSearchNorms.add(normalizeCode(rOem));
        }
        if (idxRow.isOEM) {
          addOemToPool(idxRow.code);
          activeSearchNorms.add(idxRow.normalizedCode);
        } else if (idxRow.brand) {
          addRefToPool(idxRow.brand, idxRow.code);
        }
      }

      // Eğer PartCrossReference üzerinden Kök OEM bulunduysa, o Kök OEM'e bağlı TÜM kardeş kayıtları çek
      if (resolvedRootOEM) {
        const siblingIndexRows = await fetchDbSiblingCrossReferences(resolvedRootOEM);
        for (const sib of siblingIndexRows) {
          if (sib.isOEM) {
            addOemToPool(sib.code);
            activeSearchNorms.add(sib.normalizedCode);
          } else if (sib.brand) {
            addRefToPool(sib.brand, sib.code);
          }
        }
      }
    } catch (_) {}

    // 1B. Product tablosunda çok katmanlı (Multi-Hop BFS) Örümcek Ağı Taraması
    const allProducts = await fetchDbProducts();
    const parsedProducts = allProducts.map(parseProductRecord).filter(Boolean);

    // Hop döngüsü: Yeni bir Kök OEM veya kardeş OEM keşfedildiği sürece veritabanını tekrar tarar
    let expansionOccurred = true;
    let hopCount = 0;
    const maxHops = 5;

    while (expansionOccurred && hopCount < maxHops) {
      expansionOccurred = false;
      hopCount++;

      for (const prod of parsedProducts) {
        if (visitedProductIds.has(prod.id)) continue;

        if (productMatchesNormalizedSet(prod, activeSearchNorms, parsedBrand)) {
          visitedProductIds.add(prod.id);
          expansionOccurred = true;

          // Bu ürünün kendi kodu üzerinden görsellerini kaydet
          const primaryProdCode = prod.schemaSourceCode || prod.oeNumber || prod.rootOEM;
          mergeNodeData(prod, primaryProdCode);

          // Yeni bulunan Kök OEM ve tüm OEM revizyonlarını arama ağına ekle (2. Dalga için)
          if (prod.rootOEM) {
            activeSearchNorms.add(normalizeCode(prod.rootOEM));
          }
          if (prod.oeNumber) {
            activeSearchNorms.add(normalizeCode(prod.oeNumber));
          }
          for (const oem of prod.originalOEMs) {
            activeSearchNorms.add(normalizeCode(oem));
          }
          for (const ref of prod.referenceCodes) {
            activeSearchNorms.add(normalizeCode(ref.code));
          }
        }
      }
    }
  } catch (dbErr) {
    console.warn('[DEEP_SEARCH_DB_NOTICE]:', dbErr.message);
  }

  // ==========================================================================
  // ADIM 2: HARİCİ KATALOG API SORGUSU (1. DALGA VE KÖK OEM ÜZERİNDEN 2. DALGA)
  // ==========================================================================
  const queriedExternalNorms = new Set();

  // 2A. 1. Dalga: Kullanıcının girdiği kod ile harici API sorgusu
  queriedExternalNorms.add(normalizedCode);
  const firstHopExternal = await queryExternalCatalogApi(parsedCode, parsedBrand);
  if (firstHopExternal) {
    mergeNodeData(firstHopExternal, parsedCode);
  }

  // Eğer kullanıcı marka + kod girdiyse ve ilk sorgu sonuç dönmediyse tam sorguyla da dene
  if (!firstHopExternal && parsedBrand && searchedQuery !== parsedCode) {
    const rawExternal = await queryExternalCatalogApi(searchedQuery, '');
    if (rawExternal) {
      mergeNodeData(rawExternal, parsedCode);
    }
  }

  // 2B. 2. Dalga: Keşfedilen Kök OEM (rootOEM) ve diğer OEM revizyonları üzerinden
  // harici API'yi ve veritabanını TEKRAR tarayarak tüm revizyonları ve yan sanayi muadillerini topla
  const oemsToExpand = [];
  if (resolvedRootOEM && !queriedExternalNorms.has(normalizeCode(resolvedRootOEM))) {
    oemsToExpand.push(resolvedRootOEM);
  }
  for (const [normOem, displayOem] of oemPool.entries()) {
    if (!queriedExternalNorms.has(normOem) && oemsToExpand.length < 4) {
      oemsToExpand.push(displayOem);
    }
  }

  for (const oemCode of oemsToExpand) {
    const normOem = normalizeCode(oemCode);
    if (queriedExternalNorms.has(normOem)) continue;
    queriedExternalNorms.add(normOem);

    const secondHopExternal = await queryExternalCatalogApi(oemCode, resolvedVehicleBrand || parsedBrand);
    if (secondHopExternal) {
      mergeNodeData(secondHopExternal, oemCode);
      // Harici API'den yeni OEM kodları geldiyse veritabanında bu OEM'lere bağlı ürünleri de ağa kat
      activeSearchNorms.add(normOem);
      if (secondHopExternal.rootOEM) activeSearchNorms.add(normalizeCode(secondHopExternal.rootOEM));
      (secondHopExternal.originalOEMs || []).forEach((o) => activeSearchNorms.add(normalizeCode(o)));
    }
  }

  // Harici API 2. dalgasından yeni OEM'ler geldiyse veritabanını son bir kez daha tara
  if (oemsToExpand.length > 0) {
    try {
      const allProducts = await fetchDbProducts();
      const parsedProducts = allProducts.map(parseProductRecord).filter(Boolean);
      for (const prod of parsedProducts) {
        if (visitedProductIds.has(prod.id)) continue;
        if (productMatchesNormalizedSet(prod, activeSearchNorms, '')) {
          visitedProductIds.add(prod.id);
          mergeNodeData(prod, prod.schemaSourceCode || prod.oeNumber || prod.rootOEM);
        }
      }
    } catch (_) {}
  }

  // Kök OEM hala belirlenmediyse ve OEM havuzunda eleman varsa ilkini Kök OEM ata
  if (!resolvedRootOEM && oemPool.size > 0) {
    resolvedRootOEM = Array.from(oemPool.values())[0];
  }

  // Kök OEM'in originalOEMs havuzunda olduğundan emin ol
  if (resolvedRootOEM) {
    addOemToPool(resolvedRootOEM);
  }

  // ==========================================================================
  // ADIM 3: KURAL 2 - TAVİZSİZ GÖRSEL VE TEKNİK ŞEMA TARAMASI (AGGRESSIVE SCHEMA FETCHING)
  // Aranan kodda görsel/şema çıkmadıysa Eşdeğer OEM ve Referans Kodları dizisine gir,
  // sırayla sorgula ve şeması olan İLK kardeş kodun görselini isFallback: true, sourceCode ile çek!
  // ==========================================================================
  const finalImages = [];
  let schemaSourceCode;

  // 3A. Önce kullanıcının doğrudan arattığı kodda (parsedCode / fullNormalized) görsel var mı bak
  const directImageEntry = codeImagesMap.get(normalizedCode) || codeImagesMap.get(fullNormalized);
  if (directImageEntry && directImageEntry.urls.length > 0) {
    schemaSourceCode = directImageEntry.displayCode;
    for (const url of directImageEntry.urls) {
      finalImages.push({
        url,
        isFallback: false,
        sourceCode: directImageEntry.displayCode
      });
    }
  }

  // 3B. Aranan kodda görsel çıkmadıysa: Eşdeğer OEM ve Referans Kodları dizisini sırayla tara (Aggressive Fallback)
  if (finalImages.length === 0) {
    const fallbackCandidates = [];
    const seenCandidateNorms = new Set([normalizedCode, fullNormalized]);

    // Öncelik 1: Ana Kök OEM (rootOEM)
    if (resolvedRootOEM) {
      const rootNorm = normalizeCode(resolvedRootOEM);
      if (!seenCandidateNorms.has(rootNorm)) {
        seenCandidateNorms.add(rootNorm);
        fallbackCandidates.push({ code: resolvedRootOEM, brand: resolvedVehicleBrand || '', isOEM: true });
      }
    }

    // Öncelik 2: Diğer tüm Orijinal OEM Revizyon kodları (originalOEMs)
    for (const [normOem, displayOem] of oemPool.entries()) {
      if (!seenCandidateNorms.has(normOem)) {
        seenCandidateNorms.add(normOem);
        fallbackCandidates.push({ code: displayOem, brand: resolvedVehicleBrand || '', isOEM: true });
      }
    }

    // Öncelik 3: Yan Sanayi Referans kodları (referenceCodes)
    for (const ref of refPool.values()) {
      const refNorm = normalizeCode(ref.code);
      if (!seenCandidateNorms.has(refNorm)) {
        seenCandidateNorms.add(refNorm);
        fallbackCandidates.push({ code: ref.code, brand: ref.brand, isOEM: false });
      }
    }

    for (const candidate of fallbackCandidates) {
      const candNorm = normalizeCode(candidate.code);

      // 1) Hafızadaki (DB veya önceki API dalgasından gelen) görselleri kontrol et
      const cachedImg = codeImagesMap.get(candNorm);
      if (cachedImg && cachedImg.urls.length > 0) {
        schemaSourceCode = candidate.code;
        for (const url of cachedImg.urls) {
          finalImages.push({
            url,
            isFallback: true,
            sourceCode: candidate.code
          });
        }
        break;
      }

      // 2) Harici Katalog API'sine bu kardeş kod için görsel/şema sorgusu at
      if (!queriedExternalNorms.has(candNorm)) {
        queriedExternalNorms.add(candNorm);
        const siblingExternal = await queryExternalCatalogApi(candidate.code, candidate.brand);
        if (siblingExternal) {
          // Kardeş koddan gelen ek teknik özellik veya muadil varsa onları da havuza kat
          mergeNodeData(siblingExternal, candidate.code);

          if (Array.isArray(siblingExternal.imageUrls) && siblingExternal.imageUrls.length > 0) {
            schemaSourceCode = candidate.code;
            for (const url of siblingExternal.imageUrls) {
              finalImages.push({
                url,
                isFallback: true,
                sourceCode: candidate.code
              });
            }
            break;
          }
        }
      }
    }

    // 3) Eğer araç şasi bağlamı (catalogId & carId) verilmişse, Kök OEM ve kardeş OEM'ler için
    //    doğrudan parça kodu eşleşmeli şema kontrolü yap
    if (finalImages.length === 0 && catalogId && carId) {
      const targetOemList = Array.from(oemPool.values());
      const exactSchemas = await queryExactVehicleSchemas({
        catalogId,
        carId,
        criteria,
        targetCodes: targetOemList.length > 0 ? targetOemList : [parsedCode]
      });
      if (exactSchemas.length > 0) {
        schemaSourceCode = exactSchemas[0].sourceCode;
        for (const s of exactSchemas) {
          finalImages.push({
            url: s.url,
            isFallback: normalizeCode(s.sourceCode) !== normalizedCode,
            sourceCode: s.sourceCode
          });
        }
      }
    }
  }

  // ==========================================================================
  // ADIM 4: KURAL 3 & KURAL 4 - KESİN API JSON ÇIKTI STANDARDI (STRICT PAYLOAD)
  // Sahte/varsayılan veri kesinlikle üretilmez. API'den/DB'den gelmeyen alanlar undefined bırakılır.
  // ==========================================================================
  const originalOEMs = Array.from(oemPool.values());
  const referenceCodes = Array.from(refPool.values());
  const technicalSpecs = extractRealTechnicalSpecs(...specSources);

  // Arka planda keşfedilen çapraz referans bağlarını PartCrossReference indeksine kaydet
  if (resolvedRootOEM && (originalOEMs.length > 0 || referenceCodes.length > 0)) {
    persistCrossReferenceGraph(resolvedRootOEM, originalOEMs, referenceCodes).catch(() => {});
  }

  const strictPayload = {
    success: true,
    searchedQuery,
    ...(resolvedRootOEM ? { rootOEM: resolvedRootOEM } : {}),
    originalOEMs,
    referenceCodes,
    ...(technicalSpecs ? { technicalSpecs } : {}),
    images: finalImages,
    ...(schemaSourceCode ? { schemaSourceCode } : {}),
    ...(resolvedPartName ? { partName: resolvedPartName } : {}),
    ...(resolvedPartGroup ? { partGroup: resolvedPartGroup } : {}),
    ...(resolvedVehicleBrand ? { vehicleBrand: resolvedVehicleBrand } : {}),
    ...(resolvedCompatibleModels ? { compatibleModels: resolvedCompatibleModels } : {}),
    ...(resolvedCompatibleVehicles.length > 0 ? { compatibleVehicles: resolvedCompatibleVehicles } : {})
  };

  return strictPayload;
}

/**
 * Keşfedilen Çapraz Referans Örümcek Ağı düğümlerini veritabanındaki PartCrossReference
 * tablosuna asenkron olarak indeksler.
 */
async function persistCrossReferenceGraph(rootOEM, originalOEMs = [], referenceCodes = []) {
  if (!rootOEM) return;
  const cleanRoot = String(rootOEM).trim().toUpperCase();

  for (const oem of originalOEMs) {
    const norm = normalizeCode(oem);
    if (!norm) continue;
    try {
      await prisma.partCrossReference.upsert({
        where: {
          normalizedCode_rootOEM: {
            normalizedCode: norm,
            rootOEM: cleanRoot
          }
        },
        update: { code: oem, isOEM: true },
        create: {
          code: oem,
          normalizedCode: norm,
          brand: 'OEM',
          rootOEM: cleanRoot,
          isOEM: true
        }
      });
    } catch (_) {
      const db = await getPgliteDb();
      if (db) {
        try {
          await db.query(
            `INSERT INTO "PartCrossReference" ("id", "code", "normalizedCode", "brand", "rootOEM", "isOEM", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
             ON CONFLICT ("normalizedCode", "rootOEM") DO UPDATE SET "code" = EXCLUDED."code", "isOEM" = EXCLUDED."isOEM"`,
            [`pcr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, oem, norm, 'OEM', cleanRoot, true]
          );
        } catch (_) {}
      }
    }
  }

  for (const ref of referenceCodes) {
    if (!ref || !ref.code) continue;
    const norm = normalizeCode(ref.code);
    if (!norm) continue;
    try {
      await prisma.partCrossReference.upsert({
        where: {
          normalizedCode_rootOEM: {
            normalizedCode: norm,
            rootOEM: cleanRoot
          }
        },
        update: { code: ref.code, brand: ref.brand || null, isOEM: false },
        create: {
          code: ref.code,
          normalizedCode: norm,
          brand: ref.brand || null,
          rootOEM: cleanRoot,
          isOEM: false
        }
      });
    } catch (_) {
      const db = await getPgliteDb();
      if (db) {
        try {
          await db.query(
            `INSERT INTO "PartCrossReference" ("id", "code", "normalizedCode", "brand", "rootOEM", "isOEM", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
             ON CONFLICT ("normalizedCode", "rootOEM") DO UPDATE SET "code" = EXCLUDED."code", "brand" = EXCLUDED."brand", "isOEM" = EXCLUDED."isOEM"`,
            [`pcr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, ref.code, norm, ref.brand || null, cleanRoot, false]
          );
        } catch (_) {}
      }
    }
  }
}

/**
 * 1. ŞASİ (VIN) NUMARASI İLE SORGULAMA FONKSİYONU
 * Parts Catalogs API üzerinden /v1/car/info çeker.
 */
async function searchVinNumber(vinNumber) {
  if (!vinNumber || typeof vinNumber !== 'string') {
    const err = new Error('Lütfen geçerli bir Şasi (VIN) numarası giriniz.');
    err.statusCode = 400;
    throw err;
  }

  const cleanVin = vinNumber.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  if (!cleanVin || cleanVin.length < 5) {
    const err = new Error('Girilen Şasi (VIN) numarası geçersiz.');
    err.statusCode = 400;
    throw err;
  }

  const { baseUrl, apiKey } = await getCatalogConfig();
  const targetUrl = `${baseUrl}/v1/car/info?q=${encodeURIComponent(cleanVin)}&market=Europe&region=EU`;

  try {
    const response = await axios.get(targetUrl, {
      headers: buildRequestHeaders(apiKey),
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
    const modelCandidates = [];

    if (Array.isArray(primaryCar.parameters)) {
      const carNameParam = primaryCar.parameters.find((p) => p.key === 'car_name' || p.key === 'model');
      if (carNameParam && carNameParam.value) {
        const parts = String(carNameParam.value).split(/\s*[\/,]\s*/).map((p) => p.trim()).filter(Boolean);
        modelCandidates.push(...parts);
      }
    }

    if (primaryCar.title && typeof primaryCar.title === 'string') {
      const match = primaryCar.title.match(/^([^()]+)\s*(?:\(([^()]+)\))?$/);
      if (match) {
        if (match[1] && match[1].trim()) modelCandidates.push(match[1].trim());
        if (match[2] && match[2].trim()) modelCandidates.push(match[2].trim());
      } else {
        const titleParts = primaryCar.title.split(/\s*[\/,]\s*/).map((p) => p.trim()).filter(Boolean);
        modelCandidates.push(...titleParts);
      }
    }

    if (Array.isArray(primaryCar.modelName)) {
      modelCandidates.push(...primaryCar.modelName);
    } else if (typeof primaryCar.modelName === 'string' && primaryCar.modelName.trim()) {
      modelCandidates.push(primaryCar.modelName.trim());
    }

    if (Array.isArray(primaryCar.models)) {
      modelCandidates.push(...primaryCar.models);
    }

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

    const compatibleModels = uniqueModelList.length > 0
      ? uniqueModelList.join(', ')
      : (primaryCar.title || primaryCar.modelName || undefined);

    return {
      vin: cleanVin,
      vehicleBrand: vehicleBrand || undefined,
      compatibleModels,
      modelList: uniqueModelList,
      catalogId: primaryCar.catalogId || undefined,
      carId: primaryCar.carId || undefined,
      criteria: primaryCar.criteria || undefined
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
 * Geriye dönük servis çağrıları için searchOeNumber & enrichProductData köprüleri
 * (Tamamen Deep Cross-Reference motoru üzerinden çalışır, asla sahte veri dönmez)
 */
async function searchOeNumber(oeNumber, brand = '') {
  return executeDeepCrossReferenceSearch({ query: oeNumber, brand });
}

async function enrichProductData({ oeNumber, query, brand = '', vin = '', catalogId = '', carId = '', criteria = '' }) {
  const targetQuery = query || oeNumber;
  return executeDeepCrossReferenceSearch({
    query: targetQuery,
    brand,
    vin,
    catalogId,
    carId,
    criteria
  });
}

module.exports = {
  normalizeCode,
  parseSearchInput,
  extractRealTechnicalSpecs,
  executeDeepCrossReferenceSearch,
  persistCrossReferenceGraph,
  searchVinNumber,
  searchOeNumber,
  enrichProductData
};
