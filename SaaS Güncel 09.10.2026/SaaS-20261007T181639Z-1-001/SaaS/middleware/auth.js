const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * verifyToken Middleware:
 * Gelen HTTP isteklerindeki Authorization başlığında yer alan Bearer JWT token'ı doğrular.
 * Token geçerliyse çözülen kullanıcı bilgilerini (id, email, role, tenantId) req.user nesnesine atar.
 */
const verifyToken = (req, res, next) => {
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
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Oturum bilgisi bulunamadı.'
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

const isSuperAdmin = checkSuperAdmin;
const isTenantAdmin = checkTenantAdmin;

module.exports = {
  verifyToken,
  checkSuperAdmin,
  isSuperAdmin,
  checkTenantAdmin,
  isTenantAdmin,
  checkCustomer,
  authorizeRoles
};
