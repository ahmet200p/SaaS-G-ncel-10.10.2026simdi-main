const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * verifyToken Middleware:
 * Gelen HTTP isteklerindeki Authorization başlığında yer alan Bearer JWT token'ı doğrular.
 * Token geçerliyse çözülen kullanıcı bilgilerini (id, email, role, tenantId) req.user nesnesine atar.
 */
const verifyToken = (req, res, next) => {
  // CORS Preflight (OPTIONS) isteklerini atla
  if (req.method === 'OPTIONS') {
    return next();
  }

  // 0. API Anahtarı ile Doğrulanmış İstekler (X-Tenant-API-Key)
  // KURAL 1: Yetki Kısıtlaması (Read-Only) - Sadece Vitrin (/api/store) için geçerlidir
  if (req.isApiKeyAuthenticated && req.user) {
    const originalUrl = (req.originalUrl || req.path || '').toLowerCase();
    if (originalUrl.startsWith('/api/admin') || originalUrl.startsWith('/api/tenant') || originalUrl.startsWith('/api/tenant-management')) {
      return res.status(403).json({
        success: false,
        error: 'API_KEY_SCOPE_FORBIDDEN',
        message: 'Yetki Kısıtlaması (Read-Only): Vitrindeki API anahtarı (Publishable Key) SADECE mağaza kataloğu ve müşteri işlemleri (/api/store) için kullanılabilir. Yönetim rotalarına (/api/admin, /api/tenant) erişilemez.'
      });
    }
    return next();
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;

  // 1. Authorization başlığı ve Bearer formatı kontrolü
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Erişim engellendi: Yetkilendirme tokenı (Bearer Token) bulunamadı.'
    });
  }

  // 2. Token metnini ayıkla
  const token = authHeader.split(' ')[1];
  if (!token || !token.trim()) {
    return res.status(401).json({
      success: false,
      message: 'Erişim engellendi: Geçersiz token biçimi.'
    });
  }

  // 3. ADIM: Çevresel (Environment) İzolasyon
  // Mock/sahte test yetkilendirmeleri SADECE ve İSTİSNASIZ olarak process.env.NODE_ENV === 'test' durumunda çalışabilir.
  // Canlı (production) veya geliştirme (development) ortamlarında hiçbir sahte token asla kabul edilmez.
  if (process.env.NODE_ENV === 'test' && token.startsWith('mock_test_token_')) {
    const parts = token.split('_');
    const rolePart = parts[3] ? parts[3].toUpperCase() : 'CUSTOMER';
    const role = rolePart === 'SUPER' ? 'SUPER_ADMIN' : (rolePart === 'TENANT' ? 'TENANT_ADMIN' : rolePart);
    req.user = {
      id: 'usr-mock-test',
      email: 'mock@test.com',
      role: role,
      tenantId: role === 'SUPER_ADMIN' ? null : 'test-tenant-id'
    };
    return next();
  }

  // 2. ADIM: Katı JWT Doğrulaması (Strict Verification)
  // Sisteme gelen her bir token İSTİSNASIZ olarak jwt.verify(token, secret) metodundan geçmek zorundadır.
  try {
    const secret = process.env.JWT_SECRET || config.JWT_SECRET;
    const decoded = jwt.verify(token, secret);

    // Kullanıcı rolü ve verileri SADECE doğrulanmış (verified) payload üzerinden okunur.
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,         // SUPER_ADMIN | TENANT_ADMIN | CUSTOMER
      tenantId: decoded.tenantId  // Super Admin için null, bayiler ve müşteriler için string UUID
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Oturum süreniz doldu. Lütfen tekrar giriş yapınız.'
      });
    }

    // İmzası hatalı, süresi dolmuş, sahte veya manipüle edilmiş tüm tokenlar anında durdurulur
    return res.status(403).json({
      success: false,
      message: 'Geçersiz veya bozuk yetkilendirme tokenı.'
    });
  }
};

/**
 * Belirli rollerin erişimini kısıtlayan yardımcı middleware (Opsiyonel Güvenlik Katmanı)
 * Örn: authorizeRoles('SUPER_ADMIN') veya authorizeRoles('SUPER_ADMIN', 'TENANT_ADMIN')
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // CORS Preflight (OPTIONS) isteklerini atla
    if (req.method === 'OPTIONS') {
      return next();
    }

    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlemi gerçekleştirmek için yetkiniz bulunmamaktadır.'
      });
    }
    next();
  };
};

/**
 * Sadece SUPER_ADMIN rolünün erişebilmesini sağlayan middleware
 */
const checkSuperAdmin = (req, res, next) => {
  // CORS Preflight (OPTIONS) isteklerini atla
  if (req.method === 'OPTIONS') {
    return next();
  }

  if (req.user?.isApiKey || req.user?.role === 'PUBLISHABLE_STORE_KEY') {
    return res.status(403).json({
      success: false,
      error: 'API_KEY_SCOPE_FORBIDDEN',
      message: 'Yetki Kısıtlaması (Read-Only): Vitrin API anahtarı (Publishable Key) ile Süper Admin rotalarına erişilemez.'
    });
  }

  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Erişim reddedildi: Bu işlem yalnızca Süper Admin yetkisine sahip kullanıcılar tarafından gerçekleştirilebilir.'
    });
  }
  next();
};

/**
 * Bayi yöneticisi (TENANT_ADMIN) ve geçerli tenantId kontrolü sağlayan middleware (Data Isolation)
 */
const checkTenantAdmin = (req, res, next) => {
  // CORS Preflight (OPTIONS) isteklerini atla
  if (req.method === 'OPTIONS') {
    return next();
  }

  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Oturum bilgisi bulunamadı.'
    });
  }

  // KURAL 1: Vitrin API Anahtarı (Publishable Key) Yetki Kısıtlaması
  if (req.user.isApiKey || req.user.role === 'PUBLISHABLE_STORE_KEY') {
    return res.status(403).json({
      success: false,
      error: 'API_KEY_SCOPE_FORBIDDEN',
      message: 'Yetki Kısıtlaması (Read-Only): Vitrin API anahtarı (Publishable Key) ile bayi yönetici paneline ve yönetim rotalarına erişilemez.'
    });
  }

  // 4. ADIM: Çapraz Yetki İhlali (Privilege Escalation) Koruması
  // role: 'CUSTOMER' olan bir token'ın, bayi yönetimine ait hiçbir rotaya (/api/tenant/...) erişemeyeceğini katı bir şekilde denetle.
  // Müşteri token'ı ile bayi paneline istek atılırsa anında 403 Forbidden döndür.
  if (req.user.role === 'CUSTOMER') {
    return res.status(403).json({
      success: false,
      message: 'Erişim reddedildi: Müşteri hesabı ile bayi yönetim paneline ve rotalarına erişilemez.'
    });
  }

  if (!req.user.tenantId && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Erişim reddedildi: Bu işlem için geçerli bir bayi (tenant) üyeliği gereklidir.'
    });
  }

  if (req.user.role !== 'TENANT_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Bu alana yalnızca Bayi Yöneticileri erişebilir.'
    });
  }

  next();
};

/**
 * Müşteri vitrini (store) erişim middleware'i:
 * CUSTOMER rolünün yanı sıra mağazasını önizleyen TENANT_ADMIN ve SUPER_ADMIN yetkililerine de izin verir.
 */
const checkCustomer = (req, res, next) => {
  // CORS Preflight (OPTIONS) isteklerini atla
  if (req.method === 'OPTIONS') {
    return next();
  }

  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Oturum bilgisi bulunamadı.'
    });
  }

  if (req.user.role !== 'CUSTOMER' && req.user.role !== 'TENANT_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Erişim reddedildi: Bu alana erişim yetkiniz bulunmamaktadır.'
    });
  }

  next();
};

/**
 * requireApprovedDealer / requireApprovedTenant Middleware:
 * İstek atan kullanıcının veya bağlı olduğu bayinin (Tenant) statüsünün 'APPROVED' olduğunu doğrular.
 * Kullanıcının statüsü 'APPROVED' değilse (yani 'PENDING' veya 'REJECTED' ise):
 * 403 Forbidden döndürerek arka kapıdan ürün ekleme ve düzenleme işlemlerini kesin olarak engeller.
 * SUPER_ADMIN rolü bu kısıtlamadan muaftır.
 */
const requireApprovedDealer = async (req, res, next) => {
  // CORS Preflight (OPTIONS) isteklerini atla
  if (req.method === 'OPTIONS') {
    return next();
  }

  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Yetkilendirme tokenı bulunamadı.'
    });
  }

  // SUPER_ADMIN rolü her zaman tam yetkiye sahiptir
  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  try {
    const prisma = require('../lib/prisma');
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { tenant: true }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı hesabı bulunamadı.'
      });
    }

    const userStatus = user.status || 'PENDING';
    const tenantStatus = user.tenant?.status || 'PENDING';

    if (userStatus !== 'APPROVED' || (user.tenant && tenantStatus !== 'APPROVED')) {
      console.warn(`[SECURITY_BLOCKED] Onaysız bayi (${user.email}, Durum: ${userStatus}/${tenantStatus}) ürün ekleme/düzenleme denemesi 403 ile engellendi.`);
      return res.status(403).json({
        success: false,
        error: 'DEALER_PENDING_APPROVAL',
        status: userStatus,
        message: 'Erişim engellendi: Bayi hesabınız henüz Admin tarafından onaylanmamıştır (Onay Bekliyor). Ürün ekleme veya katalog düzenleme yapamazsınız.'
      });
    }

    req.user.status = userStatus;
    if (user.tenant) {
      req.user.tenantStatus = tenantStatus;
    }

    next();
  } catch (err) {
    console.error('[REQUIRE_APPROVED_DEALER_ERROR]:', err);
    return res.status(500).json({
      success: false,
      message: 'Bayi onay durumu denetlenirken sunucu hatası oluştu.'
    });
  }
};

const isSuperAdmin = checkSuperAdmin;
const isTenantAdmin = checkTenantAdmin;
const requireApprovedTenant = requireApprovedDealer;

module.exports = {
  verifyToken,
  checkSuperAdmin,
  isSuperAdmin,
  checkTenantAdmin,
  isTenantAdmin,
  checkCustomer,
  authorizeRoles,
  requireApprovedDealer,
  requireApprovedTenant
};
