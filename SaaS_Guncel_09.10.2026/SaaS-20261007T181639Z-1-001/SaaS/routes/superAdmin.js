// ============================================================================
// Multi-Tenant B2B SaaS - Süper Admin API Rotaları (routes/superAdmin.js)
// ============================================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { verifyToken, checkSuperAdmin } = require('../middleware/auth');
const { verifyTcKimlikWithNvi } = require('../lib/nviService');
const tenantController = require('../controllers/tenantController');

// Tüm süper admin rotalarına güvenlik katmanını uygula
// Preflight (OPTIONS) istekleri güvenlik duvarına takılmadan doğrudan geçer
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }
  next();
});
router.use(verifyToken, checkSuperAdmin);

// ============================================================================
// 0. SİSTEM GENELİ KPI VE İSTATİSTİK YÖNETİMİ
// ============================================================================

/**
 * @route   GET /api/admin/stats
 * @desc    Süper Admin paneli için genel sistem KPI istatistiklerini (aktif bayi, parça havuzu, tamirci sayısı) döner.
 * @access  Protected (SUPER_ADMIN)
 */
router.get('/stats', async (req, res) => {
  try {
    const activeTenants = await prisma.tenant.count({ where: { isActive: true } });
    const totalProducts = await prisma.product.count();
    const totalCustomers = await prisma.customerProfile.count();

    return res.status(200).json({
      success: true,
      data: {
        activeTenants,
        totalProducts,
        totalCustomers
      }
    });
  } catch (error) {
    console.error('[SUPER_ADMIN_GET_STATS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'İstatistikler yüklenirken sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================================================
// 1. BAYİ (TENANT) YÖNETİMİ
// ============================================================================

/**
 * @route   POST /api/admin/tenants
 * @desc    Yeni bir bayi (Tenant) oluşturur ve eş zamanlı olarak TENANT_ADMIN kullanıcısını tahsis eder (Transaction).
 * @access  Protected (SUPER_ADMIN)
 */
router.post('/tenants', async (req, res) => {
  try {
    // 1. İstekten (req.body) verileri al
    const { firmName, subdomainPrefix, adminEmail, adminPassword, themeColor, name, subdomain, ad, soyad, tcKimlikNo, dogumYili } = req.body;

    const resolvedFirmName = (firmName || name || '').trim();
    const resolvedSubdomain = (subdomainPrefix || subdomain || '').toLowerCase().trim();
    const cleanEmail = (adminEmail || '').toLowerCase().trim();
    const rawPassword = adminPassword ? String(adminPassword) : '';
    const cleanThemeColor = themeColor ? themeColor.trim() : '#2563eb';

    // NVİ Kimlik Doğrulaması (Eğer TC veya yetkili kimlik bilgisi gönderildiyse)
    if (tcKimlikNo || ad || soyad || dogumYili) {
      if (!tcKimlikNo || !ad || !soyad || !dogumYili) {
        return res.status(400).json({
          success: false,
          message: 'Devlet (NVİ) doğrulaması için Yetkili Ad, Soyad, TC Kimlik No ve Doğum Yılı alanları zorunludur.'
        });
      }
      const isNviValid = await verifyTcKimlikWithNvi({ tcKimlikNo, ad, soyad, dogumYili });
      if (!isNviValid) {
        return res.status(400).json({
          success: false,
          message: 'Girdiğiniz kimlik bilgileri devlet kayıtlarıyla uyuşmuyor.'
        });
      }
    }

    // Zorunlu Alan Doğrulamaları
    if (!resolvedFirmName || !resolvedSubdomain || !cleanEmail || !rawPassword) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen firma adı (firmName), subdomain öneki (subdomainPrefix), yönetici e-posta (adminEmail) ve şifresini (adminPassword) eksiksiz giriniz.'
      });
    }

    // 2. Subdomain ve E-posta Benzersizlik Kontrolleri
    const existingTenant = await prisma.tenant.findUnique({
      where: { subdomain: resolvedSubdomain }
    });
    if (existingTenant) {
      return res.status(409).json({
        success: false,
        message: `"${resolvedSubdomain}" subdomain öneki halihazırda kullanılmaktadır.`
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: `"${cleanEmail}" e-posta adresiyle kayıtlı bir kullanıcı zaten mevcut.`
      });
    }

    // 3. bcrypt.hash kullanarak adminPassword değerini mutlaka şifrele (hash'le)
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(rawPassword, saltRounds);

    // 4. Prisma transaction (prisma.$transaction) kullanarak:
    // Önce Tenant tablosuna firmayı kaydet.
    // Ardından User tablosuna email: adminEmail, password: hashedPassword, role: 'TENANT_ADMIN' ve tenantId: tenant.id olacak şekilde bayi yöneticisini kaydet.
    const result = await prisma.$transaction(async (tx) => {
      // Adım 1: Tenant tablosuna kayıt
      const tenant = await tx.tenant.create({
        data: {
          name: resolvedFirmName,
          subdomain: resolvedSubdomain,
          themeColor: cleanThemeColor,
          isActive: true
        }
      });

      // Adım 2: User tablosuna bayi yöneticisi kaydı
      const user = await tx.user.create({
        data: {
          email: cleanEmail,
          password: hashedPassword,
          role: 'TENANT_ADMIN',
          tenantId: tenant.id
        },
        select: {
          id: true,
          email: true,
          role: true,
          tenantId: true,
          createdAt: true
        }
      });

      return { tenant, user, adminUser: user };
    });

    // 5. Başarılı olursa 201 status koduyla geri dön
    return res.status(201).json({
      success: true,
      message: `"${result.tenant.name}" firması ve bayi yönetici hesabı başarıyla oluşturuldu.`,
      data: result,
      tenant: result.tenant,
      user: result.user
    });

  } catch (error) {
    console.error('[SUPER_ADMIN_CREATE_TENANT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Firma oluşturma işlemi sırasında sunucu hatası meydana geldi.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/admin/tenants, GET /api/tenants, GET /tenants
 * @desc    Sistemdeki tüm kayıtlı firmaları ve özet istatistiklerini listeler.
 * @access  Protected (SUPER_ADMIN)
 */
router.get(['/tenants', '/api/tenants', '/admin/tenants'], tenantController.getAllTenants);

/**
 * @route   GET /api/admin/pending-tenants, GET /api/pending-tenants, GET /pending-tenants, GET /tenants/pending
 * @desc    Onay bekleyen bayilerin (status === 'PENDING') listesini döner.
 * @access  Protected (SUPER_ADMIN)
 */
router.get([
  '/pending-tenants',
  '/tenants/pending',
  '/api/pending-tenants',
  '/admin/pending-tenants',
  '/api/tenants/pending'
], tenantController.getPendingTenants);

/**
 * @route   PUT /api/admin/tenants/:id/approve
 * @desc    Onay bekleyen bayiyi onaylar (status: APPROVED, isActive: true).
 * @access  Protected (SUPER_ADMIN)
 */
router.all(['/tenants/:id/approve', '/tenants/approve/:id'], tenantController.approveTenant);

/**
 * @route   PUT /api/admin/tenants/:id/reject
 * @desc    Bayi başvurusunu reddeder (status: REJECTED, isActive: false).
 * @access  Protected (SUPER_ADMIN)
 */
router.all(['/tenants/:id/reject', '/tenants/reject/:id'], tenantController.rejectTenant);

/**
 * @route   PATCH /api/admin/tenants/:id/status
 * @desc    Bayi durumunu aktif/pasif veya statüsünü (APPROVED, PENDING, REJECTED) günceller.
 * @access  Protected (SUPER_ADMIN)
 */
router.patch('/tenants/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, isActive } = req.body || {};

    const tenant = await prisma.tenant.findUnique({
      where: { id }
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Belirtilen bayi bulunamadı.'
      });
    }

    const nextIsActive = isActive !== undefined ? Boolean(isActive) : !tenant.isActive;
    const nextStatus = status || (nextIsActive ? 'APPROVED' : tenant.status);

    const updatedTenant = await prisma.$transaction(async (tx) => {
      let t;
      try {
        t = await tx.tenant.update({
          where: { id },
          data: {
            isActive: nextIsActive,
            status: nextStatus
          }
        });
      } catch (statusErr) {
        if (statusErr.message && (statusErr.message.includes("Unknown argument 'status'") || statusErr.message.includes('Unknown arg'))) {
          t = await tx.tenant.update({
            where: { id },
            data: {
              isActive: nextIsActive
            }
          });
        } else {
          throw statusErr;
        }
      }

      // Veritabanında status kolonu mevcutsa SQL ile de güvene al
      try {
        await tx.$executeRawUnsafe(`UPDATE "Tenant" SET "isActive" = ${nextIsActive ? 'true' : 'false'}, "status" = '${nextStatus || 'PENDING'}' WHERE id = '${id}';`);
      } catch (rawErr) {
        // Kolon yoksa veya hata oluşursa yoksay
      }

      if (status) {
        try {
          await tx.user.updateMany({
            where: { tenantId: id },
            data: { status: nextStatus }
          });
        } catch (uErr) {
          // Yoksay
        }
      }

      return t;
    });

    return res.status(200).json({
      success: true,
      message: 'Bayi durumu güncellendi',
      isActive: updatedTenant.isActive,
      status: updatedTenant.status,
      tenant: updatedTenant,
      data: updatedTenant
    });
  } catch (error) {
    console.error('[SUPER_ADMIN_PATCH_STATUS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Bayi durumu güncellenirken sunucu hatası oluştu.'
    });
  }
});

/**
 * @route   DELETE /api/admin/tenants/:id
 * @desc    Bayiyi ve tüm ilişkili verilerini (TenantProduct, CustomerProfile, Order, User vb.) veritabanından kalıcı olarak siler.
 * @access  Protected (SUPER_ADMIN)
 */
router.delete('/tenants/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id }
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Silinmek istenen bayi bulunamadı.'
      });
    }

    // Prisma Transaction ile bayiye bağlı tüm alt kayıtları ve ardından Tenant kaydını kökten sil
    await prisma.$transaction(async (tx) => {
      // 1. Bayinin sipariş kalemlerini (OrderItem) sil
      await tx.orderItem.deleteMany({
        where: {
          order: { tenantId: id }
        }
      });

      // 2. Bayinin siparişlerini (Order) sil
      await tx.order.deleteMany({
        where: { tenantId: id }
      });

      // 3. Stok hareket denetim loglarını (StockMovement) sil
      await tx.stockMovement.deleteMany({
        where: { tenantId: id }
      });

      // 4. Müşteri cari hesap defterlerini (CustomerLedger) sil
      await tx.customerLedger.deleteMany({
        where: { tenantId: id }
      });

      // 5. Bayi katalog ürünlerini (TenantProduct) sil
      await tx.tenantProduct.deleteMany({
        where: { tenantId: id }
      });

      // 6. Otoservis müşteri profillerini (CustomerProfile) sil
      await tx.customerProfile.deleteMany({
        where: { tenantId: id }
      });

      // 7. Bayiye bağlı kullanıcıları (User: TENANT_ADMIN ve CUSTOMER) sil
      await tx.user.deleteMany({
        where: { tenantId: id }
      });

      // 8. Son olarak Tenant (bayi) kaydını sil
      await tx.tenant.delete({
        where: { id }
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Bayi ve tüm ilişkili veriler kalıcı olarak silindi.'
    });

  } catch (error) {
    console.error('[SUPER_ADMIN_DELETE_TENANT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Bayi silinirken sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PATCH /api/admin/tenants/:id
 * @desc    Bayinin adını veya temasını günceller.
 * @access  Protected (SUPER_ADMIN)
 */
router.patch('/tenants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, themeColor } = req.body;

    const data = {};
    if (name) data.name = name.trim();
    if (themeColor) data.themeColor = themeColor.trim();

    const updated = await prisma.tenant.update({
      where: { id },
      data
    });

    return res.status(200).json({
      success: true,
      message: `"${updated.name}" bayisi başarıyla güncellendi.`,
      data: updated
    });
  } catch (error) {
    console.error('[SUPER_ADMIN_PATCH_TENANT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Bayi bilgileri güncellenirken sunucu hatası oluştu.'
    });
  }
});

// ============================================================================
// 2. MERKEZİ PARÇA HAVUZU (PRODUCT) YÖNETİMİ
// ============================================================================

/**
 * @route   POST /api/admin/products
 * @desc    Merkezi parça havuzuna (Product tablosuna) yeni orijinal yedek parça ekler.
 * @access  Protected (SUPER_ADMIN)
 */
router.post('/products', async (req, res) => {
  try {
    const { oeNumber, name, category, defaultPrice, imageUrl, vehicleBrand, compatibleModels, partGroup } = req.body;

    // 1. Zorunlu Alan Doğrulamaları
    if (!oeNumber || !name || !category || defaultPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen OE numarası, parça adı, kategori ve varsayılan liste fiyatını eksiksiz giriniz.'
      });
    }

    const cleanOe = oeNumber.toUpperCase().trim();

    // 2. OE Numarası Benzersizlik Kontrolü
    const existingProduct = await prisma.product.findUnique({
      where: { oeNumber: cleanOe }
    });
    if (existingProduct) {
      return res.status(409).json({
        success: false,
        message: `"${cleanOe}" OE numarasına sahip bir parça merkezi havuzda zaten kayıtlı.`
      });
    }

    // 3. Fiyat Formatlama
    const parsedPrice = parseFloat(defaultPrice);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz fiyat formatı. Lütfen pozitif bir sayı giriniz.'
      });
    }

    // 4. Parça Havuzuna Kayıt (Otomotiv Standartları)
    const newProduct = await prisma.product.create({
      data: {
        oeNumber: cleanOe,
        name: name.trim(),
        category: category.trim(),
        vehicleBrand: vehicleBrand ? String(vehicleBrand).trim() : null,
        compatibleModels: compatibleModels ? String(compatibleModels).trim() : null,
        partGroup: partGroup ? String(partGroup).trim() : null,
        defaultPrice: parsedPrice,
        imageUrl: imageUrl ? imageUrl.trim() : null
      }
    });

    return res.status(201).json({
      success: true,
      message: `"${newProduct.name}" (${newProduct.oeNumber}) parçası merkezi havuza başarıyla eklendi.`,
      data: newProduct
    });

  } catch (error) {
    console.error('[SUPER_ADMIN_CREATE_PRODUCT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Parça havuzuna ürün eklenirken sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/admin/products
 * @desc    Merkezi parça havuzundaki tüm orijinal parçaları listeler.
 * @access  Protected (SUPER_ADMIN)
 */
router.get('/products', async (req, res) => {
  try {
    const { category, search, brand, partGroup, page, limit } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // İsteğe bağlı filtreleme
    const where = {};
    if (category) {
      where.category = category;
    }
    if (brand) {
      where.vehicleBrand = { contains: String(brand).trim(), mode: 'insensitive' };
    }
    if (partGroup) {
      where.partGroup = { contains: String(partGroup).trim(), mode: 'insensitive' };
    }
    if (search) {
      const s = String(search).trim();
      where.OR = [
        { oeNumber: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        { vehicleBrand: { contains: s, mode: 'insensitive' } },
        { compatibleModels: { contains: s, mode: 'insensitive' } },
        { partGroup: { contains: s, mode: 'insensitive' } }
      ];
    }

    const totalCount = await prisma.product.count({ where });
    const products = await prisma.product.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum) || 1
      },
      count: products.length,
      data: products
    });

  } catch (error) {
    console.error('[SUPER_ADMIN_GET_PRODUCTS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Parça havuzu listelenirken bir hata oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PATCH /api/admin/products/:id
 * @desc    Merkezi parça havuzundaki bir parçanın bilgilerini günceller (ÖNERİ-07).
 * @access  Protected (SUPER_ADMIN)
 */
router.patch('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, oeNumber, category, defaultPrice, imageUrl, vehicleBrand, compatibleModels, partGroup } = req.body;

    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Güncellenecek parça merkezi havuzda bulunamadı.'
      });
    }

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (category) updateData.category = category.trim();
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl ? imageUrl.trim() : null;
    if (vehicleBrand !== undefined) updateData.vehicleBrand = vehicleBrand ? String(vehicleBrand).trim() : null;
    if (compatibleModels !== undefined) updateData.compatibleModels = compatibleModels ? String(compatibleModels).trim() : null;
    if (partGroup !== undefined) updateData.partGroup = partGroup ? String(partGroup).trim() : null;

    if (oeNumber) {
      const cleanOe = oeNumber.toUpperCase().trim();
      if (cleanOe !== existingProduct.oeNumber) {
        const conflict = await prisma.product.findUnique({
          where: { oeNumber: cleanOe }
        });
        if (conflict) {
          return res.status(409).json({
            success: false,
            message: `"${cleanOe}" OE numarası başka bir parçada zaten kullanımda.`
          });
        }
        updateData.oeNumber = cleanOe;
      }
    }

    if (defaultPrice !== undefined) {
      const parsedPrice = parseFloat(defaultPrice);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({
          success: false,
          message: 'Lütfen geçerli pozitif bir liste fiyatı giriniz.'
        });
      }
      updateData.defaultPrice = parsedPrice;
    }

    const updated = await prisma.product.update({
      where: { id },
      data: updateData
    });

    return res.status(200).json({
      success: true,
      message: `"${updated.name}" (${updated.oeNumber}) bilgileri başarıyla güncellendi.`,
      data: updated
    });

  } catch (error) {
    console.error('[SUPER_ADMIN_PATCH_PRODUCT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Parça güncellenirken sunucu hatası oluştu.'
    });
  }
});

/**
 * @route   DELETE /api/admin/products/:id
 * @desc    Merkezi parça havuzundan parçayı siler (ÖNERİ-07).
 * @access  Protected (SUPER_ADMIN)
 */
router.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existingProduct = await prisma.product.findUnique({
      where: { id },
      include: {
        _count: {
          select: { tenantProducts: true }
        }
      }
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Silinmek istenen parça merkezi havuzda bulunamadı.'
      });
    }

    // Parça herhangi bir bayinin kataloğunda mevcutsa koruma sağla
    if (existingProduct._count.tenantProducts > 0) {
      return res.status(400).json({
        success: false,
        message: `Bu parça ${existingProduct._count.tenantProducts} bayinin kataloğunda ekli olduğu için silinemez. Önce bayilerden kaldırılmalıdır.`
      });
    }

    await prisma.product.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: `"${existingProduct.name}" (${existingProduct.oeNumber}) parçası havuzdan başarıyla silindi.`
    });

  } catch (error) {
    console.error('[SUPER_ADMIN_DELETE_PRODUCT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Parça silinirken sunucu hatası oluştu.'
    });
  }
});

// ============================================================================
// 3. SİSTEM AYARLARI VE YAPILANDIRMA (SYSTEM SETTINGS - SINGLETON)
// ============================================================================

/**
 * @route   GET /api/admin/settings
 * @desc    Sistem ayarlarını çeker (Singleton id: 1). Yoksa varsayılanı oluşturup döner.
 * @access  Protected (SUPER_ADMIN)
 */
router.get('/settings', async (req, res) => {
  try {
    let settings = await prisma.systemSettings.findUnique({
      where: { id: 1 }
    });

    if (!settings) {
      settings = await prisma.systemSettings.create({
        data: { id: 1 }
      });
    }

    // Backend .env dosyasındaki PARTS_CATALOG_API_KEY ortam değişkenini dinamik ve güvenli olarak entegre et
    const isCustomDbKey = settings.tecdocApiKey && settings.tecdocApiKey !== 'tc_live_demo_984182938472';
    const effectiveApiKey = isCustomDbKey ? settings.tecdocApiKey : (process.env.PARTS_CATALOG_API_KEY || settings.tecdocApiKey || '');

    return res.status(200).json({
      success: true,
      data: {
        ...settings,
        tecdocApiKey: effectiveApiKey,
        partsCatalogApiKey: effectiveApiKey
      }
    });
  } catch (error) {
    console.error('[SUPER_ADMIN_GET_SETTINGS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Sistem ayarları yüklenirken sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PUT /api/admin/settings
 * @desc    Sistem ayarlarını günceller (Singleton id: 1).
 * @access  Protected (SUPER_ADMIN)
 */
router.put('/settings', async (req, res) => {
  try {
    const {
      tecdocApiKey,
      partsCatalogApiKey,
      tecdocEndpoint,
      defaultB2BDiscount,
      defaultTaxRate,
      platformCurrency,
      adminEmail
    } = req.body;

    const updateData = {};

    const incomingApiKey = partsCatalogApiKey !== undefined ? partsCatalogApiKey : tecdocApiKey;
    if (incomingApiKey !== undefined) {
      updateData.tecdocApiKey = incomingApiKey ? String(incomingApiKey).trim() : null;
    }

    if (tecdocEndpoint !== undefined) {
      updateData.tecdocEndpoint = tecdocEndpoint ? String(tecdocEndpoint).trim() : 'https://api.tecalliance.net/v2/catalog';
    }

    if (defaultB2BDiscount !== undefined && defaultB2BDiscount !== null && defaultB2BDiscount !== '') {
      const parsedDiscount = parseFloat(defaultB2BDiscount);
      if (!isNaN(parsedDiscount)) {
        updateData.defaultB2BDiscount = parsedDiscount;
      }
    }

    if (defaultTaxRate !== undefined && defaultTaxRate !== null && defaultTaxRate !== '') {
      const parsedTax = parseFloat(defaultTaxRate);
      if (!isNaN(parsedTax)) {
        updateData.defaultTaxRate = parsedTax;
      }
    }

    if (platformCurrency !== undefined) {
      updateData.platformCurrency = String(platformCurrency).trim().toUpperCase();
    }

    if (adminEmail !== undefined) {
      updateData.adminEmail = String(adminEmail).trim().toLowerCase();
    }

    // ID 1 kaydının varlığını sağla, ardından prisma.systemSettings.update ile güncelle
    const existing = await prisma.systemSettings.findUnique({
      where: { id: 1 }
    });

    if (!existing) {
      await prisma.systemSettings.create({
        data: { id: 1 }
      });
    }

    const updatedSettings = await prisma.systemSettings.update({
      where: { id: 1 },
      data: updateData
    });

    // =========================================================================
    // SÜPER ADMİN KULLANICI HESABI SENKRONİZASYONU (E-Posta ve Şifre)
    // =========================================================================
    let superAdminUser = null;
    if (req.user && req.user.id) {
      superAdminUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    }
    if (!superAdminUser || superAdminUser.role !== 'SUPER_ADMIN') {
      superAdminUser = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    }

    const userUpdateData = {};

    // 1. E-posta senkronizasyonu
    if (updateData.adminEmail && superAdminUser && superAdminUser.email !== updateData.adminEmail) {
      const emailConflict = await prisma.user.findUnique({
        where: { email: updateData.adminEmail }
      });
      if (emailConflict && emailConflict.id !== superAdminUser.id) {
        return res.status(409).json({
          success: false,
          message: `"${updateData.adminEmail}" e-posta adresi başka bir kullanıcı tarafından kullanılmaktadır.`
        });
      }
      userUpdateData.email = updateData.adminEmail;
    }

    // 2. Şifre güncelleme (adminPassword veya newPassword)
    const targetPassword = req.body.adminPassword || req.body.newPassword;
    if (targetPassword && String(targetPassword).trim() !== '') {
      const rawPassword = String(targetPassword).trim();
      if (rawPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Yönetici şifresi en az 6 karakter olmalıdır.'
        });
      }
      userUpdateData.password = await bcrypt.hash(rawPassword, 10);
    }

    // Kullanıcı tablosunu güncelle
    if (superAdminUser && Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id: superAdminUser.id },
        data: userUpdateData
      });
    }

    const effectiveApiKey = (updateData.tecdocApiKey !== undefined ? updateData.tecdocApiKey : (process.env.PARTS_CATALOG_API_KEY || updatedSettings.tecdocApiKey)) || '';

    return res.status(200).json({
      success: true,
      message: 'Sistem ayarları ve yönetici hesabı başarıyla güncellendi.',
      data: {
        ...updatedSettings,
        tecdocApiKey: effectiveApiKey,
        partsCatalogApiKey: effectiveApiKey
      }
    });

  } catch (error) {
    console.error('[SUPER_ADMIN_UPDATE_SETTINGS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Sistem ayarları güncellenirken sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================================================
// 5. YÖNETİCİLER & ADMİN YETKİLENDİRME YÖNETİMİ
// ============================================================================

/**
 * @route   GET /api/admin/admins
 * @desc    Tüm sistem yöneticilerini (Süper Admin & Bayi Yöneticileri), mevcut kullanıcıları ve bayileri listeler.
 * @access  Protected (SUPER_ADMIN)
 */
router.get('/admins', async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['SUPER_ADMIN', 'TENANT_ADMIN'] }
      },
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            subdomain: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const availableUsers = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER'
      },
      select: {
        id: true,
        email: true,
        role: true,
        customerProfile: {
          select: {
            companyName: true
          }
        }
      },
      orderBy: { email: 'asc' }
    });

    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true, name: true, subdomain: true },
      orderBy: { name: 'asc' }
    });

    return res.status(200).json({
      success: true,
      data: {
        admins,
        availableUsers,
        tenants
      }
    });
  } catch (error) {
    console.error('[SUPER_ADMIN_GET_ADMINS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Yöneticiler yüklenirken sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/admin/admins
 * @desc    Yeni bir yönetici oluşturur veya mevcut kullanıcıya adminlik yetkisi tanımlar.
 * @access  Protected (SUPER_ADMIN)
 */
router.post('/admins', async (req, res) => {
  try {
    const { email, password, role = 'SUPER_ADMIN', tenantId } = req.body;

    if (!email || !String(email).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Yönetici e-posta adresi zorunludur.'
      });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const validRoles = ['SUPER_ADMIN', 'TENANT_ADMIN'];
    const targetRole = validRoles.includes(role) ? role : 'SUPER_ADMIN';

    if (targetRole === 'TENANT_ADMIN' && !tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Bayi yöneticisi için yetkilendirilecek bayi seçilmelidir.'
      });
    }

    // 1. Kullanıcı veritabanında mevcut mu kontrol et
    let existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (existingUser) {
      // Mevcut kullanıcının yetkisini yükselt / güncelle
      const updateData = {
        role: targetRole,
        tenantId: targetRole === 'TENANT_ADMIN' ? tenantId : null
      };

      if (password && String(password).trim().length >= 6) {
        updateData.password = await bcrypt.hash(String(password).trim(), 10);
      }

      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: updateData,
        select: {
          id: true,
          email: true,
          role: true,
          tenantId: true,
          createdAt: true,
          updatedAt: true,
          tenant: {
            select: { id: true, name: true, subdomain: true }
          }
        }
      });

      return res.status(200).json({
        success: true,
        message: `"${cleanEmail}" kullanıcısına başarıyla ${targetRole === 'SUPER_ADMIN' ? 'Süper Admin' : 'Bayi Yöneticisi'} yetkisi verildi.`,
        data: updatedUser
      });
    } else {
      // Sıfırdan yeni admin oluştur
      if (!password || String(password).trim().length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Yeni yönetici için en az 6 karakterli bir şifre belirlenmelidir.'
        });
      }

      const hashedPassword = await bcrypt.hash(String(password).trim(), 10);

      const newUser = await prisma.user.create({
        data: {
          email: cleanEmail,
          password: hashedPassword,
          role: targetRole,
          tenantId: targetRole === 'TENANT_ADMIN' ? tenantId : null
        },
        select: {
          id: true,
          email: true,
          role: true,
          tenantId: true,
          createdAt: true,
          tenant: {
            select: { id: true, name: true, subdomain: true }
          }
        }
      });

      return res.status(201).json({
        success: true,
        message: `Yeni ${targetRole === 'SUPER_ADMIN' ? 'Süper Admin' : 'Bayi Yöneticisi'} (${cleanEmail}) başarıyla oluşturuldu.`,
        data: newUser
      });
    }
  } catch (error) {
    console.error('[SUPER_ADMIN_CREATE_ADMIN_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Admin yetkisi atanırken sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PATCH /api/admin/admins/:id/password
 * @desc    Belirtilen yöneticinin şifresini sıfırlar / yeniler.
 * @access  Protected (SUPER_ADMIN)
 */
router.patch('/admins/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || String(newPassword).trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Yeni şifre en az 6 karakter olmalıdır.'
      });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı.'
      });
    }

    const hashedPassword = await bcrypt.hash(String(newPassword).trim(), 10);
    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword }
    });

    return res.status(200).json({
      success: true,
      message: `"${user.email}" yöneticisinin şifresi başarıyla güncellendi.`
    });
  } catch (error) {
    console.error('[SUPER_ADMIN_UPDATE_ADMIN_PASSWORD_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Şifre güncellenirken sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   DELETE /api/admin/admins/:id
 * @desc    Belirtilen kullanıcının yöneticilik yetkisini kaldırır (CUSTOMER yapar veya siler).
 * @access  Protected (SUPER_ADMIN)
 */
router.delete('/admins/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user && req.user.id === id) {
      return res.status(400).json({
        success: false,
        message: 'Kendi yöneticilik hesabınızı kaldıramazsınız.'
      });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı.'
      });
    }

    // Yetkiyi kaldırıp normal CUSTOMER rolüne çevir
    await prisma.user.update({
      where: { id },
      data: {
        role: 'CUSTOMER',
        tenantId: null
      }
    });

    return res.status(200).json({
      success: true,
      message: `"${user.email}" kullanıcısının yöneticilik yetkisi başarıyla kaldırıldı.`
    });
  } catch (error) {
    console.error('[SUPER_ADMIN_REVOKE_ADMIN_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Admin yetkisi kaldırılırken sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;


