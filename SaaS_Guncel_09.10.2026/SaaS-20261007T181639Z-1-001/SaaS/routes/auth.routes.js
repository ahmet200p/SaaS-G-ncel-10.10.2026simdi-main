const express = require('express');
const router = express.Router();
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const config = require('../config');
const { verifyToken, isSuperAdmin, checkSuperAdmin } = require('../middleware/auth');
const { loginLimiter, registerLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');

/**
 * @route   POST /api/auth/register
 * @desc    Yeni müşteri/kullanıcı kaydı (Herkese açık vitrin kaydı)
 * @access  Public
 */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const {
      email,
      password,
      // GÜVENLİK (Mass Assignment Önleme): role parametresi KESİNLİKLE kabul edilmez, dışarıdan gelse bile yok sayılır.
      tenantId,
      subdomain,
      fullName,
      name,
      phone,
      customerType,
      companyName,
      taxNumber,
      address
    } = req.body;

    // 1. Girdi Kontrolleri
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'E-posta ve şifre alanları zorunludur.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Şifre en az 6 karakter uzunluğunda olmalıdır.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 2. E-posta tekillik kontrolü
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Bu e-posta adresi ile kayıtlı bir kullanıcı zaten mevcut.'
      });
    }

    // 3. Hedef Bayi (Tenant) Belirleme
    let targetTenantId = tenantId || null;
    if (!targetTenantId) {
      const subToFind = subdomain || 'ahmetoto';
      const tenantMatch = await prisma.tenant.findUnique({
        where: { subdomain: subToFind }
      });
      if (tenantMatch) {
        targetTenantId = tenantMatch.id;
      } else {
        const defaultTenant = await prisma.tenant.findFirst({
          where: { isActive: true }
        });
        targetTenantId = defaultTenant ? defaultTenant.id : null;
      }
    }

    // 4. Şifrenin bcrypt ile hashlenmesi
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 5. Rol ve Müşteri Tipi Belirleme (Mass Assignment Koruması)
    // 1. ADIM: Herkese açık kayıt uç noktasında rol parametresi dışarıdan ASLA alınmaz; doğrudan CUSTOMER olarak sabitlenir (hardcode).
    const assignedRole = 'CUSTOMER';

    // 2. ADIM: Tamirci (B2B MECHANIC) vs Bireysel (B2C RETAIL) Ayrımı
    // Bu ayrım yalnızca CustomerProfile tablosundaki detayları ve onay sürecini etkiler; kullanıcının erişim yetkisi (Role: CUSTOMER) değişmez.
    const validTypes = ['MECHANIC', 'RETAIL'];
    const assignedCustomerType = customerType && validTypes.includes(String(customerType).toUpperCase())
      ? String(customerType).toUpperCase()
      : 'MECHANIC';

    const displayName = (fullName || name || cleanEmail.split('@')[0]).trim();
    const finalCompanyName = (companyName || '').trim() ||
      (assignedCustomerType === 'MECHANIC' ? `${displayName} Oto Servis` : displayName);

    // 6. Prisma Transaction ile User ve CustomerProfile kaydı
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: cleanEmail,
          password: hashedPassword,
          role: 'CUSTOMER', // GÜVENLİK: Dışarıdan yetki yükseltme engellenmiştir.
          name: displayName,
          tenantId: targetTenantId
        }
      });

      let profile = null;
      if (assignedRole === 'CUSTOMER' && targetTenantId) {
        profile = await tx.customerProfile.create({
          data: {
            userId: newUser.id,
            tenantId: targetTenantId,
            companyName: finalCompanyName,
            phone: (phone || '').trim(),
            customerType: assignedCustomerType,
            taxNumber: (taxNumber || '').trim() || null,
            address: (address || '').trim() || null,
            status: assignedCustomerType === 'MECHANIC' ? 'PENDING_APPROVAL' : 'APPROVED',
            discountRate: 0.0,
            balance: 0.0,
            currentBalance: 0.0
          }
        });
      }

      return { user: newUser, profile };
    });

    const isMechanic = assignedCustomerType === 'MECHANIC';

    // JWT token üretimi
    const effectiveTenantId = result.user.tenantId;
    const token = jwt.sign(
      { id: result.user.id, email: result.user.email, role: result.user.role, tenantId: effectiveTenantId },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    const userPayload = {
      id: user.id,
      email: user.email,
      name: user.name || (user.customerProfile ? user.customerProfile.companyName : null),
      role: user.role,
      tenantId: effectiveTenantId,
      tenant: user.tenant || null,
      customerProfile: user.customerProfile || null
    };

    // prompt.md ADIM 2: Kullanıcının rolüne göre yönlendirme URL'i (redirectUrl) ve standart rolü belirle
    let redirectUrl = '/store.html';
    let outputRole = user.role;
    const uRoleUpper = String(user.role || '').toUpperCase();
    if (uRoleUpper === 'SUPER_ADMIN' || uRoleUpper === 'ADMIN') {
      outputRole = 'SUPER_ADMIN';
      redirectUrl = '/admin.html';
    } else if (uRoleUpper === 'BAYI' || uRoleUpper === 'TENANT_ADMIN') {
      outputRole = 'BAYI';
      redirectUrl = '/bayi.html';
    } else if (uRoleUpper === 'MUSTERI' || uRoleUpper === 'CUSTOMER') {
      outputRole = 'MUSTERI';
      redirectUrl = '/store.html';
    }

    userPayload.role = outputRole;
    userPayload.rawRole = user.role;

    // prompt.md Kuralı: res.status(200).json({ token: token, role: user.role, redirectUrl: ... })
    return res.status(200).json({
      success: true,
      message: 'Giriş başarılı.',
      token,
      role: outputRole,
      rawRole: user.role,
      redirectUrl,
      user: userPayload,
      data: {
        token,
        role: outputRole,
        rawRole: user.role,
        redirectUrl,
        user: userPayload
      }
    });

  } catch (error) {
    console.error('[AUTH_LOGIN_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Giriş işlemi sırasında sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 3. ADIM: Kimlik Doğrulama (Auth) Rotalarının İzolasyonu
 * @route   POST /api/auth/tenant-login
 * @desc    Bayi yöneticileri için izole kimlik doğrulama rotası
 *          role: 'CUSTOMER' olan kullanıcılar 403 Forbidden ile kesinlikle engellenir.
 * @access  Public
 */
router.post('/tenant-login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen e-posta ve şifrenizi eksiksiz giriniz.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    let user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { tenant: true }
    });

    if (!user) {
      const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
      const currentAdminEmail = (settings && settings.adminEmail) ? settings.adminEmail.toLowerCase().trim() : null;
      if (currentAdminEmail && cleanEmail === currentAdminEmail) {
        user = await prisma.user.findFirst({
          where: { role: 'SUPER_ADMIN' },
          include: { tenant: true }
        });
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Hatalı e-posta adresi veya şifre!'
      });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Hatalı e-posta adresi veya şifre!'
      });
    }

    // Role İzolasyonu: CUSTOMER rolü bayi paneli girişinden kesinlikle men edilir
    if (user.role === 'CUSTOMER') {
      return res.status(403).json({
        success: false,
        message: 'Bu alana sadece bayi yöneticileri giriş yapabilir. Müşteriler müşteri vitrinini kullanmalıdır.'
      });
    }

    if (user.role !== 'TENANT_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Bu alana erişim yetkiniz bulunmamaktadır.'
      });
    }

    // Bayi aktiflik kontrolü
    if (user.role === 'TENANT_ADMIN' && user.tenantId) {
      const tenant = user.tenant || await prisma.tenant.findUnique({
        where: { id: user.tenantId }
      });

      if (!tenant || !tenant.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Bu bayi Kurumumuz tarafından pasife alınmıştır lütfen müşteri temsilcisi ile iletişime geçiniz.'
        });
      }
      user.tenant = tenant;
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId || null
    };

    const token = jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });

    const userPayload = {
      id: user.id,
      email: user.email,
      name: user.name || (user.role === 'SUPER_ADMIN' ? 'Süper Admin' : 'Bayi Yöneticisi'),
      role: user.role,
      tenantId: user.tenantId || null,
      tenant: user.tenant || null
    };

    return res.status(200).json({
      success: true,
      message: 'Bayi yöneticisi girişi başarılı.',
      token,
      role: user.role,
      user: userPayload,
      data: {
        token,
        role: user.role,
        user: userPayload
      }
    });

  } catch (error) {
    console.error('[AUTH_TENANT_LOGIN_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Bayi girişi sırasında sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 3. ADIM: Kimlik Doğrulama (Auth) Rotalarının İzolasyonu
 * @route   POST /api/auth/customer-login
 * @desc    Ustalar / Tamirciler / Otoservis müşterileri için izole kimlik doğrulama rotası
 *          Payload içine kesinlikle role: 'CUSTOMER' ve müşterinin kayıtlı olduğu bayinin ID'sini (tenantId) ekler.
 *          Yönetici rolleri (SUPER_ADMIN, TENANT_ADMIN) 403 Forbidden ile bu rotadan men edilir.
 * @access  Public
 */
router.post('/customer-login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen e-posta ve şifrenizi eksiksiz giriniz.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: {
        tenant: true,
        customerProfile: {
          include: { tenant: true }
        }
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Hatalı e-posta adresi veya şifre!'
      });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Hatalı e-posta adresi veya şifre!'
      });
    }

    // Role İzolasyonu: SADECE CUSTOMER rolü kabul edilir
    if (user.role !== 'CUSTOMER') {
      return res.status(403).json({
        success: false,
        message: 'Bu giriş alanı sadece müşterilere / tamircilere aittir. Bayi yöneticileri bayi girişini kullanmalıdır.'
      });
    }

    // CustomerProfile ve tenantId kontrolü
    if (!user.customerProfile) {
      user.customerProfile = await prisma.customerProfile.findUnique({
        where: { userId: user.id },
        include: { tenant: true }
      });
    }

    if (!user.customerProfile) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı. Lütfen bayiniz ile iletişime geçiniz.'
      });
    }

    const effectiveTenantId = user.tenantId || (user.customerProfile ? user.customerProfile.tenantId : null);

    if (!user.tenantId && effectiveTenantId) {
      user.tenantId = effectiveTenantId;
      await prisma.user.update({
        where: { id: user.id },
        data: { tenantId: effectiveTenantId }
      }).catch(err => console.warn('[CUSTOMER_AUTH_SYNC_TENANT_WARN]:', err));
    }

    // Bayi aktiflik kontrolü
    if (effectiveTenantId) {
      const tenant = user.tenant || (user.customerProfile ? user.customerProfile.tenant : null) || await prisma.tenant.findUnique({
        where: { id: effectiveTenantId }
      });

      if (!tenant || !tenant.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Bu bayi Kurumumuz tarafından pasife alınmıştır lütfen müşteri temsilcisi ile iletişime geçiniz.'
        });
      }
      user.tenant = tenant;
    }

    // 3. ADIM KURALI: Müşteri (Customer) token'ı oluşturulurken payload içine
    // KESİNLİKLE role: 'CUSTOMER' ve müşterinin kayıtlı olduğu bayinin ID'sini (tenantId) ekle.
    const payload = {
      id: user.id,
      email: user.email,
      role: 'CUSTOMER',
      tenantId: effectiveTenantId
    };

    const token = jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });

    const userPayload = {
      id: user.id,
      email: user.email,
      name: (user.customerProfile && user.customerProfile.companyName) || user.name || 'Müşteri',
      role: 'CUSTOMER',
      tenantId: effectiveTenantId,
      tenant: user.tenant || null,
      customerProfile: user.customerProfile
    };

    return res.status(200).json({
      success: true,
      message: 'Müşteri girişi başarılı.',
      token,
      role: 'CUSTOMER',
      user: userPayload,
      data: {
        token,
        role: 'CUSTOMER',
        user: userPayload
      }
    });

  } catch (error) {
    console.error('[AUTH_CUSTOMER_LOGIN_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Müşteri girişi sırasında sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Mevcut oturum açmış kullanıcının JWT bilgilerini döner
 * @access  Protected (verifyToken)
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        tenant: true,
        customerProfile: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı.'
      });
    }

    return res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    console.error('[AUTH_ME_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Kullanıcı bilgisi alınamadı.'
    });
  }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Kullanıcıya parola sıfırlama anahtarı üretir (EKSİK-05)
 * @access  Public
 */
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen kayıtlı e-posta adresinizi giriniz.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (!user) {
      // Güvenlik gereği kullanıcının sistemde olup olmadığı dışarı sızdırılmaz
      return res.status(200).json({
        success: true,
        message: 'Eğer e-posta adresi sistemimizde kayıtlıysa, şifre sıfırlama bağlantısı iletilmiştir.'
      });
    }

    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 saat geçerli

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Şifre sıfırlama talimatları e-posta adresinize gönderildi.',
      resetToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined
    });

  } catch (error) {
    console.error('[FORGOT_PASSWORD_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Şifre sıfırlama isteği oluşturulurken sunucu hatası meydana geldi.'
    });
  }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Sıfırlama anahtarını doğrulayarak yeni şifreyi kaydeder (EKSİK-05)
 * @access  Public
 */
router.post('/reset-password', passwordResetLimiter, async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Sıfırlama anahtarı (resetToken) ve yeni şifre zorunludur.'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Yeni şifre en az 6 karakter uzunluğunda olmalıdır.'
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: resetToken,
        resetTokenExpiry: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz veya süresi dolmuş sıfırlama bağlantısı. Lütfen tekrar şifre sıfırlama talebinde bulunun.'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Şifreniz başarıyla güncellendi. Yeni şifrenizle hemen giriş yapabilirsiniz.'
    });

  } catch (error) {
    console.error('[RESET_PASSWORD_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Şifre güncellenirken sunucu hatası meydana geldi.'
    });
  }
});

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Geçerli token sahibi kullanıcının oturumunu yeniler (EKSİK-05)
 * @access  Protected (verifyToken)
 */
router.post('/refresh-token', verifyToken, async (req, res) => {
  try {
    const JWT_SECRET = config.JWT_SECRET;
    const payload = {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      tenantId: req.user.tenantId
    };

    const newToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    return res.status(200).json({
      success: true,
      message: 'Oturum süresi başarıyla 24 saat uzatıldı.',
      token: newToken
    });
  } catch (error) {
    console.error('[REFRESH_TOKEN_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Token yenilenirken hata oluştu.'
    });
  }
});

module.exports = router;

