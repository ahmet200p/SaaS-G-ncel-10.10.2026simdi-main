// ============================================================================
// Multi-Tenant B2B SaaS - Kimlik Doğrulama & NVİ Kontrolcüsü (authController.js)
// Konum: backend-api/controllers/authController.js
// ============================================================================

let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const config = require('../config');
const {
  verifyTcKimlikWithNvi,
  validateTcKimlikChecksum,
  validateBirthYear,
  formatTurkishUpper
} = require('../lib/nviService');

/**
 * 3. ADIM: NVİ KPS Public SOAP Doğrulama Yardımcısı (Helper Fonksiyon)
 * Servis Adresi: https://tckimlik.nvi.gov.tr/Service/KPSPublic.asmx?WSDL
 * 
 * Kullanıcıdan gelen TCKimlikNo, Ad, Soyad ve DogumYili verilerini NVİ TCKimlikNoDogrula metoduna gönderir.
 * Türkçe karakter duyarlılığını koruyarak büyük harfe dönüştürür (.toLocaleUpperCase('tr-TR')).
 * 
 * @param {Object} identityData
 * @param {string|number} identityData.tcKimlikNo
 * @param {string} identityData.ad
 * @param {string} identityData.soyad
 * @param {string|number} identityData.dogumYili
 * @returns {Promise<boolean>}
 */
async function verifyNviTcKimlik({ tcKimlikNo, ad, soyad, dogumYili }) {
  return await verifyTcKimlikWithNvi({ tcKimlikNo, ad, soyad, dogumYili });
}

/**
 * Yeni Kullanıcı / Bayi / Müşteri Kayıt İşlemi
 * POST /api/auth/register
 */
async function register(req, res) {
  try {
    const {
      email,
      password,
      // NVİ Kimlik Doğrulama Alanları
      tcKimlikNo,
      tcNo,
      taxNumber,
      ad,
      firstName,
      soyad,
      lastName,
      dogumYili,
      birthYear,
      // Diğer Profil Verileri
      fullName,
      name,
      phone,
      tenantId,
      subdomain,
      customerType,
      companyName,
      address
    } = req.body;

    // 1. Temel Girdi Doğrulamaları
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

    const cleanEmail = String(email).toLowerCase().trim();

    // 2. NVİ Kimlik Verilerini Derleme (Farklı isimlendirmelerle esnek uyumluluk)
    const rawTc = tcKimlikNo || tcNo || (taxNumber && String(taxNumber).length === 11 ? taxNumber : null);
    let rawAd = ad || firstName;
    let rawSoyad = soyad || lastName;

    // Eğer ad/soyad tek bir fullName içinde geldiyse akıllıca ayıkla
    if ((!rawAd || !rawSoyad) && (fullName || name)) {
      const parts = String(fullName || name).trim().split(/\s+/);
      if (parts.length >= 2) {
        rawSoyad = parts.pop();
        rawAd = parts.join(' ');
      } else if (parts.length === 1 && !rawAd) {
        rawAd = parts[0];
      }
    }

    const rawDogumYili = dogumYili || birthYear;
    const isBayiReg = Boolean(req.body.isBayi || customerType === 'BAYI' || req.body.firmName);
    const hasNviIntent = Boolean(isBayiReg || rawTc || rawDogumYili || (rawAd && rawSoyad && (tcKimlikNo || dogumYili)));

    // 1. ADIM (Prompt Kuralı): Bayi kayıt formunda / NVİ doğrulamalı işlemlerde:
    // 'Ad', 'Soyad' ve 'TC Kimlik No' alanlarına ek olarak zorunlu 'Doğum Yılı' input'u.
    // Form verilerini toplarken bu 4 verinin boş olmadığından emin ol.
    if (hasNviIntent) {
      if (!rawTc || !rawAd || !rawSoyad || !rawDogumYili) {
        return res.status(400).json({
          success: false,
          message: 'Devlet (NVİ) kimlik doğrulaması için Ad, Soyad, TC Kimlik No ve Doğum Yılı alanlarının doldurulması zorunludur.'
        });
      }

      const cleanTc = String(rawTc).trim();
      const cleanAd = formatTurkishUpper(rawAd);
      const cleanSoyad = formatTurkishUpper(rawSoyad);
      const cleanDogumYili = parseInt(String(rawDogumYili).trim(), 10);

      // Biçim Kontrolleri
      if (!/^[1-9][0-9]{10}$/.test(cleanTc)) {
        return res.status(400).json({
          success: false,
          message: 'TC Kimlik Numarası 11 haneli ve geçerli formatta olmalıdır.'
        });
      }

      if (!validateBirthYear(cleanDogumYili)) {
        return res.status(400).json({
          success: false,
          message: 'Doğum Yılı 4 haneli geçerli bir yıl olmalıdır (Örn: 1990).'
        });
      }

      // 3. ADIM (Prompt Kuralı): NVİ KPS Public SOAP Servisi Doğrulaması
      // "Eğer NVİ'den dönen sonuç false ise (veya servis hata verirse), veritabanına kayıt işlemini
      // anında iptal edip frontend'e 400 Bad Request: Girdiğiniz kimlik bilgileri devlet kayıtlarıyla uyuşmuyor. hatasını fırlat."
      const isNviValid = await verifyNviTcKimlik({
        tcKimlikNo: cleanTc,
        ad: cleanAd,
        soyad: cleanSoyad,
        dogumYili: cleanDogumYili
      });

      if (!isNviValid) {
        console.warn(`[SECURITY_ALERT] NVİ Kimlik Doğrulama Reddedildi! TC: ${cleanTc.slice(0, 3)}*****, İsim: ${cleanAd} ${cleanSoyad}`);
        return res.status(400).json({
          success: false,
          message: 'Girdiğiniz kimlik bilgileri devlet kayıtlarıyla uyuşmuyor.'
        });
      }
    }

    // 4. E-posta Tekillik Kontrolü
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Bu e-posta adresi ile kayıtlı bir kullanıcı zaten mevcut.'
      });
    }

    // 5. Hedef Bayi (Tenant) Belirleme
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

    // 6. Şifre Hashleme
    const hashedPassword = await bcrypt.hash(password, 10);

    // 7. Rol Belirleme (Güvenlik: Mass Assignment engeli)
    const validTypes = ['MECHANIC', 'RETAIL'];
    const assignedCustomerType = customerType && validTypes.includes(String(customerType).toUpperCase())
      ? String(customerType).toUpperCase()
      : 'MECHANIC';

    const displayName = `${cleanAd} ${cleanSoyad}`.trim();
    const finalCompanyName = (companyName || '').trim() ||
      (assignedCustomerType === 'MECHANIC' ? `${cleanAd} Oto Servis` : displayName);

    // 8. Prisma Transaction ile Güvenli Veritabanı Kaydı
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: cleanEmail,
          password: hashedPassword,
          role: 'CUSTOMER', // Herkese açık kayıtta yetki daima CUSTOMER'dır
          name: displayName,
          tenantId: targetTenantId
        }
      });

      let profile = null;
      if (targetTenantId) {
        profile = await tx.customerProfile.create({
          data: {
            userId: newUser.id,
            tenantId: targetTenantId,
            companyName: finalCompanyName,
            phone: phone ? String(phone).trim() : null,
            customerType: assignedCustomerType,
            taxNumber: cleanTc, // Doğrulanmış T.C. Kimlik No güvenle kaydedilir
            address: address ? String(address).trim() : null,
            status: assignedCustomerType === 'MECHANIC' ? 'PENDING_APPROVAL' : 'APPROVED',
            balance: 0.0,
            discountRate: 0.0
          }
        });
      }

      return { user: newUser, profile };
    });

    // 9. Güvenli JWT Token Üretimi
    const token = jwt.sign(
      {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        tenantId: result.user.tenantId
      },
      config.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const safeUser = {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      tenantId: result.user.tenantId,
      customerProfile: result.profile
    };

    return res.status(201).json({
      success: true,
      message: assignedCustomerType === 'MECHANIC'
        ? 'NVİ doğrulamalı otoservis kaydınız başarıyla alındı. Bayi onayının ardından iskontolu toptan alışveriş yapabilirsiniz.'
        : 'NVİ doğrulamalı müşteri kaydınız başarıyla tamamlandı.',
      token,
      data: {
        token,
        user: safeUser
      }
    });

  } catch (error) {
    console.error('[AUTH_REGISTER_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Kayıt işlemi sırasında beklenmeyen bir sunucu hatası oluştu.'
    });
  }
}

/**
 * Yeni Bayi (Tenant / B2B Bayilik) Başvuru & Kayıt Uç Noktası
 * POST /api/auth/register-bayi
 */
async function registerBayi(req, res) {
  try {
    const {
      // NVİ Kimlik Bilgileri
      ad,
      soyad,
      tcKimlikNo,
      dogumYili,
      // Bayi & Yönetici Bilgileri
      firmName,
      companyName,
      email,
      password,
      phone,
      subdomainPrefix,
      subdomain
    } = req.body;

    // 1. ZORUNLU NVİ ALAN KONTROLLERİ
    if (!tcKimlikNo || !ad || !soyad || !dogumYili) {
      return res.status(400).json({
        success: false,
        message: 'Bayi yetkilisi için Ad, Soyad, TC Kimlik No ve Doğum Yılı alanlarının doldurulması zorunludur.'
      });
    }

    if (!email || !password || (!firmName && !companyName)) {
      return res.status(400).json({
        success: false,
        message: 'Firma adı, e-posta ve şifre alanları zorunludur.'
      });
    }

    const cleanTc = String(tcKimlikNo).trim();
    const cleanAd = formatTurkishUpper(ad);
    const cleanSoyad = formatTurkishUpper(soyad);
    const cleanDogumYili = parseInt(String(dogumYili).trim(), 10);
    const cleanEmail = String(email).toLowerCase().trim();
    const cleanFirmName = String(firmName || companyName).trim();

    // 2. Biçim & Algoritma Kontrolü
    if (!/^[1-9][0-9]{10}$/.test(cleanTc)) {
      return res.status(400).json({
        success: false,
        message: 'TC Kimlik Numarası 11 haneli ve geçerli formatta olmalıdır.'
      });
    }

    if (!validateBirthYear(cleanDogumYili)) {
      return res.status(400).json({
        success: false,
        message: 'Doğum Yılı 4 haneli geçerli bir yıl olmalıdır (Örn: 1990).'
      });
    }

    // 3. NVİ KPS Public SOAP Doğrulaması
    const isNviValid = await verifyNviTcKimlik({
      tcKimlikNo: cleanTc,
      ad: cleanAd,
      soyad: cleanSoyad,
      dogumYili: cleanDogumYili
    });

    if (!isNviValid) {
      console.warn(`[SECURITY_ALERT] Bayi NVİ Doğrulama Reddedildi! TC: ${cleanTc.slice(0, 3)}*****, İsim: ${cleanAd} ${cleanSoyad}`);
      return res.status(400).json({
        success: false,
        message: 'Girdiğiniz kimlik bilgileri devlet kayıtlarıyla uyuşmuyor.'
      });
    }

    // 4. E-posta ve Subdomain Tekillik Kontrolü
    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Bu e-posta adresi ile kayıtlı bir hesap zaten mevcut.'
      });
    }

    const targetSubdomain = (subdomainPrefix || subdomain || cleanFirmName.toLowerCase().replace(/[^a-z0-9]/g, '')).toLowerCase().trim();
    const existingTenant = await prisma.tenant.findUnique({ where: { subdomain: targetSubdomain } });
    if (existingTenant) {
      return res.status(400).json({
        success: false,
        message: `'${targetSubdomain}' alt alan adı (subdomain) zaten kullanımda. Lütfen farklı bir alt alan adı seçiniz.`
      });
    }

    // 5. Şifreleme ve Transaction ile Tenant + Tenant Admin Oluşturma
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: {
          name: cleanFirmName,
          subdomain: targetSubdomain,
          themeColor: '#2563eb',
          isActive: true
        }
      });

      const newUser = await tx.user.create({
        data: {
          email: cleanEmail,
          password: hashedPassword,
          name: `${cleanAd} ${cleanSoyad}`,
          role: 'TENANT_ADMIN',
          tenantId: newTenant.id
        }
      });

      return { tenant: newTenant, user: newUser };
    });

    const token = jwt.sign(
      {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        tenantId: result.user.tenantId
      },
      config.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'NVİ doğrulamalı bayi hesabınız başarıyla oluşturuldu.',
      token,
      data: {
        token,
        tenant: result.tenant,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          tenantId: result.user.tenantId
        }
      }
    });

  } catch (error) {
    console.error('[AUTH_REGISTER_BAYI_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Bayi kayıt işlemi sırasında sunucu hatası oluştu.'
    });
  }
}

module.exports = {
  verifyNviTcKimlik,
  register,
  registerBayi
};
