// ============================================================================
// Multi-Tenant B2B SaaS - Güvenli Bayi Çözümleme ve İzolasyon Ara Yazılımı
// Dosya: backend-api/middleware/resolveTenant.js
// ============================================================================
// Güvenlik & Hacker Korumaları:
// 1. Regex Slug Validasyonu (SQLi, Path Traversal, XSS Enjeksiyon Koruması)
// 2. Çok Kanallı Subdomain Çözümleme (Header, Query Parametresi, Hostname)
// 3. Sıfır Veri Sızıntısı (Zero Data Leakage): Bilinmeyen slug asla başka bayiye
//    (ahmetoto vb.) geri düşmez, katı HTTP 404 döner.
// 4. Onay ve Aktiflik Denetimi: PENDING veya REJECTED bayilerin vitrini açılmaz.
// ============================================================================

const prisma = require('../lib/prisma');

// RFC 1123 / Subdomain Güvenlik Deseni:
// Sadece küçük harf, rakam ve tire; 1-63 karakter; tire ile başlayamaz veya bitemez.
const VALID_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

// Rezerve Edilmiş veya Bayi Sayılmayan Sistem Alan Adları / Hostname Önekleri
const RESERVED_HOST_PREFIXES = new Set([
  'www',
  'api',
  'admin',
  'superadmin',
  'panel',
  'mail',
  'cdn',
  'assets',
  'static',
  'localhost',
  '127',
  '0'
]);

/**
 * Host başlığından (req.headers.host) güvenli subdomain çıkarma
 * Örnekler:
 * - 'ahmetoto.sistem.com' -> 'ahmetoto'
 * - 'ahmetoto.sistem.com:5000' -> 'ahmetoto'
 * - 'demir-oto.localhost:3000' -> 'demir-oto'
 * - 'localhost:5000' -> null
 * - '127.0.0.1:5000' -> null
 */
function extractSubdomainFromHost(host) {
  if (!host || typeof host !== 'string') return null;

  // Port bilgisini ayır (Örn: "ahmetoto.localhost:5000" -> "ahmetoto.localhost")
  const hostname = host.split(':')[0].trim().toLowerCase();

  // IP adresi kontrolü (IPv4: 127.0.0.1 vb.)
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return null;
  }

  const parts = hostname.split('.');

  // Geliştirme ortamı: "demir-oto.localhost" -> 2 parça
  if (parts.length === 2 && parts[1] === 'localhost') {
    const candidate = parts[0];
    if (!RESERVED_HOST_PREFIXES.has(candidate)) {
      return candidate;
    }
    return null;
  }

  // Standart canlı ortam: "demir-oto.sistem.com" -> >= 3 parça
  if (parts.length >= 3) {
    const candidate = parts[0];
    if (!RESERVED_HOST_PREFIXES.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * İstekten hedef bayi slug/subdomain bilgisini öncelik sırasına göre çözümler
 */
function getTargetSlugFromRequest(req) {
  // 1. Doğrudan Özel HTTP Başlığı (Header - En yüksek öncelik)
  const headerSlug = req.headers['x-tenant-slug'];
  if (headerSlug && typeof headerSlug === 'string' && headerSlug.trim()) {
    return { slug: headerSlug.trim().toLowerCase(), source: 'header' };
  }

  // 2. URL Query Parametresi (?subdomain=... veya ?tenant=... veya ?slug=...)
  const querySlug = req.query?.subdomain || req.query?.tenant || req.query?.slug;
  if (querySlug && typeof querySlug === 'string' && querySlug.trim()) {
    return { slug: querySlug.trim().toLowerCase(), source: 'query' };
  }

  // 3. HTTP Host Başlığı (Hostname subdomain çözümlemesi)
  const hostSlug = extractSubdomainFromHost(req.headers.host);
  if (hostSlug) {
    return { slug: hostSlug, source: 'host' };
  }

  return { slug: null, source: 'none' };
}

/**
 * resolveTenant Middleware:
 * Gelen HTTP isteğindeki hedef bayiyi tespit eder, Prisma veritabanından doğrular
 * ve `req.tenant` nesnesine güvenle bağlar.
 */
async function resolveTenant(req, res, next) {
  // CORS Preflight (OPTIONS) isteklerini atla
  if (req.method === 'OPTIONS') {
    return next();
  }

  try {
    // Daha önce çözümlendiyse tekrar sorgulama yapma
    if (req.tenant && req.tenant.id) {
      return next();
    }

    const { slug, source } = getTargetSlugFromRequest(req);

    // Slug belirtilmişse güvenlik desen kontrolü (Hacker / Injection koruması)
    if (slug) {
      if (!VALID_SLUG_REGEX.test(slug)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_TENANT_SLUG',
          message: 'Geçersiz bayi subdomain formatı. Sadece harf, rakam ve tire kullanılabilir.',
          received: slug
        });
      }

      // Veritabanından bayiyi ara
      const tenant = await prisma.tenant.findUnique({
        where: { subdomain: slug }
      });

      // ======================================================================
      // KRİTİK GÜVENLİK KURALI: SIFIR VERİ SIZINTISI (ZERO DATA LEAKAGE)
      // Kullanıcı veya saldırgan var olmayan bir bayi adı girdiğinde ASLA
      // başka bir firmanın (ahmetoto vb.) verilerine geri düşülmez (fallback yapılmaz).
      // Doğrudan HTTP 404 döner.
      // ======================================================================
      if (!tenant) {
        return res.status(404).json({
          success: false,
          code: 'TENANT_NOT_FOUND',
          message: `"${slug}" alan adına ait aktif bir bayi mağazası bulunamadı.`,
          requestedSubdomain: slug
        });
      }

      // 1. Onay Durumu Kontrolü (Super Admin Approval Koruması)
      if (tenant.status === 'PENDING') {
        return res.status(403).json({
          success: false,
          code: 'TENANT_PENDING_APPROVAL',
          message: `"${tenant.name}" bayilik başvurusu henüz Süper Admin tarafından onaylanmamıştır. Onaylanana kadar vitrin erişime kapalıdır.`,
          subdomain: tenant.subdomain
        });
      }

      if (tenant.status === 'REJECTED') {
        return res.status(403).json({
          success: false,
          code: 'TENANT_REJECTED',
          message: `"${tenant.name}" bayilik başvurusu onaylanmamıştır veya iptal edilmiştir.`,
          subdomain: tenant.subdomain
        });
      }

      // 2. Aktiflik Durumu Kontrolü
      if (!tenant.isActive) {
        return res.status(403).json({
          success: false,
          code: 'TENANT_INACTIVE',
          message: `"${tenant.name}" bayisi geçici olarak pasife alınmıştır. Lütfen bayi yönetimi ile iletişime geçiniz.`,
          subdomain: tenant.subdomain
        });
      }

      // Başarılı çözümleme: Request ve Response başlıklarına enjekte et
      req.tenant = tenant;
      req.tenantId = tenant.id;
      res.setHeader('X-Tenant-Slug', tenant.subdomain);
      res.setHeader('X-Tenant-Id', tenant.id);
      return next();
    }

    // Slug hiçbir yerden (header, query, host) gelmemişse:
    // Yalnızca yerel test/kök geliştirme çağrıları için varsayılan aktif onaylı bayiyi seç
    let defaultTenant = await prisma.tenant.findUnique({
      where: { subdomain: 'ahmetoto' }
    });

    if (!defaultTenant || !defaultTenant.isActive || defaultTenant.status !== 'APPROVED') {
      defaultTenant = await prisma.tenant.findFirst({
        where: { isActive: true, status: 'APPROVED' },
        orderBy: { createdAt: 'asc' }
      });
    }

    if (!defaultTenant) {
      return res.status(404).json({
        success: false,
        code: 'NO_ACTIVE_TENANT',
        message: 'Sistemde kayıtlı onaylı ve aktif bir bayi bulunamadı.'
      });
    }

    req.tenant = defaultTenant;
    req.tenantId = defaultTenant.id;
    res.setHeader('X-Tenant-Slug', defaultTenant.subdomain);
    res.setHeader('X-Tenant-Id', defaultTenant.id);
    return next();

  } catch (error) {
    console.error('[RESOLVE_TENANT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      code: 'TENANT_RESOLUTION_ERROR',
      message: 'Bayi kimliği doğrulanırken sunucu hatası meydana geldi.'
    });
  }
}

module.exports = {
  resolveTenant,
  getTargetSlugFromRequest,
  extractSubdomainFromHost,
  VALID_SLUG_REGEX
};
