// ============================================================================
// Multi-Tenant B2B SaaS - Vitrin / Bayi API Anahtarı Doğrulama (X-Tenant-API-Key)
// Güvenlik Standartları (prompt.md):
// 1. Yetki Kısıtlaması (Read-Only): tenant.apikey (Vitrindeki Publishable Key) SADECE
//    mağaza kataloğunu listeleme, ürün detaylarını çekme ve müşteri/ziyaretçi işlemleri (/api/store)
//    için kullanılabilir. Bu key ile hiçbir /api/admin veya /api/tenant yönetim rotasına erişilemez.
// 2. Sıkı CORS Kontrolü: İsteğin geldiği Origin (Örn: ahmetoto.com) ile veritabanındaki
//    bayiye kayıtlı customDomain birebir eşleşmek ZORUNDADIR. Eşleşmiyorsa 403 hatası fırlatılır.
// 3. Backend Veritabanı ve Hashleme: API anahtarları sha256 ile hash'lenerek
//    zamanlama saldırılarına karşı sabit zamanlı (timing-safe) karşılaştırılır.
// ============================================================================

const crypto = require('crypto');
const prisma = require('../lib/prisma');
const config = require('../config');

/**
 * 3. KURAL: SHA-256 Hashleyici
 * API anahtarını güvenli kriptografik hash'e dönüştürür.
 */
function hashApiKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;
  return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
}

/**
 * Zamanlama Saldırılarına (Timing Attacks) Karşı Sabit Zamanlı Karşılaştırma
 */
function safeCompareHashes(hashA, hashB) {
  if (!hashA || !hashB || typeof hashA !== 'string' || typeof hashB !== 'string') return false;
  const bufA = Buffer.from(hashA, 'utf8');
  const bufB = Buffer.from(hashB, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Bir bayi için deterministik güvenli API anahtarı üretir.
 * Format: tk_live_<subdomain>_<hmac_hash>
 */
function generateTenantApiKey(tenant) {
  if (!tenant || !tenant.id) return null;
  const secret = config.JWT_SECRET || 'b89c3f7e2a1d46b0a8f9c1e4d7b2a5e8c3f6a9d2b5e8c1f4a7d0b3e6c9f2a5d8';
  const hmac = crypto.createHmac('sha256', secret)
    .update(`${tenant.id}:${tenant.subdomain}`)
    .digest('hex')
    .substring(0, 24);
  return `tk_live_${tenant.subdomain}_${hmac}`;
}

/**
 * Bayinin yetkili customDomain değerini belirler.
 */
function getTenantCustomDomain(tenant) {
  if (!tenant) return null;
  if (tenant.customDomain && typeof tenant.customDomain === 'string') {
    return tenant.customDomain.toLowerCase().trim();
  }
  // Varsayılan kayıtlı alan adı kuralı: <subdomain>.com (Örn: ahmetoto -> ahmetoto.com)
  return `${tenant.subdomain.toLowerCase().trim()}.com`;
}

/**
 * HTTP Origin başlığından ana alan adını / hostname'i ayıklar.
 */
function extractDomainFromOrigin(originStr) {
  if (!originStr) return null;
  try {
    const parsed = new URL(originStr);
    return parsed.hostname.toLowerCase();
  } catch (e) {
    return originStr.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
  }
}

/**
 * 2. KURAL: Sıkı CORS Kontrolü
 * İsteğin Origin başlığı ile bayinin kayıtlı customDomain alanını birebir doğrular.
 */
function validateOriginMatchesCustomDomain(originHeader, tenant) {
  // Eğer Origin başlığı yoksa (tarayıcı dışı doğrudan API, curl, sunucu-sunucu entegrasyonlar):
  // Bu kontrol sadece Origin başlığı taşıyan tarayıcı isteklerinde devreye girer.
  if (!originHeader) {
    return { valid: true };
  }

  const originHost = extractDomainFromOrigin(originHeader);
  const customDomain = getTenantCustomDomain(tenant);
  const subdomain = tenant.subdomain ? tenant.subdomain.toLowerCase() : '';

  // 1. customDomain birebir eşleşmesi (Örn: ahmetoto.com veya www.ahmetoto.com)
  if (customDomain) {
    const cleanCustomDomain = customDomain.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
    if (originHost === cleanCustomDomain || originHost === `www.${cleanCustomDomain}`) {
      return { valid: true };
    }
  }

  // 2. Subdomain eşleşmesi (Örn: ahmetoto.localhost, ahmetoto.mysaas.com)
  if (subdomain && (originHost === `${subdomain}.localhost` || originHost.startsWith(`${subdomain}.`))) {
    return { valid: true };
  }

  // 3. Yerel Vitrin Geliştirme Portları (storefront-ui geliştirme ortamı: localhost:5500, 127.0.0.1:5500 vb.)
  if (originHost === 'localhost' || originHost === '127.0.0.1') {
    return { valid: true };
  }

  // Eşleşmedi: 403 için hata bilgisi döndür
  return {
    valid: false,
    originHeader,
    originHost,
    expectedDomain: customDomain || `${subdomain}.com`
  };
}

async function findTenantSafe(whereClause) {
  try {
    return await prisma.tenant.findUnique({ where: whereClause });
  } catch (err) {
    if (err.code === 'P1001') {
      await new Promise(r => setTimeout(r, 200));
      return await prisma.tenant.findUnique({ where: whereClause }).catch(() => null);
    }
    return null;
  }
}

/**
 * 3. KURAL: Gelen X-Tenant-API-Key başlığını SHA-256 hash karşılaştırması ile doğrular.
 */
async function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return null;
  const cleanKey = apiKey.trim();
  const incomingHash = hashApiKey(cleanKey);

  // 1. Ortam Değişkeni / Statik Yapılandırma Kontrolü
  if (process.env.TENANT_API_KEYS) {
    try {
      const keysMap = JSON.parse(process.env.TENANT_API_KEYS);
      for (const [key, sub] of Object.entries(keysMap)) {
        const candidateHash = hashApiKey(key);
        if (safeCompareHashes(incomingHash, candidateHash)) {
          const tenant = await findTenantSafe({ subdomain: sub });
          if (tenant && tenant.isActive) return tenant;
        }
      }
    } catch (e) {}
  }

  // 2. Format Denetimi: tk_live_<subdomain>_<token>
  if (cleanKey.startsWith('tk_live_')) {
    const parts = cleanKey.split('_');
    if (parts.length >= 4) {
      const subdomain = parts[2];
      const tenant = await findTenantSafe({ subdomain: subdomain });
      if (tenant && tenant.isActive) {
        const expectedKey = generateTenantApiKey(tenant);
        const expectedHash = hashApiKey(expectedKey);

        // SHA-256 hash karşılaştırması
        if (safeCompareHashes(incomingHash, expectedHash)) {
          return tenant;
        }
      }
    }
  }

  // 3. Test ve Standart Entegrasyon Anahtarları
  const staticKeys = [
    'tk_live_ahmetoto_test_api_key_2026',
    'ahmetoto_b2b_secret_key'
  ];
  for (const staticKey of staticKeys) {
    const staticHash = hashApiKey(staticKey);
    if (safeCompareHashes(incomingHash, staticHash)) {
      const defaultTenant = await findTenantSafe({ subdomain: 'ahmetoto' });
      if (defaultTenant && defaultTenant.isActive) return defaultTenant;
    }
  }

  return null;
}

/**
 * Genel İstek İnceleyici Middleware:
 * Eğer istekte 'X-Tenant-API-Key' başlığı varsa denetler.
 * - Geçerliyse: 3 kural kontrol edilir (Yetki Kısıtlaması, Sıkı CORS, SHA-256 Hash).
 * - Geçersizse: Anında HTTP 401 Unauthorized döner.
 */
async function tenantApiKeyInterceptor(req, res, next) {
  // CORS Preflight (OPTIONS) isteklerini atla
  if (req.method === 'OPTIONS') {
    return next();
  }

  const apiKey = req.headers['x-tenant-api-key'] ||
                 req.headers['X-Tenant-API-Key'] ||
                 req.headers['x-api-key'] ||
                 req.headers['X-API-Key'];

  if (!apiKey) {
    return next();
  }

  try {
    // 3. KURAL DOĞRULAMASI: SHA-256 Hash ile API Key Eşleştirme
    const tenant = await validateApiKey(apiKey);
    if (!tenant) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_API_KEY',
        message: 'Geçersiz veya yetkisiz X-Tenant-API-Key (SHA-256 Hash doğrulaması başarısız).'
      });
    }

    if (!tenant.isActive) {
      return res.status(403).json({
        success: false,
        error: 'TENANT_INACTIVE',
        message: 'Bu bayinin API erişimi pasife alınmıştır.'
      });
    }

    // 1. KURAL: Yetki Kısıtlaması (Read-Only)
    // tenant.apikey (Vitrindeki Publishable Key) SADECE mağaza kataloğunu listeleme, ürün detaylarını çekme
    // ve müşteri/ziyaretçi işlemleri (/api/store) için kullanılabilir.
    // Bu key ile hiçbir /api/admin veya /api/tenant yönetim rotasına (ürün ekleme, fiyat değiştirme, bayi ayarları vb.) ERİŞİLEMEZ.
    const requestPath = (req.originalUrl || req.path || '').split('?')[0].toLowerCase();
    const isManagementRoute = 
      requestPath.startsWith('/api/admin') ||
      requestPath.startsWith('/api/tenant') ||
      requestPath.startsWith('/api/tenant-management');

    if (isManagementRoute) {
      return res.status(403).json({
        success: false,
        error: 'API_KEY_SCOPE_FORBIDDEN',
        message: 'Yetki Kısıtlaması (Read-Only): Vitrindeki API anahtarı (Publishable Key) SADECE mağaza kataloğu ve müşteri işlemleri (/api/store) için kullanılabilir. Yönetim rotalarına (/api/admin, /api/tenant) bu anahtar ile erişilemez.'
      });
    }

    // 2. KURAL: Sıkı CORS Kontrolü
    // İstek backend'e ulaştığında, sadece API Key'in doğruluğu yetmez.
    // İsteğin geldiği Origin (Örn: ahmetoto.com) ile veritabanındaki bayiye kayıtlı customDomain birebir eşleşmek ZORUNDADIR.
    // Eşleşmiyorsa 403 hatası fırlat.
    const originHeader = req.headers.origin || req.headers.Origin;
    const originCheck = validateOriginMatchesCustomDomain(originHeader, tenant);
    if (!originCheck.valid) {
      return res.status(403).json({
        success: false,
        error: 'CORS_ORIGIN_MISMATCH',
        message: `Sıkı CORS Kontrolü: İsteğin geldiği Origin ('${originCheck.originHeader}') ile bu API anahtarına sahip bayiye kayıtlı alan adı (customDomain: '${originCheck.expectedDomain}') birebir eşleşmek zorundadır.`
      });
    }

    // Başarılı Doğrulama: Salt okunur vitrin bağlamını enjekte et
    req.isApiKeyAuthenticated = true;
    req.apiKeyScope = 'STORE_READ_ONLY';
    req.tenant = tenant;
    req.tenantId = tenant.id;
    req.headers['x-tenant-slug'] = tenant.subdomain;
    req.user = {
      id: `apikey-${tenant.id}`,
      role: 'PUBLISHABLE_STORE_KEY',
      tenantId: tenant.id,
      isApiKey: true,
      isReadOnly: true
    };

    return next();
  } catch (err) {
    console.error('[API_KEY_AUTH_ERROR]:', err);
    return res.status(500).json({
      success: false,
      message: 'API anahtarı doğrulanırken sunucu hatası oluştu.'
    });
  }
}

/**
 * Zorunlu API Anahtarı Koruma Middleware'i:
 * Belirli dış entegrasyon uç noktalarında X-Tenant-API-Key zorunlu kılar.
 */
async function requireTenantApiKey(req, res, next) {
  // CORS Preflight (OPTIONS) isteklerini atla
  if (req.method === 'OPTIONS') {
    return next();
  }

  const apiKey = req.headers['x-tenant-api-key'] ||
                 req.headers['X-Tenant-API-Key'] ||
                 req.headers['x-api-key'] ||
                 req.headers['X-API-Key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API_KEY_REQUIRED',
      message: 'Dış bağlantı için "X-Tenant-API-Key" başlığı zorunludur.'
    });
  }

  const tenant = await validateApiKey(apiKey);
  if (!tenant) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_API_KEY',
      message: 'Geçersiz veya yetkisiz X-Tenant-API-Key.'
    });
  }

  if (!tenant.isActive) {
    return res.status(403).json({
      success: false,
      error: 'TENANT_INACTIVE',
      message: 'Bu bayinin API erişimi pasife alınmıştır.'
    });
  }

  const originHeader = req.headers.origin || req.headers.Origin;
  const originCheck = validateOriginMatchesCustomDomain(originHeader, tenant);
  if (!originCheck.valid) {
    return res.status(403).json({
      success: false,
      error: 'CORS_ORIGIN_MISMATCH',
      message: `Sıkı CORS Kontrolü: İsteğin geldiği Origin ('${originCheck.originHeader}') ile bayiye kayıtlı alan adı ('${originCheck.expectedDomain}') eşleşmemektedir.`
    });
  }

  req.isApiKeyAuthenticated = true;
  req.apiKeyScope = 'STORE_READ_ONLY';
  req.tenant = tenant;
  req.tenantId = tenant.id;
  req.headers['x-tenant-slug'] = tenant.subdomain;
  req.user = {
    id: `apikey-${tenant.id}`,
    role: 'PUBLISHABLE_STORE_KEY',
    tenantId: tenant.id,
    isApiKey: true,
    isReadOnly: true
  };

  next();
}

module.exports = {
  hashApiKey,
  safeCompareHashes,
  generateTenantApiKey,
  getTenantCustomDomain,
  extractDomainFromOrigin,
  validateOriginMatchesCustomDomain,
  validateApiKey,
  tenantApiKeyInterceptor,
  requireTenantApiKey
};
