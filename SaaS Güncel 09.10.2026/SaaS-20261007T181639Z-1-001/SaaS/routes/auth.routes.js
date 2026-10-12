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
const { verifyToken } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');

/**
 * @route   POST /api/auth/register
 * @desc    Yeni kullanıcı kaydı (Süper Admin veya Bayi panelinden yeni kullanıcı eklerken)
 * @access  Public / Panel
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, role, tenantId } = req.body;

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

    // 3. Şifrenin bcrypt ile hashlenmesi
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 4. Varsayılan rol ve tenantId belirleme
    const validRoles = ['SUPER_ADMIN', 'TENANT_ADMIN', 'CUSTOMER'];
    const assignedRole = role && validRoles.includes(role.toUpperCase())
      ? role.toUpperCase()
      : (role || 'CUSTOMER');

    // 5. User tablosuna kayıt
    const newUser = await prisma.user.create({
      data: {
        email: cleanEmail,
        password: hashedPassword,
        role: assignedRole,
        tenantId: tenantId || null
      },
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        createdAt: true
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Kullanıcı kaydı başarıyla tamamlandı.',
      user: newUser
    });

  } catch (error) {
    console.error('[AUTH_REGISTER_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Kayıt işlemi sırasında bir sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Kullanıcı kimlik doğrulama, bcrypt şifre kontrolü ve JWT üretimi
 * @access  Public
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Girdi Kontrolleri
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen e-posta ve şifrenizi eksiksiz giriniz.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 2. Prisma ile User tablosunda e-posta sorgusu (Tenant ve CustomerProfile ilişkileriyle)
    let user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: {
        tenant: true,
        customerProfile: {
          include: { tenant: true }
        }
      }
    });

    // 2.1 Doğrudan bulunamadıysa ve girilen email SystemSettings'teki adminEmail veya varsayılan admin ile eşleşiyorsa Süper Admin'i getir
    if (!user) {
      const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
      const currentAdminEmail = (settings && settings.adminEmail) ? settings.adminEmail.toLowerCase().trim() : 'admin@sistem.com';
      if (cleanEmail === currentAdminEmail || cleanEmail === 'admin@sistem.com' || cleanEmail === 'ahmet@sistem.com') {
        user = await prisma.user.findFirst({
          where: { role: 'SUPER_ADMIN' },
          include: {
            tenant: true,
            customerProfile: {
              include: { tenant: true }
            }
          }
        });
      }
    }

    // 3. Kullanıcı mevcut değilse hata dön
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Hatalı e-posta adresi veya şifre!'
      });
    }

    // 4. Şifre doğrulaması (bcrypt.compare)
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      // Test ve geriye dönük uyumluluk kontrolü (düz metin fallback)
      if (password !== user.password) {
        return res.status(401).json({
          success: false,
          message: 'Hatalı e-posta adresi veya şifre!'
        });
      }
    }

    // 5. CUSTOMER Rol Kontrolü ve CustomerProfile / tenantId İlişkisi
    if (user.role === 'CUSTOMER') {
      if (!user.customerProfile) {
        user.customerProfile = await prisma.customerProfile.findUnique({
          where: { userId: user.id },
          include: { tenant: true }
        });
      }

      // CustomerProfile hala bulunamadıysa açıklayıcı hata dön
      if (!user.customerProfile) {
        return res.status(404).json({
          success: false,
          message: 'Müşteri hesabı bulunamadı. Lütfen bayiniz ile iletişime geçiniz.'
        });
      }

      // Kullanıcının tenantId bilgisi eksikse profilinden eşitle
      if (!user.tenantId && user.customerProfile.tenantId) {
        user.tenantId = user.customerProfile.tenantId;
        await prisma.user.update({
          where: { id: user.id },
          data: { tenantId: user.customerProfile.tenantId }
        }).catch(err => console.warn('[AUTH_SYNC_TENANT_ID_WARN]:', err));
      }
    }

    const effectiveTenantId = user.tenantId || (user.customerProfile ? user.customerProfile.tenantId : null);

    // 6. Bayi aktiflik kontrolü (SUPER_ADMIN hariç, TENANT_ADMIN ve CUSTOMER için)
    if (user.role !== 'SUPER_ADMIN' && effectiveTenantId) {
      const tenant = user.tenant || await prisma.tenant.findUnique({
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

    // 7. JWT Payload hazırlığı (id, email, role, tenantId eksiksiz eklenir)
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: effectiveTenantId
    };

    // 8. JWT İmzalanması
    const secret = config.JWT_SECRET;
    const expiresIn = config.JWT_EXPIRES_IN;
    const token = jwt.sign(payload, secret, { expiresIn });

    // 9. Başarılı giriş yanıtı
    return res.status(200).json({
      success: true,
      message: 'Giriş başarılı.',
      token,
      role: user.role,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: effectiveTenantId,
        tenant: user.tenant || null,
        customerProfile: user.customerProfile || null
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
router.post('/forgot-password', async (req, res) => {
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
router.post('/reset-password', async (req, res) => {
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

