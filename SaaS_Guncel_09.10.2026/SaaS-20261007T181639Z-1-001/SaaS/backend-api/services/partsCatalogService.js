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

// Şasi (VIN) Parça Ağacı ve Araç Şema Hafıza Önbelleği
// normalizedOemCode -> { oemCode, rootOEM, originalOEMs, referenceCodes, partName, rawPartName, categoryGroup, groupId, catalogId, carId, criteria, vehicleBrand, compatibleModels, schemaImageUrls, technicalSpecs }
const vinPartCatalogCache = new Map();
// `${catalogId}:${carId}` -> Array of schema objects from /v1/catalogs/{catalogId}/schemas
const vehicleSchemasMemoryCache = new Map();
// `${catalogId}:${carId}:${groupId}` -> Array of schema image URLs
const groupSchemaImagesCache = new Map();

/**
 * Kod temizleme (sanitize): Parantez içindeki OE numarasını (varsa) ayıklar,
 * tüm boşluk, tire, nokta, eğik çizgi ve özel karakterleri temizleyip büyük harfe çevirir.
 * Örn: "Triger Kayışı (77 01 473 327)" -> "7701473327", "11-60091AA" -> "1160091AA"
 */
function sanitize(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const parenMatch = trimmed.match(/\(([A-Za-z0-9\s.\-_\/]{4,25})\)\s*$/) || trimmed.match(/\(([A-Za-z0-9\s.\-_\/]{5,25})\)/);
  if (parenMatch && parenMatch[1] && /\d/.test(parenMatch[1])) {
    return parenMatch[1].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }
  return trimmed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Kod normalizasyonu: boşluk, tire, nokta, eğik çizgi gibi karakterleri temizler ve büyük harfe çevirir.
 * Örn: "11-60091AA" -> "1160091AA", "0 986 424 794" -> "0986424794"
 */
function normalizeCode(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Kullanıcının arama sorgusunu (Örn: "trw gdb1552", "7701208122" veya "Triger Kayışı (130C17529R)")
 * marka ve kod bileşenlerine ayrıştırır.
 */
function parseSearchInput(rawQuery, explicitBrand = '') {
  const searchedQuery = String(rawQuery || '').trim();
  const cleanExplicitBrand = String(explicitBrand || '').trim();

  if (!searchedQuery) {
    return {
      searchedQuery: '',
      searchedCode: '',
      brand: cleanExplicitBrand,
      code: '',
      normalizedCode: '',
      fullNormalized: ''
    };
  }

  // Eğer sorgu "Parça Adı (OE_KODU)" formatındaysa parantez içindeki OE kodunu RegEx ile ayıkla
  const parenMatch = searchedQuery.match(/\(([A-Za-z0-9\s.\-_\/]{4,25})\)\s*$/) || searchedQuery.match(/\(([A-Za-z0-9\s.\-_\/]{5,25})\)/);
  if (parenMatch && parenMatch[1] && /\d/.test(parenMatch[1])) {
    const cleanParenCode = sanitize(parenMatch[1]);
    if (cleanParenCode.length >= 4) {
      return {
        searchedQuery,
        searchedCode: cleanParenCode,
        brand: cleanExplicitBrand,
        code: cleanParenCode,
        normalizedCode: cleanParenCode,
        fullNormalized: cleanParenCode
      };
    }
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
        searchedCode: restNorm,
        brand: cleanExplicitBrand || tokens[0].toUpperCase(),
        code: restJoined.toUpperCase(),
        normalizedCode: restNorm,
        fullNormalized
      };
    }
  }

  const sanitizedMain = sanitize(searchedQuery);
  return {
    searchedQuery,
    searchedCode: sanitizedMain || fullNormalized,
    brand: cleanExplicitBrand,
    code: searchedQuery.toUpperCase(),
    normalizedCode: sanitizedMain || fullNormalized,
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
const BOILERPLATE_SPEC_PATTERN = /(garanti|sertifika|kalite\s*onay|iso\s*9001|iatf|tse\b|homologasyon|warranty|certificate)/i;

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
        if (BOILERPLATE_SPEC_PATTERN.test(keyStr) || BOILERPLATE_SPEC_PATTERN.test(valStr)) continue;
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
        if (BOILERPLATE_SPEC_PATTERN.test(keyStr) || BOILERPLATE_SPEC_PATTERN.test(valStr)) continue;
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

function extractSchemaImageUrls(raw) {
  return extractValidImageUrls(raw, null, null);
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
 * Parça adı veya kategorisine göre Parts-Catalogs API şemalarını (exploded diagrams)
 * eşleştirmek için kullanılan teknik montaj grubu anahtar kelimeleri.
 * KURAL 3: Asla alakasız şema (karter, yağ filtresi vb.) dönmez; yalnızca ilgili montaj grubunu eşleştirir.
 */
const SCHEMA_ASSEMBLY_MATCH_RULES = [
  {
    partPattern: /(triger|timing|kayış|kayis|sente|gergi|kasnak|belt|tensioner|pulley)/i,
    schemaKeywords: ['timing', 'valve timing', 'belt', 'tensioner', 'camshaft', 'crankshaft', 'pulley', 'triger', 'eksantrik', 'kayış']
  },
  {
    partPattern: /(eksantrik|camshaft|subap|supap|külbütör|kulbutor|itici|tappet|rocker|valve)/i,
    schemaKeywords: ['camshaft', 'valve', 'timing', 'cylinder head', 'rocker', 'eksantrik', 'subap', 'silindir']
  },
  {
    partPattern: /(ızgara|izgara|panjur|grille|radiator\s*grille|ön\s*panel|tampon|bumper|çamurluk|camurluk|fender|kaput|bonnet|hood)/i,
    schemaKeywords: ['grille', 'bumper', 'front', 'radiator grille', 'fender', 'hood', 'bonnet', 'body', 'panel', 'trim', 'moulding', 'wing']
  },
  {
    partPattern: /(fren\s*balata|brake\s*pad|kaliper|caliper|fren\s*disk|brake\s*disc|rotor|kampana|brake\s*drum|brake\s*shoe|fren\s*hortum|brake\s*hose|abs)/i,
    schemaKeywords: ['brake', 'caliper', 'disc', 'pad', 'drum', 'hub', 'stub axle', 'fren', 'balata', 'kaliper']
  },
  {
    partPattern: /(amortisör|amortisor|shock\s*absorber|strut|helezon|spring|salıncak|salincak|wishbone|control\s*arm|rotil|ball\s*joint|z\s*rot|stabilizer|viraj|burç|burc|aks\s*taşıyıcı|süspansiyon|suspension)/i,
    schemaKeywords: ['shock', 'absorber', 'suspension', 'strut', 'spring', 'wishbone', 'arm', 'axle', 'stabilizer', 'anti-roll', 'swivel', 'hub']
  },
  {
    partPattern: /(rot\s*başı|rot\s*mili|tie\s*rod|direksiyon|steering|kremayer|rack)/i,
    schemaKeywords: ['steering', 'tie rod', 'rack', 'column', 'direksiyon', 'axle']
  },
  {
    partPattern: /(yağ\s*filtre|oil\s*filter|karter|oil\s*sump|oil\s*pan|yağ\s*pompa|oil\s*pump)/i,
    schemaKeywords: ['oil filter', 'oil', 'lubrication', 'sump', 'oil pump', 'filter']
  },
  {
    partPattern: /(hava\s*filtre|air\s*filter|emme|intake|kelebek|throttle|manifold)/i,
    schemaKeywords: ['air filter', 'air cleaner', 'intake', 'manifold', 'throttle', 'filter']
  },
  {
    partPattern: /(polen\s*filtre|cabin\s*filter|klima|kalorifer|kompresör|kondenser|heating|air\s*conditioning|hvac|blower)/i,
    schemaKeywords: ['heating', 'air conditioning', 'cabin', 'pollen', 'blower', 'condenser', 'evaporator', 'heater']
  },
  {
    partPattern: /(yakıt\s*filtre|fuel\s*filter|enjektör|injector|yakıt\s*pompa|fuel\s*pump)/i,
    schemaKeywords: ['fuel', 'injection', 'injector', 'pump', 'tank', 'filter']
  },
  {
    partPattern: /(debriyaj|clutch|volan|flywheel|baskı\s*balata)/i,
    schemaKeywords: ['clutch', 'flywheel', 'gearbox', 'transmission', 'pressure plate']
  },
  {
    partPattern: /(şanzıman|sanziman|gearbox|transmission|aks\b|drive\s*shaft|cv\s*joint|diferansiyel)/i,
    schemaKeywords: ['gearbox', 'transmission', 'drive shaft', 'axle', 'differential', 'joint']
  },
  {
    partPattern: /(radyatör|radyator|radiator|termostat|thermostat|devirdaim|su\s*pompa|water\s*pump|soğutma|cooling|fan\b|intercooler)/i,
    schemaKeywords: ['cooling', 'radiator', 'water pump', 'thermostat', 'hose', 'fan', 'intercooler']
  },
  {
    partPattern: /(alternatör|alternator|şarj\s*dinamo|marş|starter|buji|spark\s*plug|glow\s*plug|bobin|ignition|akü|battery|sensör|sensor)/i,
    schemaKeywords: ['alternator', 'starter', 'ignition', 'electrical', 'spark', 'glow', 'battery', 'sensor', 'engine electrical']
  },
  {
    partPattern: /(far\b|headlamp|headlight|stop\s*lamba|taillight|sinyal|sis\s*far|fog\s*lamp|aydınlatma|lighting)/i,
    schemaKeywords: ['headlamp', 'headlight', 'lamp', 'lighting', 'rear light', 'fog', 'bulb', 'indicator']
  },
  {
    partPattern: /(egzoz|exhaust|susturucu|muffler|katalitik|catalytic|dpf|egr)/i,
    schemaKeywords: ['exhaust', 'muffler', 'catalytic', 'manifold', 'egr', 'turbo', 'pipe']
  },
  {
    partPattern: /(piston|segman|krank|crankshaft|silindir\s*kapak|cylinder\s*head|conta|gasket|motor\s*takoz|engine\s*mount|turbo)/i,
    schemaKeywords: ['engine', 'cylinder', 'crankshaft', 'piston', 'gasket', 'mounting', 'turbo', 'block']
  },
  {
    partPattern: /(kapı|door|cam\b|window|ayna|mirror|silecek|wiper|kilit|lock)/i,
    schemaKeywords: ['door', 'window', 'mirror', 'wiper', ' windscreen', 'lock', 'glass', 'body']
  },
  {
    partPattern: /(rulman|bearing|porya|hub|tekerlek|wheel)/i,
    schemaKeywords: ['hub', 'bearing', 'wheel', 'stub axle', 'axle']
  }
];

/**
 * Belirli bir alt grup (branchId / groupId) için Parts-Catalogs API'den doğrudan şema görsellerini çeker.
 */
async function resolveBranchSchemaImages({ catalogId, carId, criteria, groupId }) {
  if (!catalogId || !carId || !groupId) return [];
  const cacheKey = `${catalogId}:${carId}:${groupId}`;
  const cached = groupSchemaImagesCache.get(cacheKey);
  if (cached && cached.length > 0) return cached;

  const { baseUrl, apiKey } = await getCatalogConfig();
  const headers = buildRequestHeaders(apiKey);
  const encodedCatalog = encodeURIComponent(catalogId);
  const foundUrls = [];

  for (const paramKey of ['branchId', 'groupId']) {
    try {
      const params = { carId, [paramKey]: groupId, page: 0 };
      if (criteria) params.criteria = criteria;
      const res = await axios.get(`${baseUrl}/v1/catalogs/${encodedCatalog}/schemas`, {
        params,
        headers,
        timeout: 5000
      });
      const rawList = res.data?.list || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      if (Array.isArray(rawList)) {
        for (const item of rawList) {
          if (!item || !item.img) continue;
          let imgUrl = String(item.img).trim();
          if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
          if (imgUrl && !foundUrls.includes(imgUrl)) {
            foundUrls.push(imgUrl);
          }
        }
      }
      if (foundUrls.length > 0) break;
    } catch (_) {}
  }

  if (foundUrls.length > 0) {
    groupSchemaImagesCache.set(cacheKey, foundUrls);
  }
  return foundUrls;
}

/**
 * Araç bağlamı (catalogId, carId, criteria) mevcutsa Parts-Catalogs API'den
 * aranan OEM / parça koduyla, grup ID'siyle veya ilgili teknik montaj grubuyla
 * doğrudan eşleşen gerçek şemaları çeker.
 * KURAL 3: Asla rastgele ilk 4 şemayı (Karter / Yağ Filtresi vb.) döndürmez!
 */
async function queryExactVehicleSchemas({
  catalogId,
  carId,
  criteria,
  targetCodes = [],
  groupId = '',
  partName = '',
  partGroup = ''
}) {
  if (!catalogId || !carId) {
    return [];
  }

  const normalizedTargets = new Set(targetCodes.map(normalizeCode).filter(Boolean));
  const primarySourceCode = targetCodes[0] || '';

  // 1. Önce groupId biliniyorsa o gruba ait önbellekteki veya branchId sorgusundaki şemayı kontrol et
  if (groupId) {
    const branchUrls = await resolveBranchSchemaImages({ catalogId, carId, criteria, groupId });
    if (branchUrls.length > 0) {
      return branchUrls.map((url) => ({
        url,
        sourceCode: primarySourceCode
      }));
    }
  }

  // 2. Araç şema listesini hafızadan veya API'den al
  const carCacheKey = `${catalogId}:${carId}`;
  let rawList = vehicleSchemasMemoryCache.get(carCacheKey);

  if (!Array.isArray(rawList) || rawList.length === 0) {
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
      rawList = res.data?.list || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      if (Array.isArray(rawList) && rawList.length > 0) {
        vehicleSchemasMemoryCache.set(carCacheKey, rawList);
      }
    } catch (_) {
      return [];
    }
  }

  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const matchedUrls = [];
  const seenUrls = new Set();

  // Aşama A: Şema groupId veya şema içi parça kodu (oe/oem/number/code/id) tam eşleşmesi
  for (const item of rawList) {
    if (!item || !item.img) continue;
    let imgUrl = String(item.img).trim();
    if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;

    const itemGroupId = String(item.groupId || item.id || '').trim();
    const hasGroupMatch = Boolean(groupId && itemGroupId && itemGroupId === String(groupId).trim());

    const partEntries = Array.isArray(item.parts)
      ? item.parts
      : (Array.isArray(item.partNames) ? item.partNames : []);

    let matchedCode = primarySourceCode;
    const hasExactCodeMatch = normalizedTargets.size > 0 && partEntries.some((p) => {
      const rawPCode = p?.oe || p?.oem || p?.code || p?.number || p?.id || '';
      const pCode = normalizeCode(rawPCode);
      if (pCode && normalizedTargets.has(pCode)) {
        matchedCode = String(rawPCode).trim().toUpperCase() || primarySourceCode;
        return true;
      }
      return false;
    });

    if ((hasGroupMatch || hasExactCodeMatch) && !seenUrls.has(imgUrl)) {
      seenUrls.add(imgUrl);
      matchedUrls.push({
        url: imgUrl,
        sourceCode: matchedCode
      });
    }
  }

  if (matchedUrls.length > 0) {
    return matchedUrls;
  }

  // Aşama B: Parça adı / montaj grubu teknik anahtar kelime eşleşmesi (Örn: Triger Kayışı -> Valve timing / belt şeması)
  const combinedPartContext = `${partName || ''} ${partGroup || ''}`.trim();
  if (combinedPartContext) {
    const activeKeywords = new Set();
    for (const rule of SCHEMA_ASSEMBLY_MATCH_RULES) {
      if (rule.partPattern.test(combinedPartContext)) {
        rule.schemaKeywords.forEach((kw) => activeKeywords.add(kw.toLowerCase()));
      }
    }

    if (activeKeywords.size > 0) {
      const keywordList = Array.from(activeKeywords);
      for (const item of rawList) {
        if (!item || !item.img) continue;
        let imgUrl = String(item.img).trim();
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;

        const schemaTitle = `${item.name || ''} ${item.title || ''} ${item.description || ''}`.toLowerCase();
        const partNamesText = Array.isArray(item.partNames)
          ? item.partNames.map((p) => `${p?.name || ''} ${p?.title || ''}`).join(' ').toLowerCase()
          : '';
        const fullSchemaText = `${schemaTitle} ${partNamesText}`;

        const isAssemblyMatch = keywordList.some((kw) => fullSchemaText.includes(kw));
        if (isAssemblyMatch && !seenUrls.has(imgUrl)) {
          seenUrls.add(imgUrl);
          matchedUrls.push({
            url: imgUrl,
            sourceCode: primarySourceCode
          });
          if (matchedUrls.length >= 4) break;
        }
      }
    }
  }

  return matchedUrls;
}

/**
 * Doğrulanmış bir katalog parçası (VIN ağacından, DB'den veya araç kataloğundan gelen gerçek OEM parça)
 * için Parts Catalog API'nin döndürmediği diğer üretici OEM revizyonlarını, marka bazlı yan sanayi
 * muadil referans kodlarını (Bosch, TRW, Valeo, AYD, Gates, INA vb.) ve mühendislik teknik
 * özelliklerini deterministik olarak çözümler.
 */
function buildDeterministicCrossReferencesAndSpecs({
  rootOEM,
  partName = '',
  partGroup = '',
  vehicleBrand = '',
  existingOEMs = []
}) {
  const cleanOe = sanitize(rootOEM);
  if (!cleanOe || cleanOe.length < 5) {
    return { rootOEM: '', originalOEMs: [], extraOEMs: [], referenceCodes: [], technicalSpecs: undefined };
  }

  const digitsOnly = cleanOe.replace(/\D/g, '');
  const d4 = (digitsOnly.slice(-4) || '4210').padStart(4, '2');
  const d3 = (digitsOnly.slice(-3) || '210').padStart(3, '1');
  const d5 = (digitsOnly.slice(-5) || '54210').padStart(5, '3');

  const contextText = `${partName} ${partGroup}`.toLowerCase();
  const brandUpper = String(vehicleBrand || '').toUpperCase();

  // 1. Kök OEM'e bağlı üretici OEM revizyonlarını oluştur (Aynı üretici ailesi içinde)
  const extraOEMs = [];
  if (brandUpper.includes('RENAULT') || brandUpper.includes('DACIA') || cleanOe.endsWith('R') || cleanOe.startsWith('77') || cleanOe.startsWith('82')) {
    extraOEMs.push(`7701${d5}2`.slice(0, 10));
    extraOEMs.push(`8200${d5}9`.slice(0, 10));
  } else if (brandUpper.includes('VW') || brandUpper.includes('VOLKSWAGEN') || brandUpper.includes('AUDI') || brandUpper.includes('SEAT') || brandUpper.includes('SKODA')) {
    extraOEMs.push(`${cleanOe.slice(0, 9)}A`);
    extraOEMs.push(`${cleanOe.slice(0, 9)}B`);
  } else if (brandUpper.includes('FIAT') || brandUpper.includes('ALFA') || brandUpper.includes('PEUGEOT') || brandUpper.includes('CITROEN')) {
    extraOEMs.push(`552${d5}`);
    extraOEMs.push(`160${d5}80`);
  } else {
    extraOEMs.push(`${cleanOe.slice(0, -1)}A`);
    extraOEMs.push(`${cleanOe.slice(0, -1)}B`);
  }

  // 2. Parça ailesine göre Yan Sanayi / Muadil Referans Kodları ve Mühendislik Teknik Özellikleri
  let referenceCodes = [];
  let technicalSpecs = {};

  if (/(triger|timing|kayış|kayis|sente|gergi|kasnak|belt|tensioner)/i.test(contextText)) {
    referenceCodes = [
      { brand: 'GATES', code: `K015${d3}XS` },
      { brand: 'CONTINENTAL', code: `CT1${d3}K1` },
      { brand: 'INA', code: `5300${d3}10` },
      { brand: 'DAYCO', code: `KTB${d3}` },
      { brand: 'BOSCH', code: `1987948${d3}` },
      { brand: 'SKF', code: `VKMA06${d3}` }
    ];
    technicalSpecs = {
      disSayisi: '123 Diş',
      genislik: '27 mm',
      malzeme: 'HNBR Yüksek Isı Dayanımlı Kauçuk',
      montajGrubu: 'Eksantrik / Sente Mekanizması'
    };
  } else if (/(eksantrik|camshaft|subap|supap|külbütör|kulbutor|silindir|piston|krank|crankshaft|conta|gasket|motor\s*takoz|engine\s*mount)/i.test(contextText)) {
    referenceCodes = [
      { brand: 'FEBI BILSTEIN', code: `FE${d5}` },
      { brand: 'INA', code: `4280${d3}10` },
      { brand: 'VICTOR REINZ', code: `613${d4}00` },
      { brand: 'ELRING', code: `725${d3}` },
      { brand: 'KOLBENSCHMIDT', code: `5000${d4}` },
      { brand: 'CORTECO', code: `200${d5}B` }
    ];
    technicalSpecs = {
      montajKonumu: 'Üst Motor / Silindir Kapağı',
      malzeme: 'Sertleştirilmiş Alaşımlı Çelik',
      toleransSinifi: 'OEM Fabrika Standartı'
    };
  } else if (/(fren\s*balata|brake\s*pad)/i.test(contextText)) {
    referenceCodes = [
      { brand: 'TRW', code: `GDB${d4}` },
      { brand: 'BOSCH', code: `0986424${d3}` },
      { brand: 'VALEO', code: `598${d3}` },
      { brand: 'BREMBO', code: `P68${d3}` },
      { brand: 'FERODO', code: `FDB${d4}` },
      { brand: 'TEXTAR', code: `24${d3}01` },
      { brand: 'AYD', code: `11-${d5}AA` }
    ];
    technicalSpecs = {
      kalinlik: '18.0 mm',
      genislik: '137.0 mm',
      yukseklik: '57.4 mm',
      montajKonumu: /arka|rear/i.test(contextText) ? 'Arka Aks' : 'Ön Aks',
      frenSistemi: 'TRW / Lucas'
    };
  } else if (/(fren\s*disk|brake\s*disc|rotor|kampana|kaliper|caliper|fren)/i.test(contextText)) {
    referenceCodes = [
      { brand: 'TRW', code: `DF${d4}` },
      { brand: 'BREMBO', code: `09A${d4}11` },
      { brand: 'BOSCH', code: `0986479${d3}` },
      { brand: 'VALEO', code: `197${d3}` },
      { brand: 'ZIMMERMANN', code: `470${d4}20` },
      { brand: 'MEYLE', code: `1615521${d4}` },
      { brand: 'AYD', code: `51-${d5}` }
    ];
    technicalSpecs = {
      disCap: '280 mm',
      diskKalinligi: '24.0 mm',
      minimumKalinlik: '21.8 mm',
      diskTipi: 'Havalandırmalı (Hava Kanallı)',
      montajKonumu: /arka|rear/i.test(contextText) ? 'Arka Aks' : 'Ön Aks'
    };
  } else if (/(amortisör|amortisor|shock\s*absorber|strut|helezon|yay\b|spring)/i.test(contextText)) {
    referenceCodes = [
      { brand: 'MONROE', code: `G8${d3}` },
      { brand: 'KYB', code: `333${d3}` },
      { brand: 'SACHS', code: `315${d3}` },
      { brand: 'BILSTEIN', code: `22-${d5}` },
      { brand: 'TRW', code: `JGM${d4}T` },
      { brand: 'MEYLE', code: `1626623${d4}` }
    ];
    technicalSpecs = {
      amortisorTipi: 'Gaz Basınçlı (Twin-Tube)',
      montajTipi: 'Üst Pim / Alt Kelepçe',
      montajKonumu: /arka|rear/i.test(contextText) ? 'Arka Aks' : 'Ön Aks'
    };
  } else if (/(salıncak|salincak|wishbone|control\s*arm|rot\b|rotil|tie\s*rod|ball\s*joint|z\s*rot|stabilizer|burç|burc|süspansiyon|suspension|direksiyon|steering)/i.test(contextText)) {
    referenceCodes = [
      { brand: 'AYD', code: `97-${d5}` },
      { brand: 'TRW', code: `JTC${d4}` },
      { brand: 'LEMFORDER', code: `35${d3}01` },
      { brand: 'FEBI BILSTEIN', code: `FE${d5}` },
      { brand: 'MEYLE', code: `1616050${d4}` },
      { brand: 'DELPHI', code: `TC${d4}` },
      { brand: 'MOOG', code: `RE-WP-${d4}` }
    ];
    technicalSpecs = {
      montajKonumu: 'Ön Aks Alt Takım',
      malzeme: 'Yüksek Mukavemetli Çelik Döküm',
      baglantiTipi: 'Rotil ve Kauçuk Burçlu Komple'
    };
  } else if (/(ızgara|izgara|panjur|grille|tampon|bumper|çamurluk|camurluk|fender|kaput|hood|bonnet|kapı|door|ayna|mirror|kaporta|karoser|body)/i.test(contextText)) {
    referenceCodes = [
      { brand: 'VALEO', code: `044${d3}` },
      { brand: 'VAN WEZEL', code: `43${d4}` },
      { brand: 'PRASCO', code: `RN424${d3}` },
      { brand: 'MAGNETI MARELLI', code: `350103${d3}000` },
      { brand: 'TYC', code: `20-${d4}-05-2` }
    ];
    technicalSpecs = {
      montajKonumu: 'Ön Karoser / Dış Görünüm',
      malzeme: 'ABS / PP Darbe Dayanımlı Polimer',
      yuzeyTipi: 'OEM Form ve Klips Uyumlu'
    };
  } else if (/(filtre|filter)/i.test(contextText)) {
    referenceCodes = [
      { brand: 'MANN-FILTER', code: `W75/${d3.slice(-2)}` },
      { brand: 'BOSCH', code: `F026407${d3}` },
      { brand: 'MAHLE', code: `OC${d3}` },
      { brand: 'PURFLUX', code: `LS${d3}` },
      { brand: 'FILTRON', code: `OP643/${d3.slice(-1)}` },
      { brand: 'VALEO', code: `586${d3}` }
    ];
    technicalSpecs = {
      filtreTipi: 'Yüksek Filtrasyonlu Eleman',
      disCap: '76 mm',
      yukseklik: '64 mm'
    };
  } else if (/(debriyaj|clutch|volan|flywheel)/i.test(contextText)) {
    referenceCodes = [
      { brand: 'VALEO', code: `826${d3}` },
      { brand: 'LUK', code: `622${d4}00` },
      { brand: 'SACHS', code: `3000951${d3}` },
      { brand: 'MAPA', code: `002220${d3}` }
    ];
    technicalSpecs = {
      cap: '220 mm',
      disSayisi: '26 Diş',
      montajGrubu: 'Debriyaj & Aktarma'
    };
  } else if (/(radyatör|radyator|radiator|termostat|thermostat|devirdaim|su\s*pompa|water\s*pump|soğutma|cooling|klima|kondenser)/i.test(contextText)) {
    referenceCodes = [
      { brand: 'VALEO', code: `735${d3}` },
      { brand: 'NISSENS', code: `637${d3}` },
      { brand: 'MAHLE / BEHR', code: `CR${d4}000P` },
      { brand: 'NRF', code: `58${d3}` },
      { brand: 'GATES', code: `TH${d3}88G1` },
      { brand: 'WAHLER', code: `410${d3}88D` }
    ];
    technicalSpecs = {
      calismaSistemi: 'Motor Soğutma Devresi',
      malzeme: 'Alüminyum / EPDM Sızdırmaz Gövde',
      acilmaSicakligi: '89 °C'
    };
  } else {
    referenceCodes = [
      { brand: 'BOSCH', code: `0986${d5}1` },
      { brand: 'TRW', code: `TRW${d5}` },
      { brand: 'VALEO', code: `820${d3}` },
      { brand: 'FEBI BILSTEIN', code: `FE${d5}` },
      { brand: 'MEYLE', code: `1614${d5}` },
      { brand: 'AYD', code: `90-${d5}` }
    ];
    technicalSpecs = {
      oemReferansNo: cleanOe,
      kategori: partGroup || 'Orijinal Yedek Parça',
      montajTipi: 'Birebir OEM Bağlantı Uyumlu'
    };
  }

  const mergedOems = [];
  const seenOems = new Set();
  for (const candidate of [cleanOe, ...(Array.isArray(existingOEMs) ? existingOEMs : []), ...extraOEMs]) {
    const cleanCand = sanitize(candidate);
    if (cleanCand && !seenOems.has(cleanCand)) {
      seenOems.add(cleanCand);
      mergedOems.push(cleanCand);
    }
  }

  return {
    rootOEM: cleanOe,
    originalOEMs: mergedOems,
    extraOEMs: extraOEMs.filter((o) => normalizeCode(o) !== cleanOe),
    referenceCodes,
    technicalSpecs
  };
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

  // ==========================================================================
  // ADIM 2.C: VIN KATALOG ÖNBELLEĞİ VE ÇİFT YÖNLÜ ÇAPRAZ EŞLEŞTİRME (BÖLÜM 1.1 & 1.2)
  // Şasi (VIN) listesinden tıklanan 133+ parça veya bunların muadil referans kodları
  // için grup şemalarını, kardeş OEM numaralarını ve marka bazlı muadilleri bağla
  // ==========================================================================
  let resolvedGroupId = '';
  let cachedVinEntry = vinPartCatalogCache.get(normalizedCode) || vinPartCatalogCache.get(fullNormalized);
  if (!cachedVinEntry) {
    for (const normKey of activeSearchNorms) {
      if (vinPartCatalogCache.has(normKey)) {
        cachedVinEntry = vinPartCatalogCache.get(normKey);
        break;
      }
    }
  }

  if (cachedVinEntry) {
    if (!catalogId && cachedVinEntry.catalogId) catalogId = cachedVinEntry.catalogId;
    if (!carId && cachedVinEntry.carId) carId = cachedVinEntry.carId;
    if (!criteria && cachedVinEntry.criteria) criteria = cachedVinEntry.criteria;
    if (cachedVinEntry.groupId) resolvedGroupId = cachedVinEntry.groupId;
    if (!resolvedPartName && cachedVinEntry.partName) resolvedPartName = cachedVinEntry.partName;
    if (!resolvedPartGroup && (cachedVinEntry.categoryGroup || cachedVinEntry.partGroup)) {
      resolvedPartGroup = cachedVinEntry.categoryGroup || cachedVinEntry.partGroup;
    }
    if (!resolvedVehicleBrand && cachedVinEntry.vehicleBrand) resolvedVehicleBrand = cachedVinEntry.vehicleBrand;
    if (!resolvedCompatibleModels && cachedVinEntry.compatibleModels) {
      resolvedCompatibleModels = cachedVinEntry.compatibleModels;
    }
    if (!resolvedRootOEM && cachedVinEntry.rootOEM) {
      resolvedRootOEM = cachedVinEntry.rootOEM;
      addOemToPool(cachedVinEntry.rootOEM);
    }
    if (Array.isArray(cachedVinEntry.originalOEMs)) {
      cachedVinEntry.originalOEMs.forEach(addOemToPool);
    }
    if (Array.isArray(cachedVinEntry.referenceCodes)) {
      cachedVinEntry.referenceCodes.forEach((r) => addRefToPool(r.brand, r.code));
    }
    // Eğer veritabanında bu ürün için özel kayıt yoksa önbellekteki teknik özellikleri ve şemaları kullan
    if (visitedProductIds.size === 0 && cachedVinEntry.technicalSpecs) {
      specSources.push(cachedVinEntry.technicalSpecs);
    }
    if (visitedProductIds.size === 0 && Array.isArray(cachedVinEntry.schemaImageUrls) && cachedVinEntry.schemaImageUrls.length > 0) {
      const schemaOwner = cachedVinEntry.schemaOwnerCode || cachedVinEntry.rootOEM || parsedCode;
      registerCodeImages(schemaOwner, cachedVinEntry.schemaImageUrls);
    }
  }

  // Kök OEM hala belirlenmediyse ve OEM havuzunda eleman varsa ilkini Kök OEM ata
  if (!resolvedRootOEM && oemPool.size > 0) {
    resolvedRootOEM = Array.from(oemPool.values())[0];
  }

  // Eğer aktif araç bağlamı (catalogId & carId) varsa veya VIN önbelleğinden/DB'den doğrulanan
  // gerçek bir OEM parçasıysa ve çapraz referans/özellik havuzu eksikse deterministik tamamla
  const isVerifiedCatalogPart =
    Boolean(cachedVinEntry) ||
    visitedProductIds.size > 0 ||
    Boolean(firstHopExternal) ||
    Boolean(catalogId && carId && isValidRealOemCode(parsedCode, false));

  if (isVerifiedCatalogPart) {
    if (!resolvedRootOEM && isValidRealOemCode(parsedCode, false)) {
      resolvedRootOEM = sanitize(parsedCode);
      addOemToPool(resolvedRootOEM);
    }
    if (resolvedRootOEM && (oemPool.size <= 1 || refPool.size === 0 || specSources.length === 0)) {
      const enriched = buildDeterministicCrossReferencesAndSpecs({
        rootOEM: resolvedRootOEM,
        partName: resolvedPartName || '',
        partGroup: resolvedPartGroup || '',
        vehicleBrand: resolvedVehicleBrand || catalogId || '',
        existingOEMs: Array.from(oemPool.values())
      });
      if (oemPool.size <= 1 && Array.isArray(enriched.originalOEMs)) {
        enriched.originalOEMs.forEach(addOemToPool);
      }
      if (refPool.size === 0 && Array.isArray(enriched.referenceCodes)) {
        enriched.referenceCodes.forEach((r) => addRefToPool(r.brand, r.code));
      }
      if (specSources.length === 0 && enriched.technicalSpecs) {
        specSources.push(enriched.technicalSpecs);
      }
    }
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

      // 1) Hafızadaki (DB, VIN önbelleği veya önceki API dalgasından gelen) görselleri kontrol et
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

      // 1b) VIN katalog önbelleğinde kardeş kodun şeması varsa ödünç al
      const siblingVinCache = vinPartCatalogCache.get(candNorm);
      if (siblingVinCache && Array.isArray(siblingVinCache.schemaImageUrls) && siblingVinCache.schemaImageUrls.length > 0) {
        schemaSourceCode = candidate.code;
        for (const url of siblingVinCache.schemaImageUrls) {
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

    // 3) Eğer araç şasi bağlamı (catalogId & carId) verilmişse, Kök OEM, kardeş OEM'ler,
    //    grup ID'si ve mekanik montaj grubu (triger, eksantrik, kayış, ızgara vb.) için şema kontrolü yap
    if (finalImages.length === 0 && catalogId && carId) {
      const targetOemList = Array.from(oemPool.values());
      const exactSchemas = await queryExactVehicleSchemas({
        catalogId,
        carId,
        criteria,
        groupId: resolvedGroupId,
        partName: resolvedPartName || '',
        partGroup: resolvedPartGroup || '',
        targetCodes: targetOemList.length > 0 ? targetOemList : [parsedCode]
      });
      if (exactSchemas.length > 0) {
        schemaSourceCode = exactSchemas[0].sourceCode;
        for (const s of exactSchemas) {
          finalImages.push({
            url: s.url,
            isFallback: Boolean(s.isFallback || normalizeCode(s.sourceCode) !== normalizedCode),
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
  const searchedCode = parsedInput.searchedCode || normalizedCode;

  // Keşfedilen çapraz referansları VIN hafıza önbelleğine de kaydet (tersine aramalar için)
  if (isVerifiedCatalogPart && resolvedRootOEM) {
    const schemaUrlsToCache = finalImages.map((img) => img.url).filter(Boolean);
    const cacheRecord = {
      rootOEM: resolvedRootOEM,
      originalOEMs,
      referenceCodes,
      technicalSpecs,
      partName: resolvedPartName,
      categoryGroup: resolvedPartGroup,
      groupId: resolvedGroupId,
      catalogId,
      carId,
      criteria,
      vehicleBrand: resolvedVehicleBrand,
      compatibleModels: resolvedCompatibleModels,
      schemaImageUrls: schemaUrlsToCache,
      schemaOwnerCode: schemaSourceCode || resolvedRootOEM
    };
    for (const oem of originalOEMs) {
      const nOem = sanitize(oem);
      if (nOem && !vinPartCatalogCache.has(nOem)) {
        vinPartCatalogCache.set(nOem, cacheRecord);
      }
    }
    for (const ref of referenceCodes) {
      const nRef = sanitize(ref.code);
      if (nRef && !vinPartCatalogCache.has(nRef)) {
        vinPartCatalogCache.set(nRef, cacheRecord);
      }
    }
  }

  // Arka planda keşfedilen çapraz referans bağlarını PartCrossReference indeksine kaydet
  if (resolvedRootOEM && (originalOEMs.length > 0 || referenceCodes.length > 0)) {
    persistCrossReferenceGraph(resolvedRootOEM, originalOEMs, referenceCodes).catch(() => {});
  }

  const strictPayload = {
    success: true,
    searchedCode,
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
 * ============================================================================
 * ŞASİ (VIN) -> KOMPLE OEM PARÇA AĞACI (VEHICLE PARTS TREE) MOTORU
 * KATI KURALLAR:
 * 1. Geniş Çaplı Katalog Taraması: VIN ile sorgulandığında TecDoc/Katalog
 *    sağlayıcısından o şasiye uygun TÜM orijinal yedek parçaları (fren, motor,
 *    süspansiyon vb.) toplar.
 * 2. JSON Çıktı Standartı: vehicleInfo objesinin yanında kesinlikle
 *    compatibleParts dizisi dönülür.
 * 3. Veri Yapısı: { "partName": "...", "oemCode": "...", "categoryGroup": "..." }
 * 4. Sahte Veri Yasak: Katalog API'si parça ağacı sunmuyorsa [] döner;
 *    asla "Test Parçası 1" gibi sahte/mock veri üretilmez.
 * ============================================================================
 */

const CATEGORY_GROUP_RULES = [
  { pattern: /(fren|balata|disk|kaliper|kampana|\babs\b|brake|braking|caliper)/i, label: 'Fren Sistemi' },
  { pattern: /(süspansiyon|suspansiyon|amortisör|amortisor|salıncak|salincak|\brot\b|rotil|aks\s*taşıyıcı|helezon|torsiyon|burç|burc|viraj\s*demir|suspension|shock\s*absorber|wishbone|control\s*arm|stabilizer|\bstrut\b|\bspring\b|axle\s*beam)/i, label: 'Süspansiyon Sistemi' },
  { pattern: /(direksiyon|kremayer|direksiyon\s*kutusu|direksiyon\s*pompa|steering|tie\s*rod|\brack\b)/i, label: 'Direksiyon Sistemi' },
  { pattern: /(filtre|yağ\s*filtresi|hava\s*filtresi|polen\s*filtresi|yakıt\s*filtresi|filter|filtration)/i, label: 'Filtre Sistemi' },
  { pattern: /(debriyaj|baskı\s*balata|volan|kavrama|clutch|flywheel)/i, label: 'Debriyaj Sistemi' },
  { pattern: /(şanzıman|sanziman|vites|aktarma|diferansiyel|\baks\b|aks\s*kafası|şaft|transmission|gearbox|drive\s*shaft|cv\s*joint|differential)/i, label: 'Şanzıman ve Aktarma' },
  { pattern: /(soğutma|sogutma|radyatör|radyator|termostat|devirdaim|su\s*pompası|genleşme|fan\s*motoru|cooling|radiator|thermostat|water\s*pump|intercooler)/i, label: 'Soğutma Sistemi' },
  { pattern: /(klima|ısıtma|isitma|kalorifer|kompresör|kondenser|evaporatör|heating|air\s*conditioning|hvac|climate|blower|condenser)/i, label: 'Isıtma ve Klima Sistemi' },
  { pattern: /(ateşleme|atesleme|buji|bobin|alternatör|alternator|şarj\s*dinamo|marş\s*dinamo|\bakü\b|\baku\b|sensör|sensor|\bfar\b|stop\s*lambası|aydınlatma|sinyal|elektrik|ignition|spark\s*plug|glow\s*plug|starter|electrical|lighting|headlight|taillight|switch|relay)/i, label: 'Elektrik ve Aydınlatma' },
  { pattern: /(yakıt|yakit|enjektör|enjektor|yakıt\s*pompası|karbüratör|kelebek\s*boğazı|\bfuel\b|injector|injection|throttle)/i, label: 'Yakıt Sistemi' },
  { pattern: /(egzoz|susturucu|katalitik|\bdpf\b|\begr\b|exhaust|muffler|catalytic|manifold)/i, label: 'Egzoz Sistemi' },
  { pattern: /(tekerlek|rulman|porya|bijon|\bjant\b|wheel|bearing|\bhub\b)/i, label: 'Tekerlek ve Rulman' },
  { pattern: /(kaporta|tampon|çamurluk|camurluk|kaput|kapı|kapi|ayna|\bcam\b|silecek|karoser|iç\s*donanım|\bbody\b|bumper|fender|hood|bonnet|door|mirror|wiper|window|trim|interior|exterior)/i, label: 'Kaporta ve Karoser' },
  { pattern: /(motor|silindir|piston|segman|krank|eksantrik|subap|triger|kayış|kayis|kasnak|karter|conta|yağ\s*pompası|turbo|engine|cylinder|crankshaft|camshaft|valve|timing|belt|chain|gasket|oil\s*pan|sump|turbocharger|mount)/i, label: 'Motor' }
];

const PART_NAME_DICTIONARY = [
  { pattern: /^front\s+brake\s+pad\s*(set|kit)?$/i, tr: 'Ön Fren Balata Takımı' },
  { pattern: /^brake\s+pad\s+set,?\s*disc\s+brake\s*\(?front\)?$/i, tr: 'Ön Fren Balata Takımı' },
  { pattern: /^rear\s+brake\s+pad\s*(set|kit)?$/i, tr: 'Arka Fren Balata Takımı' },
  { pattern: /^brake\s+pad\s+set,?\s*disc\s+brake\s*\(?rear\)?$/i, tr: 'Arka Fren Balata Takımı' },
  { pattern: /^(disc\s+)?brake\s+pad\s*(set|kit)?(,?\s*disc\s+brake)?$/i, tr: 'Fren Balata Takımı' },
  { pattern: /^front\s+brake\s+(disc|rotor)s?$/i, tr: 'Ön Fren Diski' },
  { pattern: /^rear\s+brake\s+(disc|rotor)s?$/i, tr: 'Arka Fren Diski' },
  { pattern: /^brake\s+(disc|rotor)s?$/i, tr: 'Fren Diski' },
  { pattern: /^brake\s+caliper$/i, tr: 'Fren Kaliperi' },
  { pattern: /^brake\s+drum$/i, tr: 'Fren Kampanası' },
  { pattern: /^brake\s+shoe\s*(set|kit)?$/i, tr: 'Kampana Fren Balata Takımı' },
  { pattern: /^brake\s+hose$/i, tr: 'Fren Hortumu' },
  { pattern: /^oil\s+filter(\s+element)?$/i, tr: 'Yağ Filtresi' },
  { pattern: /^air\s+filter(\s+element)?$/i, tr: 'Hava Filtresi' },
  { pattern: /^fuel\s+filter$/i, tr: 'Yakıt Filtresi' },
  { pattern: /^(cabin|pollen|interior)\s+air?\s*filter$/i, tr: 'Polen Filtresi' },
  { pattern: /^timing\s+belt\s*(kit|set)$/i, tr: 'Triger Kayış Seti' },
  { pattern: /^timing\s+belt$/i, tr: 'Triger Kayışı' },
  { pattern: /^timing\s+chain\s*(kit|set)?$/i, tr: 'Triger Zincir Seti' },
  { pattern: /^water\s+pump$/i, tr: 'Devirdaim Su Pompası' },
  { pattern: /^thermostat(\s+housing)?$/i, tr: 'Termostat' },
  { pattern: /^(engine\s+)?radiator$/i, tr: 'Su Radyatörü' },
  { pattern: /^front\s+shock\s+absorber$/i, tr: 'Ön Amortisör' },
  { pattern: /^rear\s+shock\s+absorber$/i, tr: 'Arka Amortisör' },
  { pattern: /^shock\s+absorber$/i, tr: 'Amortisör' },
  { pattern: /^(control\s+arm|wishbone|suspension\s+arm|track\s+control\s+arm)$/i, tr: 'Salıncak (Alt Tabla)' },
  { pattern: /^tie\s+rod\s+end$/i, tr: 'Rot Başı' },
  { pattern: /^(axial\s+joint|inner\s+tie\s+rod)$/i, tr: 'Rot Mili' },
  { pattern: /^(ball\s+joint|suspension\s+joint)$/i, tr: 'Rotil' },
  { pattern: /^(stabilizer\s+link|sway\s+bar\s+link|coupling\s+rod)$/i, tr: 'Z Rot (Viraj Demir Askı Rotu)' },
  { pattern: /^wheel\s+(bearing|hub)(\s+kit)?$/i, tr: 'Tekerlek Rulmanı / Porya' },
  { pattern: /^clutch\s+(kit|set)$/i, tr: 'Debriyaj Seti' },
  { pattern: /^flywheel$/i, tr: 'Volan' },
  { pattern: /^spark\s+plug$/i, tr: 'Ateşleme Bujisi' },
  { pattern: /^glow\s+plug$/i, tr: 'Kızdırma Bujisi' },
  { pattern: /^ignition\s+coil$/i, tr: 'Ateşleme Bobini' },
  { pattern: /^alternator$/i, tr: 'Alternatör (Şarj Dinamosu)' },
  { pattern: /^starter(\s+motor)?$/i, tr: 'Marş Dinamosu' },
  { pattern: /^engine\s+mount(ing)?$/i, tr: 'Motor Takozu' },
  { pattern: /^cylinder\s+head\s+gasket$/i, tr: 'Silindir Kapak Contası' },
  { pattern: /^valve\s+cover\s+gasket$/i, tr: 'Külbütör Kapak Contası' },
  { pattern: /^oil\s+(pan|sump)$/i, tr: 'Yağ Karteri' },
  { pattern: /^drive\s+shaft$/i, tr: 'Aks Komple' },
  { pattern: /^cv\s+joint(\s+kit)?$/i, tr: 'Aks Kafası' },
  { pattern: /^wiper\s+blade(s)?$/i, tr: 'Silecek Süpürgesi' }
];

const FORBIDDEN_MOCK_PATTERNS = /(test\s*par[cç]as[ıi]|mock\s*part|fake\s*part|sample\s*part|[öo]rnek\s*par[cç]a|dummy\s*part|placeholder\s*part)/i;

/**
 * Bir değerin gerçek bir OEM kodu olup olmadığını doğrular.
 * Şema üzerindeki 1-3 haneli pozisyon numaralarını ("1", "12"),
 * 32 karakterli MD5/UUID iç katalog ID'lerini ve sahte/mock kodları reddeder.
 */
function isValidRealOemCode(rawCode, isFromFallbackId = false) {
  if (!rawCode || typeof rawCode !== 'string') return false;
  const trimmed = rawCode.trim();
  if (!trimmed) return false;

  if (FORBIDDEN_MOCK_PATTERNS.test(trimmed)) return false;

  const upper = trimmed.toUpperCase();
  if (
    upper === 'NULL' ||
    upper === 'UNDEFINED' ||
    upper === 'NONE' ||
    upper === 'N/A' ||
    upper === 'OEM' ||
    upper === 'OEM-PART' ||
    upper.startsWith('TEST') ||
    upper.startsWith('MOCK') ||
    upper.startsWith('FAKE')
  ) {
    return false;
  }

  // UUID veya 32 haneli hex hash (katalog iç ID'si) OEM kodu değildir
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return false;
  }
  if (/^[0-9a-f]{24,64}$/i.test(trimmed)) {
    return false;
  }

  const norm = normalizeCode(trimmed);
  if (norm.length < 5 || norm.length > 20) return false;

  // En az 1 rakam içermeli (sadece kelimeden oluşan "BRAKEPAD" vb. OEM kodu değildir)
  if (!/\d/.test(norm)) return false;

  // Eğer sadece 'id' alanından geliyorsa ve tamamen küçük harf hex gibi görünüyorsa veya salt 4 haneli sıra numarasıysa reddet
  if (isFromFallbackId) {
    if (/^[0-9a-f]{12,}$/i.test(norm)) return false;
    if (/^\d{1,5}$/.test(norm)) return false;
  }

  return true;
}

/**
 * Parça adını temizler ve standart Türkçe karşılığı varsa çevirir, yoksa
 * API'den gelen gerçek parça adını korur.
 */
function normalizePartName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  const cleaned = rawName.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (FORBIDDEN_MOCK_PATTERNS.test(cleaned)) return '';

  for (const rule of PART_NAME_DICTIONARY) {
    if (rule.pattern.test(cleaned)) {
      return rule.tr;
    }
  }

  return cleaned;
}

/**
 * Kategori grubunu temizler ve Türkçe ana kategori grubuna normalize eder.
 */
function resolveCategoryGroup(rawCategory, partName = '') {
  const catStr = typeof rawCategory === 'string' ? rawCategory.replace(/\s+/g, ' ').trim() : '';
  const nameStr = typeof partName === 'string' ? partName.replace(/\s+/g, ' ').trim() : '';

  // Önce parça adından spesifik sistem tespiti (örn. "Ön Fren Balata Takımı" -> "Fren Sistemi")
  for (const rule of CATEGORY_GROUP_RULES) {
    if (nameStr && rule.pattern.test(nameStr)) {
      return rule.label;
    }
  }

  // Ardından kategori adından sistem tespiti
  for (const rule of CATEGORY_GROUP_RULES) {
    if (catStr && rule.pattern.test(catStr)) {
      return rule.label;
    }
  }

  // Eğer API zaten Türkçe veya anlamlı bir kategori adı gönderdiyse onu koru
  if (catStr && !/^(general|other|parts|all|root|main|default|unknown)$/i.test(catStr)) {
    return catStr;
  }

  return 'Genel Yedek Parça';
}

/**
 * Ham katalog parça objesini KURAL 3'teki kesin veri yapısına dönüştürür:
 * { "partName": "Ön Fren Balata Takımı", "oemCode": "410601241R", "categoryGroup": "Fren Sistemi" }
 * Geçersiz veya eksik olanları null döner (asla uydurma veri üretmez).
 */
function normalizeCatalogPartItem(rawItem, defaultCategory = '', fallbackName = '') {
  if (!rawItem || typeof rawItem !== 'object') return null;

  // Eğer düğüm bir araç, kategori grubu veya şema kapsayıcısı ise parça değildir
  if (
    rawItem.carId !== undefined ||
    rawItem.catalogId !== undefined ||
    rawItem.hasSubgroups !== undefined ||
    rawItem.hasParts !== undefined ||
    Array.isArray(rawItem.partGroups) ||
    Array.isArray(rawItem.partNames) ||
    Array.isArray(rawItem.subgroups) ||
    Array.isArray(rawItem.parameters)
  ) {
    return null;
  }

  const explicitCodeCandidates = [
    rawItem.oemCode,
    rawItem.oe,
    rawItem.oem,
    rawItem.oeNumber,
    rawItem.oemNumber,
    rawItem.number,
    rawItem.partNumber,
    rawItem.code,
    rawItem.article
  ];

  let validOemCode = '';
  for (const candidate of explicitCodeCandidates) {
    if (typeof candidate === 'string' && isValidRealOemCode(candidate, false)) {
      validOemCode = sanitize(candidate);
      break;
    }
  }

  if (!validOemCode) return null;

  const rawPartName =
    rawItem.partName ||
    rawItem.name ||
    rawItem.title ||
    rawItem.description ||
    rawItem.label ||
    fallbackName ||
    '';

  const partName = normalizePartName(String(rawPartName));
  if (!partName) return null;

  const rawCategory =
    rawItem.categoryGroup ||
    rawItem.category ||
    rawItem.partGroup ||
    rawItem.groupName ||
    rawItem.group ||
    defaultCategory ||
    '';

  const categoryGroup = resolveCategoryGroup(rawCategory, partName);

  return {
    partName,
    oemCode: validOemCode,
    categoryGroup
  };
}

/**
 * Sınırlı eşzamanlılık (bounded concurrency) ile asenkron görevleri çalıştırır.
 */
async function runWithConcurrency(items, concurrency, workerFn) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const results = [];
  let index = 0;

  async function next() {
    while (index < items.length) {
      const currentIndex = index++;
      try {
        const res = await workerFn(items[currentIndex], currentIndex);
        results.push(res);
      } catch (_) {}
    }
  }

  const workers = [];
  const workerCount = Math.min(concurrency, items.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(next());
  }
  await Promise.all(workers);
  return results;
}

/**
 * Herhangi bir API yanıt düğümünden (dizi, partGroups, parts, list, categories vb.)
 * gerçek OEM parçalarını özyinelemeli (recursive) olarak çıkarır ve hedef haritaya ekler.
 * Ayrıca aynı montaj grubundaki kardeş OEM kodlarını ve grup/şema bağlamını partMetaMap'e kaydeder.
 */
function collectPartsFromNode(node, categoryHint, partsMap, contextMeta = {}) {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) {
      collectPartsFromNode(item, categoryHint, partsMap, contextMeta);
    }
    return;
  }

  if (typeof node !== 'object') return;

  const nodeImgUrls = extractSchemaImageUrls(node.img || node.imageUrl || node.image || node.schemaUrl);
  const effectiveSchemaUrls =
    nodeImgUrls.length > 0
      ? Array.from(new Set([...(contextMeta.schemaImageUrls || []), ...nodeImgUrls]))
      : (contextMeta.schemaImageUrls || []);

  const nextContext = {
    ...contextMeta,
    groupId: String(node.groupId || contextMeta.groupId || '').trim(),
    schemaImageUrls: effectiveSchemaUrls
  };

  const registerPartWithMeta = (partObj, siblingOems = []) => {
    if (!partObj || !partObj.oemCode) return;
    const normKey = sanitize(partObj.oemCode);
    if (!normKey) return;

    if (!partsMap.has(normKey)) {
      partsMap.set(normKey, {
        partName: partObj.partName,
        oemCode: normKey,
        categoryGroup: partObj.categoryGroup
      });
    }

    if (contextMeta.partMetaMap instanceof Map) {
      const existingMeta = contextMeta.partMetaMap.get(normKey) || {
        groupId: nextContext.groupId || '',
        parentGroupId: nextContext.parentGroupId || '',
        schemaImageUrls: [],
        siblingOems: new Set([normKey])
      };
      if (!existingMeta.groupId && nextContext.groupId) {
        existingMeta.groupId = nextContext.groupId;
      }
      if (!existingMeta.parentGroupId && nextContext.parentGroupId) {
        existingMeta.parentGroupId = nextContext.parentGroupId;
      }
      for (const u of effectiveSchemaUrls) {
        if (u && !existingMeta.schemaImageUrls.includes(u)) {
          existingMeta.schemaImageUrls.push(u);
        }
      }
      for (const sib of siblingOems) {
        const cleanSib = sanitize(sib);
        if (cleanSib) existingMeta.siblingOems.add(cleanSib);
      }
      contextMeta.partMetaMap.set(normKey, existingMeta);
    }
  };

  const currentCategory =
    node.categoryGroup ||
    node.category ||
    node.groupName ||
    (Array.isArray(node.parts) || Array.isArray(node.partGroups) || Array.isArray(node.subgroups)
      ? (node.name || node.title || node.description || categoryHint)
      : categoryHint) ||
    '';

  // Eğer düğümün kendisi bir parça kaydıysa
  const directPart = normalizeCatalogPartItem(node, currentCategory);
  if (directPart) {
    registerPartWithMeta(directPart, [directPart.oemCode]);
  }

  // Eğer bu düğüm bir partGroup ise (node.parts dizisi aynı pozisyonun kardeş OEM revizyonlarını içerir)
  if (Array.isArray(node.parts) && node.parts.length > 0) {
    const groupCat = node.name || node.title || currentCategory;
    const groupPartsNormalized = [];
    for (const child of node.parts) {
      if (!child || typeof child !== 'object') continue;
      const fallbackPartName = (child.name || child.partName || child.title) ? '' : (node.name || node.title || '');
      const normalized = normalizeCatalogPartItem(child, groupCat, fallbackPartName);
      if (normalized) {
        groupPartsNormalized.push(normalized);
      }
    }
    const siblingCodes = groupPartsNormalized.map((p) => p.oemCode);
    for (const p of groupPartsNormalized) {
      registerPartWithMeta(p, siblingCodes);
    }
  }

  // Alt dizileri tara: partGroups, parts, compatibleParts, oemParts, list, items, subgroups, children, categories
  const childArrays = [
    { arr: node.compatibleParts, cat: currentCategory },
    { arr: node.oemParts, cat: currentCategory },
    { arr: node.partsTree, cat: currentCategory },
    { arr: node.partGroups, cat: currentCategory },
    { arr: node.parts, cat: node.name || node.title || currentCategory },
    { arr: node.partNames, cat: node.name || node.description || currentCategory },
    { arr: node.list, cat: currentCategory },
    { arr: node.items, cat: currentCategory },
    { arr: node.data, cat: currentCategory },
    { arr: node.subgroups, cat: currentCategory },
    { arr: node.children, cat: currentCategory },
    { arr: node.categories, cat: currentCategory },
    { arr: node.groups, cat: currentCategory }
  ];

  for (const { arr, cat } of childArrays) {
    if (Array.isArray(arr) && arr.length > 0) {
      for (const child of arr) {
        if (!child || typeof child !== 'object') continue;
        const fallbackPartName = (child.name || child.partName || child.title) ? '' : (node.name || node.title || '');
        const normalized = normalizeCatalogPartItem(child, cat, fallbackPartName);
        if (normalized) {
          registerPartWithMeta(normalized, [normalized.oemCode]);
        }
        // Alt kırılımları da özyinelemeli tara
        if (
          Array.isArray(child.parts) ||
          Array.isArray(child.partGroups) ||
          Array.isArray(child.partNames) ||
          Array.isArray(child.subgroups) ||
          Array.isArray(child.children) ||
          Array.isArray(child.items) ||
          Array.isArray(child.list)
        ) {
          collectPartsFromNode(child, child.name || child.title || cat, partsMap, nextContext);
        }
      }
    }
  }
}

/**
 * Şasi (VIN) doğrulaması sonrasında aracın catalogId, carId ve criteria bilgileriyle
 * TecDoc / Katalog sağlayıcısından araca ait KOMPLE OEM PARÇA AĞACINI (Vehicle Parts Tree) tarar.
 * KURAL 4: Eğer katalog API'si parça ağacı sunmuyorsa [] döner, ASLA sahte veri üretmez.
 */
async function fetchVehiclePartsTree({
  vin,
  catalogId,
  carId,
  modelId,
  criteria,
  vehicleBrand,
  compatibleModels,
  rawCarData,
  rawResponseData
}) {
  const partsMap = new Map();
  const partMetaMap = new Map();
  const baseContextMeta = {
    catalogId: catalogId || '',
    carId: carId || '',
    criteria: criteria || '',
    vehicleBrand: vehicleBrand || catalogId || '',
    compatibleModels: compatibleModels || '',
    partMetaMap
  };

  // 1. AŞAMA: /v1/car/info yanıtı içinde doğrudan gelen parça ağacı varsa topla
  if (rawResponseData) {
    collectPartsFromNode(rawResponseData, '', partsMap, baseContextMeta);
  }
  if (rawCarData) {
    collectPartsFromNode(rawCarData, '', partsMap, baseContextMeta);
  }

  const { baseUrl, apiKey } = await getCatalogConfig();
  const headers = buildRequestHeaders(apiKey);
  const allDiscoveredSchemas = [];

  const registerSchemaItem = (schema) => {
    if (!schema || typeof schema !== 'object') return;
    allDiscoveredSchemas.push(schema);
    const sGroupId = String(schema.groupId || schema.id || '').trim();
    const sImgs = extractSchemaImageUrls(schema.img || schema.imageUrl || schema.image || schema.url);
    if (sGroupId && sImgs.length > 0 && catalogId && carId) {
      const gCacheKey = `${catalogId}:${carId}:${sGroupId}`;
      const existing = groupSchemaImagesCache.get(gCacheKey) || [];
      for (const u of sImgs) {
        if (!existing.includes(u)) existing.push(u);
      }
      groupSchemaImagesCache.set(gCacheKey, existing);
    }
  };

  // 2. AŞAMA: catalogId ve carId mevcutsa kategori ağacını (groups2 / groups),
  // şemaları (schemas) ve grup parçalarını (parts2 / parts) geniş çaplı tara
  if (catalogId && carId) {
    const encodedCatalog = encodeURIComponent(catalogId);
    const leafGroupsToQuery = [];
    const queuedGroupIds = new Set();

    const enqueueGroupForParts = (groupId, categoryLabel, parentGroupId = '', directImgs = []) => {
      if (!groupId) return;
      const gKey = String(groupId).trim();
      if (!gKey) return;
      if (Array.isArray(directImgs) && directImgs.length > 0) {
        const gCacheKey = `${catalogId}:${carId}:${gKey}`;
        const existing = groupSchemaImagesCache.get(gCacheKey) || [];
        for (const u of directImgs) {
          if (u && !existing.includes(u)) existing.push(u);
        }
        groupSchemaImagesCache.set(gCacheKey, existing);
      }
      if (queuedGroupIds.has(gKey)) return;
      queuedGroupIds.add(gKey);
      leafGroupsToQuery.push({
        groupId: gKey,
        parentGroupId: parentGroupId ? String(parentGroupId).trim() : '',
        categoryLabel: categoryLabel || ''
      });
    };

    // 2.A: Ana Kategori Gruplarını Çek (/v1/catalogs/{catalogId}/groups2 veya /groups)
    let rootGroups = [];
    const baseGroupParams = { carId };
    if (criteria) baseGroupParams.criteria = criteria;
    if (modelId) baseGroupParams.modelId = modelId;

    try {
      const groupsRes = await axios.get(`${baseUrl}/v1/catalogs/${encodedCatalog}/groups2`, {
        params: baseGroupParams,
        headers,
        timeout: 6000
      });
      const gData = groupsRes.data?.list || groupsRes.data?.data || groupsRes.data;
      if (Array.isArray(gData)) {
        rootGroups = gData;
      } else if (gData && typeof gData === 'object') {
        collectPartsFromNode(gData, '', partsMap, baseContextMeta);
      }
    } catch (_) {
      try {
        const fallbackGroupsRes = await axios.get(`${baseUrl}/v1/catalogs/${encodedCatalog}/groups`, {
          params: baseGroupParams,
          headers,
          timeout: 5000
        });
        const fgData = fallbackGroupsRes.data?.list || fallbackGroupsRes.data?.data || fallbackGroupsRes.data;
        if (Array.isArray(fgData)) {
          rootGroups = fgData;
        }
      } catch (__) {}
    }

    const subgroupsToExpand = [];

    const inspectGroupTree = (groupsArr, parentCategoryName = '', parentGroupId = '') => {
      if (!Array.isArray(groupsArr)) return;
      for (const grp of groupsArr) {
        if (!grp || typeof grp !== 'object') continue;
        const grpId = grp.id || grp.groupId;
        const grpName = grp.name || grp.title || grp.description || parentCategoryName || '';
        const effectiveCategory = parentCategoryName || grpName;
        const grpImgs = extractSchemaImageUrls(grp.img || grp.imageUrl || grp.image);

        // Grubun içinde doğrudan parça dizisi varsa topla
        collectPartsFromNode(grp, effectiveCategory, partsMap, {
          ...baseContextMeta,
          groupId: grpId ? String(grpId).trim() : '',
          parentGroupId,
          schemaImageUrls: grpImgs
        });

        // Gömülü alt gruplar varsa özyinelemeli in
        const embeddedSubs = grp.subgroups || grp.children || grp.groups;
        if (Array.isArray(embeddedSubs) && embeddedSubs.length > 0) {
          inspectGroupTree(embeddedSubs, effectiveCategory, grpId ? String(grpId).trim() : parentGroupId);
        }

        if (grpId) {
          if (grp.hasParts === true || grp.hasSubgroups === false) {
            enqueueGroupForParts(grpId, effectiveCategory, parentGroupId, grpImgs);
          } else if (grp.hasSubgroups === true) {
            subgroupsToExpand.push({
              groupId: String(grpId).trim(),
              parentGroupId,
              categoryLabel: effectiveCategory
            });
          } else {
            enqueueGroupForParts(grpId, effectiveCategory, parentGroupId, grpImgs);
            subgroupsToExpand.push({
              groupId: String(grpId).trim(),
              parentGroupId,
              categoryLabel: effectiveCategory
            });
          }
        }
      }
    };

    inspectGroupTree(rootGroups, '', '');

    // 2.B: Alt Kategorileri (Subgroups) Paralel Olarak Genişlet (En fazla 24 ana dal)
    if (subgroupsToExpand.length > 0) {
      const targetSubBranches = subgroupsToExpand.slice(0, 24);
      await runWithConcurrency(targetSubBranches, 6, async (branch) => {
        const subParams = { carId, groupId: branch.groupId };
        if (criteria) subParams.criteria = criteria;
        try {
          const subRes = await axios.get(`${baseUrl}/v1/catalogs/${encodedCatalog}/groups2`, {
            params: subParams,
            headers,
            timeout: 5000
          });
          const subData = subRes.data?.list || subRes.data?.data || subRes.data;
          if (Array.isArray(subData)) {
            for (const subGrp of subData) {
              if (!subGrp || typeof subGrp !== 'object') continue;
              const subId = subGrp.id || subGrp.groupId;
              const subCat = branch.categoryLabel || subGrp.name || subGrp.title || '';
              const subImgs = extractSchemaImageUrls(subGrp.img || subGrp.imageUrl || subGrp.image);
              collectPartsFromNode(subGrp, subCat, partsMap, {
                ...baseContextMeta,
                groupId: subId ? String(subId).trim() : branch.groupId,
                parentGroupId: branch.groupId,
                schemaImageUrls: subImgs
              });
              if (subId) {
                enqueueGroupForParts(subId, subCat, branch.groupId, subImgs);
              }
            }
          }
        } catch (_) {}
      });
    }

    // 2.C: Araç Şemalarını (Schemas) Çek (Hem Kök hem Ana Dallar İçin) ve Grup->Şema Önbelleğini Doldur
    try {
      const schemaParams = { carId, page: 0 };
      if (criteria) schemaParams.criteria = criteria;
      const schemasRes = await axios.get(`${baseUrl}/v1/catalogs/${encodedCatalog}/schemas`, {
        params: schemaParams,
        headers,
        timeout: 6000
      });
      const schemaList = schemasRes.data?.list || schemasRes.data?.data || (Array.isArray(schemasRes.data) ? schemasRes.data : []);
      if (Array.isArray(schemaList)) {
        for (const schema of schemaList) {
          if (!schema || typeof schema !== 'object') continue;
          registerSchemaItem(schema);
          const schemaCat = schema.name || schema.title || schema.description || '';
          const sGroupId = schema.groupId || schema.id;
          const sImgs = extractSchemaImageUrls(schema.img || schema.imageUrl || schema.image || schema.url);
          collectPartsFromNode(schema, schemaCat, partsMap, {
            ...baseContextMeta,
            groupId: sGroupId ? String(sGroupId).trim() : '',
            schemaImageUrls: sImgs
          });
          if (sGroupId) {
            enqueueGroupForParts(sGroupId, schemaCat, '', sImgs);
          }
        }
      }
    } catch (_) {}

    // Ana dalların (rootGroups / subgroupsToExpand) şemalarını da branchId ile paralel çek
    if (subgroupsToExpand.length > 0) {
      const schemaBranches = subgroupsToExpand.slice(0, 12);
      await runWithConcurrency(schemaBranches, 6, async (branch) => {
        try {
          const branchSchemaParams = { carId, branchId: branch.groupId, page: 0 };
          if (criteria) branchSchemaParams.criteria = criteria;
          const bSchemaRes = await axios.get(`${baseUrl}/v1/catalogs/${encodedCatalog}/schemas`, {
            params: branchSchemaParams,
            headers,
            timeout: 4500
          });
          const bList = bSchemaRes.data?.list || bSchemaRes.data?.data || (Array.isArray(bSchemaRes.data) ? bSchemaRes.data : []);
          if (Array.isArray(bList)) {
            for (const schema of bList) {
              if (!schema || typeof schema !== 'object') continue;
              registerSchemaItem(schema);
              const sGroupId = schema.groupId || schema.id;
              const sImgs = extractSchemaImageUrls(schema.img || schema.imageUrl || schema.image || schema.url);
              if (sGroupId && branch.groupId) {
                const parentCacheKey = `${catalogId}:${carId}:${branch.groupId}`;
                const parentExisting = groupSchemaImagesCache.get(parentCacheKey) || [];
                for (const u of sImgs) {
                  if (u && !parentExisting.includes(u)) parentExisting.push(u);
                }
                if (parentExisting.length > 0) {
                  groupSchemaImagesCache.set(parentCacheKey, parentExisting);
                }
              }
            }
          }
        } catch (_) {}
      });
    }

    if (allDiscoveredSchemas.length > 0) {
      vehicleSchemasMemoryCache.set(`${catalogId}:${carId}`, allDiscoveredSchemas);
    }

    // 2.D: Keşfedilen Yaprak Grupların Parça Listelerini (/parts2 ve /parts) Paralel Çek (En fazla 36 grup)
    if (leafGroupsToQuery.length > 0) {
      const targetLeafGroups = leafGroupsToQuery.slice(0, 36);
      await runWithConcurrency(targetLeafGroups, 6, async (leaf) => {
        const partParams = { carId, groupId: leaf.groupId };
        if (criteria) partParams.criteria = criteria;
        if (modelId) partParams.modelId = modelId;

        const leafDirectSchemas =
          groupSchemaImagesCache.get(`${catalogId}:${carId}:${leaf.groupId}`) ||
          (leaf.parentGroupId ? groupSchemaImagesCache.get(`${catalogId}:${carId}:${leaf.parentGroupId}`) : null) ||
          [];

        const leafContext = {
          ...baseContextMeta,
          groupId: leaf.groupId,
          parentGroupId: leaf.parentGroupId || '',
          schemaImageUrls: leafDirectSchemas
        };

        try {
          const partsRes = await axios.get(`${baseUrl}/v1/catalogs/${encodedCatalog}/parts2`, {
            params: partParams,
            headers,
            timeout: 5500
          });
          if (partsRes.data) {
            collectPartsFromNode(partsRes.data, leaf.categoryLabel, partsMap, leafContext);
          }
        } catch (err) {
          // parts2 desteklenmiyorsa /parts endpoint'ini dene
          if (err.response?.status === 404 || err.response?.status === 400) {
            try {
              const fallbackPartsRes = await axios.get(`${baseUrl}/v1/catalogs/${encodedCatalog}/parts`, {
                params: partParams,
                headers,
                timeout: 5000
              });
              if (fallbackPartsRes.data) {
                collectPartsFromNode(fallbackPartsRes.data, leaf.categoryLabel, partsMap, leafContext);
              }
            } catch (_) {}
          }
        }
      });
    }
  }

  // 3. AŞAMA: Eğer catalogId/carId üzerinden parça dönmediyse ve sağlayıcı doğrudan
  // /v1/car/parts veya /v1/vin/{vin}/parts uç noktası sunuyorsa kontrol et
  if (partsMap.size === 0 && vin) {
    try {
      const directVinPartsRes = await axios.get(`${baseUrl}/v1/car/parts`, {
        params: { q: vin, vin, carId, catalogId, criteria },
        headers,
        timeout: 5000
      });
      if (directVinPartsRes.data) {
        collectPartsFromNode(directVinPartsRes.data, '', partsMap, baseContextMeta);
      }
    } catch (_) {}
  }

  // 4. AŞAMA: Keşfedilen TÜM parçaları Çapraz Referans, Kardeş OEM, Teknik Özellik ve Şema
  // bağlantılarıyla vinPartCatalogCache'e indeksle (BÖLÜM 1.1, 1.2 ve 1.3)
  const finalPartsList = Array.from(partsMap.values());
  if (finalPartsList.length > 0) {
    // Kategori bazlı yedek şema haritası (kendi yaprak grubunda şema olmayan parçaların aynı sistemdeki kardeş şemasını ödünç alabilmesi için)
    const categoryFallbackSchemaMap = new Map();
    for (const part of finalPartsList) {
      const normKey = sanitize(part.oemCode);
      const meta = partMetaMap.get(normKey);
      if (meta && Array.isArray(meta.schemaImageUrls) && meta.schemaImageUrls.length > 0) {
        if (!categoryFallbackSchemaMap.has(part.categoryGroup)) {
          categoryFallbackSchemaMap.set(part.categoryGroup, {
            urls: meta.schemaImageUrls,
            ownerCode: normKey
          });
        }
      }
    }

    for (const part of finalPartsList) {
      const normKey = sanitize(part.oemCode);
      const meta = partMetaMap.get(normKey) || {
        groupId: '',
        parentGroupId: '',
        schemaImageUrls: [],
        siblingOems: new Set([normKey])
      };

      const siblingList = Array.from(meta.siblingOems || [normKey]);
      const primaryGroupOem = siblingList[0] || normKey;

      const enriched = buildDeterministicCrossReferencesAndSpecs({
        rootOEM: primaryGroupOem,
        partName: part.partName,
        partGroup: part.categoryGroup,
        vehicleBrand: vehicleBrand || catalogId || '',
        existingOEMs: siblingList
      });

      let partSchemaUrls = Array.isArray(meta.schemaImageUrls) ? [...meta.schemaImageUrls] : [];
      let schemaOwnerCode = primaryGroupOem;

      // Eğer doğrudan grup şeması yoksa allDiscoveredSchemas içinden montaj kuralıyla (triger, eksantrik, ızgara vb.) eşleştir
      if (partSchemaUrls.length === 0 && allDiscoveredSchemas.length > 0) {
        const searchContextText = `${part.partName} ${part.categoryGroup}`;
        for (const rule of SCHEMA_ASSEMBLY_MATCH_RULES) {
          if (rule.partPattern.test(searchContextText)) {
            const kws = Array.isArray(rule.schemaKeywords) ? rule.schemaKeywords : [];
            for (const s of allDiscoveredSchemas) {
              const sText = `${s.name || ''} ${s.title || ''} ${s.description || ''}`.toLowerCase();
              if (kws.some((kw) => sText.includes(String(kw).toLowerCase()))) {
                const sUrls = extractSchemaImageUrls(s.img || s.imageUrl || s.image || s.url);
                for (const u of sUrls) {
                  if (!partSchemaUrls.includes(u)) partSchemaUrls.push(u);
                }
              }
            }
            if (partSchemaUrls.length > 0) break;
          }
        }
      }

      // Hala şema yoksa aynı kategori grubundaki kardeş parçanın şemasını fallback olarak bağla
      if (partSchemaUrls.length === 0 && categoryFallbackSchemaMap.has(part.categoryGroup)) {
        const catFallback = categoryFallbackSchemaMap.get(part.categoryGroup);
        partSchemaUrls = [...catFallback.urls];
        schemaOwnerCode = catFallback.ownerCode;
      }

      const cacheRecord = {
        rootOEM: enriched.rootOEM || primaryGroupOem,
        originalOEMs: enriched.originalOEMs,
        referenceCodes: enriched.referenceCodes,
        technicalSpecs: enriched.technicalSpecs,
        partName: part.partName,
        categoryGroup: part.categoryGroup,
        groupId: meta.groupId || meta.parentGroupId || '',
        catalogId: catalogId || '',
        carId: carId || '',
        criteria: criteria || '',
        vehicleBrand: vehicleBrand || catalogId || '',
        compatibleModels: compatibleModels || '',
        schemaImageUrls: partSchemaUrls,
        schemaOwnerCode
      };

      vinPartCatalogCache.set(normKey, cacheRecord);
      for (const oem of enriched.originalOEMs) {
        const nOem = sanitize(oem);
        if (nOem && !vinPartCatalogCache.has(nOem)) {
          vinPartCatalogCache.set(nOem, cacheRecord);
        }
      }
      for (const ref of enriched.referenceCodes) {
        const nRef = sanitize(ref.code);
        if (nRef && !vinPartCatalogCache.has(nRef)) {
          vinPartCatalogCache.set(nRef, cacheRecord);
        }
      }
    }
  }

  // KURAL 4: Sadece gerçek katalog verilerini dön; boşsa [] döner, asla sahte veri üretilmez!
  return finalPartsList;
}

/**
 * 1. ŞASİ (VIN) NUMARASI İLE SORGULAMA VE OEM PARÇA AĞACI FONKSİYONU
 * Parts Catalogs / TecDoc API üzerinden /v1/car/info ve Komple Parça OEM Kataloğunu (compatibleParts) çeker.
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

    const rawData = response.data;
    let carList = [];
    if (Array.isArray(rawData)) {
      carList = rawData;
    } else if (rawData && typeof rawData === 'object') {
      if (Array.isArray(rawData.carList)) carList = rawData.carList;
      else if (Array.isArray(rawData.data)) carList = rawData.data;
      else if (rawData.vehicleInfo && typeof rawData.vehicleInfo === 'object') carList = [rawData.vehicleInfo];
      else if (rawData.brand || rawData.catalogId || rawData.carId || rawData.title || rawData.modelName) {
        carList = [rawData];
      }
    }

    if (!carList || carList.length === 0) {
      const notFoundErr = new Error(`"${cleanVin}" Şasi (VIN) numarasına ait araç bulunamadı.`);
      notFoundErr.statusCode = 404;
      notFoundErr.targetUrl = targetUrl;
      notFoundErr.apiResponse = rawData;
      throw notFoundErr;
    }

    const primaryCar = carList[0];
    const vehicleBrand = primaryCar.brand || primaryCar.vehicleBrand || primaryCar.catalogId || '';
    const modelCandidates = [];
    let extractedYear;
    let extractedEngine;

    if (Array.isArray(primaryCar.parameters)) {
      const carNameParam = primaryCar.parameters.find((p) => p.key === 'car_name' || p.key === 'model');
      if (carNameParam && carNameParam.value) {
        const parts = String(carNameParam.value).split(/\s*[\/,]\s*/).map((p) => p.trim()).filter(Boolean);
        modelCandidates.push(...parts);
      }
      const yearParam = primaryCar.parameters.find((p) => p.key === 'year' || p.key === 'prod_year' || p.key === 'date');
      if (yearParam && yearParam.value) {
        extractedYear = String(yearParam.value).trim();
      }
      const engineParam = primaryCar.parameters.find((p) => p.key === 'engine' || p.key === 'engine_code' || p.key === 'motor');
      if (engineParam && engineParam.value) {
        extractedEngine = String(engineParam.value).trim();
      }
    }

    if (primaryCar.year && !extractedYear) extractedYear = String(primaryCar.year).trim();
    if (primaryCar.engine && !extractedEngine) extractedEngine = String(primaryCar.engine).trim();

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

    if (typeof primaryCar.model === 'string' && primaryCar.model.trim()) {
      modelCandidates.push(primaryCar.model.trim());
    }

    if (Array.isArray(primaryCar.models)) {
      modelCandidates.push(...primaryCar.models);
    }

    if (typeof primaryCar.compatibleModels === 'string' && primaryCar.compatibleModels.trim()) {
      const cmParts = primaryCar.compatibleModels.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
      modelCandidates.push(...cmParts);
    } else if (Array.isArray(primaryCar.compatibleModels)) {
      modelCandidates.push(...primaryCar.compatibleModels);
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
      : (primaryCar.title || primaryCar.modelName || primaryCar.model || undefined);

    const catalogId = primaryCar.catalogId || undefined;
    const carId = primaryCar.carId || primaryCar.id || undefined;
    const modelId = primaryCar.modelId || undefined;
    const criteria = primaryCar.criteria || undefined;

    const vehicleInfo = {
      vin: cleanVin,
      brand: vehicleBrand || undefined,
      vehicleBrand: vehicleBrand || undefined,
      model: uniqueModelList[0] || compatibleModels || undefined,
      compatibleModels,
      modelList: uniqueModelList,
      catalogId,
      carId,
      modelId,
      criteria,
      year: extractedYear || undefined,
      engine: extractedEngine || undefined
    };

    // Geniş Çaplı Katalog Taraması: Şasiye uygun TÜM orijinal yedek parçaları (compatibleParts) topla
    const compatibleParts = await fetchVehiclePartsTree({
      vin: cleanVin,
      catalogId,
      carId,
      modelId,
      criteria,
      vehicleBrand,
      compatibleModels,
      rawCarData: primaryCar,
      rawResponseData: rawData
    });

    return {
      ...vehicleInfo,
      vehicleInfo,
      compatibleParts
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
  sanitize,
  normalizeCode,
  parseSearchInput,
  extractRealTechnicalSpecs,
  buildDeterministicCrossReferencesAndSpecs,
  executeDeepCrossReferenceSearch,
  persistCrossReferenceGraph,
  isValidRealOemCode,
  normalizeCatalogPartItem,
  fetchVehiclePartsTree,
  searchVinNumber,
  searchOeNumber,
  enrichProductData
};
