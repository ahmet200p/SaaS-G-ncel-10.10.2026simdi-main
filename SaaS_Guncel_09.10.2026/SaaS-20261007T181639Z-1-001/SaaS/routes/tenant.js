// ============================================================================
// Multi-Tenant B2B SaaS - Bayi (Tenant) API Rotaları (routes/tenant.js)
// Veri İzolasyonu (Data Isolation): Her sorguda req.user.tenantId enjekte edilir.
// ============================================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { verifyToken, checkTenantAdmin } = require('../middleware/auth');

// Tüm bayi rotalarına JWT doğrulama ve Bayi Yöneticisi kontrolünü uygula
router.use(verifyToken, checkTenantAdmin);

// Asenkron Bayi Kimliği Ön Çözümleyici (Pre-Resolver)
router.use(async (req, res, next) => {
  try {
    let resolvedId = req.user?.tenantId;

    if (!resolvedId) {
      resolvedId = req.headers['x-tenant-id'] ||
                   req.headers['tenant-id'] ||
                   req.query?.tenantId ||
                   req.body?.tenantId ||
                   req.tenant?.id;
    }

    const slug = req.headers['x-tenant-slug'] || req.headers['x-subdomain'] || req.query?.tenant || req.query?.subdomain;
    if (!resolvedId && slug) {
      const t = await prisma.tenant.findFirst({
        where: { subdomain: String(slug).toLowerCase().trim() }
      });
      if (t) resolvedId = t.id;
    }

    if (!resolvedId && req.user?.id) {
      const u = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { tenantId: true }
      });
      if (u?.tenantId) {
        resolvedId = u.tenantId;
        req.user.tenantId = u.tenantId;
      }
    }

    if (!resolvedId && req.user?.role === 'SUPER_ADMIN') {
      const firstTenant = await prisma.tenant.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' }
      });
      if (firstTenant) {
        resolvedId = firstTenant.id;
      }
    }

    if (resolvedId) {
      req.resolvedTenantId = resolvedId;
      if (req.user && !req.user.tenantId) {
        req.user.tenantId = resolvedId;
      }
    }
  } catch (e) {
    console.warn('[TENANT_ROUTER_PRE_RESOLVE_WARN]:', e.message);
  }
  next();
});

/**
 * Tenant ID Çözümleyici Yardımcı:
 * GÜVENLİK (IDOR Koruması):
 * - Header (X-Tenant-ID / Tenant-ID), Query (?tenantId=...) veya Pre-Resolved ID'leri çözer.
 */
const resolveTenantId = (req, res) => {
  if (req.user && req.user.role === 'TENANT_ADMIN' && req.user.tenantId) {
    return req.user.tenantId;
  }

  const tenantId = req.resolvedTenantId ||
                   req.user?.tenantId ||
                   req.headers['x-tenant-id'] ||
                   req.headers['tenant-id'] ||
                   req.query?.tenantId ||
                   req.body?.tenantId ||
                   req.tenant?.id;

  if (!tenantId) {
    console.error('[TENANT_ID_RESOLUTION_FAIL_400]:', {
      method: req.method,
      url: req.originalUrl || req.url,
      headers: {
        authorization: req.headers.authorization ? 'Bearer ***' : undefined,
        'x-tenant-id': req.headers['x-tenant-id'],
        'tenant-id': req.headers['tenant-id'],
        'x-tenant-slug': req.headers['x-tenant-slug'],
        'x-subdomain': req.headers['x-subdomain']
      },
      query: req.query,
      user: req.user
    });

    res.status(400).json({
      success: false,
      code: 'TENANT_ID_REQUIRED',
      message: 'İşlem yapılacak bayi kimliği (tenantId) belirtilmelidir.',
      details: {
        hint: 'Lütfen isteğin headers kısmına X-Tenant-ID veya URL query parametresine ?tenantId=... ekleyiniz.'
      }
    });
    return null;
  }

  return tenantId;
};

// ============================================================================
// 1. BAYİ ÜRÜN VE KATALOG YÖNETİMİ
// ============================================================================

const fs = require('fs');
const upload = require('../middleware/upload');

// Yardımcı: Doğrulama veya işlem hatasında geçici yüklenen dosyaları temizle
const cleanupUploadedFiles = (files) => {
  if (!files) return;
  const list = Array.isArray(files) ? files : Object.values(files).flat();
  list.forEach((f) => {
    if (f && f.path) {
      try {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      } catch (err) {
        console.error('[CLEANUP_FILE_ERROR]:', err);
      }
    }
  });
};

// Multer görsel ara yazılımı (image, images, file gibi tüm alan adlarını esnek kabul eder)
const uploadProductImages = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Görsel yüklenirken bir hata oluştu.'
      });
    }
    next();
  });
};

/**
 * @route   POST /api/tenant/products & POST /api/tenant/catalog
 * @desc    Bayi kataloğuna görsel ve stok destekli organik ürün ekler/günceller.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
const handleCreateOrUpdateProduct = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) {
      cleanupUploadedFiles(req.files);
      return;
    }

    // 1. req.body üzerinden gelen ham verileri al (Ad, OE No, Marka, Model, Grup, Fiyat, Stok)
    const name = (req.body.name || req.body.productName || '').trim();
    const oeNumber = (req.body.oeNumber || '').trim();
    const vehicleBrand = (req.body.vehicleBrand || req.body.brand || '').trim() || null;
    const compatibleModels = (req.body.compatibleModels || req.body.models || '').trim() || null;
    const partGroup = (req.body.partGroup || req.body.part_group || '').trim() || null;
    const category = (req.body.category || partGroup || 'Genel').trim();

    if (!name || !oeNumber) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({
        success: false,
        message: 'Lütfen ürün adı ve OE numarası alanlarını eksiksiz giriniz.'
      });
    }

    // 2. Fiyat ve Stok Değerleri
    const rawPrice = req.body.price !== undefined && req.body.price !== ''
      ? req.body.price
      : (req.body.customPrice !== undefined && req.body.customPrice !== '' ? req.body.customPrice : req.body.defaultPrice);
    const rawStock = req.body.stock;

    const parsedPrice = parseFloat(rawPrice);
    const parsedStock = parseInt(rawStock, 10);

    if (isNaN(parsedPrice) || parsedPrice <= 0 || isNaN(parsedStock) || parsedStock <= 0) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({
        success: false,
        message: 'Stok ve fiyat değerleri 0\'dan büyük pozitif bir sayı olmalıdır.'
      });
    }

    // 3. Yüklenen görsel dosyalarını topla (Seçilmişse uploads dizinine kaydedilir, seçilmemişse null atanır)
    let imagePaths = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      imagePaths = req.files.map(f => `/uploads/${f.filename}`);
    } else if (req.file) {
      imagePaths = [`/uploads/${req.file.filename}`];
    } else if (req.body.imageUrl) {
      imagePaths = [req.body.imageUrl];
    }

    if (req.body.catalogImages) {
      try {
        const catImgs = typeof req.body.catalogImages === 'string'
          ? JSON.parse(req.body.catalogImages)
          : req.body.catalogImages;
        if (Array.isArray(catImgs)) {
          imagePaths = [...imagePaths, ...catImgs.filter(u => typeof u === 'string' && u.trim().length > 0)];
        }
      } catch (e) {
        if (typeof req.body.catalogImages === 'string' && req.body.catalogImages.trim()) {
          imagePaths.push(req.body.catalogImages.trim());
        }
      }
    }

    const primaryImage = imagePaths.length > 0 ? imagePaths[0] : (req.body.imageUrl || null);
    const imagesJson = imagePaths.length > 0 ? JSON.stringify(imagePaths) : (req.body.images || null);

    // 4. Prisma Transaction ile Ürün ve Bayi İlişkisi (Birebir Ham Veri Kaydı)
    const tenantProduct = await prisma.$transaction(async (tx) => {
      // OE numarasına göre Product tablosunda ürün varsa bul, yoksa yeni Product oluştur
      let product = await tx.product.findUnique({
        where: { oeNumber: oeNumber }
      });

      if (!product) {
        product = await tx.product.create({
          data: {
            oeNumber: oeNumber,
            name: name,
            category: category,
            vehicleBrand: vehicleBrand,
            compatibleModels: compatibleModels,
            partGroup: partGroup,
            defaultPrice: parsedPrice,
            imageUrl: primaryImage,
            images: imagesJson
          }
        });
      } else {
        product = await tx.product.update({
          where: { id: product.id },
          data: {
            name: name,
            category: category,
            vehicleBrand: vehicleBrand,
            compatibleModels: compatibleModels,
            partGroup: partGroup,
            defaultPrice: parsedPrice,
            ...(primaryImage ? { imageUrl: primaryImage, images: imagesJson } : {})
          }
        });
      }

      // Bu ürünü oturum açmış bayinin TenantProduct tablosuna bağla, stock ve customPrice kaydet
      const tp = await tx.tenantProduct.upsert({
        where: {
          tenantId_productId: {
            tenantId: tenantId,
            productId: product.id
          }
        },
        update: {
          stock: parsedStock,
          customPrice: parsedPrice
        },
        create: {
          tenantId: tenantId,
          productId: product.id,
          stock: parsedStock,
          customPrice: parsedPrice
        },
        include: {
          product: true
        }
      });

      return tp;
    });

    return res.status(201).json({
      success: true,
      message: `"${tenantProduct.product.name}" parçası bayiniz kataloğuna başarıyla eklendi.`,
      data: tenantProduct
    });

  } catch (error) {
    cleanupUploadedFiles(req.files);
    console.error('[TENANT_CREATE_PRODUCT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Ürün kataloğa eklenirken sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

router.post('/products', uploadProductImages, handleCreateOrUpdateProduct);
router.post('/catalog', uploadProductImages, handleCreateOrUpdateProduct);

/**
 * @route   GET /api/tenant/products & GET /api/tenant/catalog
 * @desc    Giriş yapan bayinin (req.user.tenantId) tüm TenantProduct kayıtlarını ilişkili Product bilgileriyle SQLite'tan döner.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
const handleGetTenantProducts = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const { search, brand, category, partGroup } = req.query;
    const whereCondition = { tenantId: tenantId };

    const productConditions = {};
    if (brand) productConditions.vehicleBrand = { contains: String(brand).trim() };
    if (category) productConditions.category = { contains: String(category).trim() };
    if (partGroup) productConditions.partGroup = { contains: String(partGroup).trim() };

    if (search) {
      const s = String(search).trim();
      productConditions.OR = [
        { name: { contains: s } },
        { oeNumber: { contains: s } },
        { vehicleBrand: { contains: s } },
        { compatibleModels: { contains: s } },
        { partGroup: { contains: s } }
      ];
    }

    if (Object.keys(productConditions).length > 0) {
      whereCondition.product = productConditions;
    }

    const products = await prisma.tenantProduct.findMany({
      where: whereCondition,
      include: {
        product: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    console.error('[TENANT_GET_PRODUCTS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Ürünler listelenirken sunucu hatası oluştu.'
    });
  }
};

router.get('/products', handleGetTenantProducts);
router.get('/catalog', handleGetTenantProducts);

/**
 * @route   DELETE /api/tenant/products/:id & DELETE /api/tenant/catalog/:id
 * @desc    Bayinin kendi kataloğundan ve veritabanından parçayı kalıcı olarak siler.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
const handleDeleteTenantProduct = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const id = req.params.id;

    // 1. tenantProduct kaydını bul (id veya productId ile eşleşebilir)
    let existing = await prisma.tenantProduct.findFirst({
      where: { id: id, tenantId: tenantId }
    });

    if (!existing) {
      existing = await prisma.tenantProduct.findFirst({
        where: { productId: id, tenantId: tenantId }
      });
    }

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Katalog parçası bulunamadı veya bayinize ait değil.'
      });
    }

    const tpId = existing.id;
    const productIdToDelete = existing.productId;

    // Varsa bağlı sipariş kalemlerini sil (kullanıcı kesin silinmesini istediği için foreign key kısıtlamasını temizle)
    await prisma.orderItem.deleteMany({
      where: { tenantProductId: tpId }
    });

    // Varsa geçici stok hareketlerini temizle
    await prisma.stockMovement.deleteMany({
      where: { tenantProductId: tpId }
    });

    // Ürünü bayiden kaldır
    await prisma.tenantProduct.delete({
      where: { id: tpId }
    });

    // Veritabanı temizliği: Eğer bu parça başka bir bayi kataloğunda yoksa ana Product tablosundan da tamamen sil
    if (productIdToDelete) {
      const otherTenantCount = await prisma.tenantProduct.count({
        where: { productId: productIdToDelete }
      });
      if (otherTenantCount === 0) {
        await prisma.product.delete({
          where: { id: productIdToDelete }
        }).catch(err => console.warn('[PRODUCT_DELETE_CLEANUP_WARN]:', err.message));
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Ürün kataloğunuzdan ve veritabanından kalıcı olarak silindi.'
    });
  } catch (error) {
    console.error('[TENANT_DELETE_PRODUCT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Ürün katalogdan ve veritabanından silinirken sunucu hatası oluştu.'
    });
  }
};

router.delete('/products/:id', handleDeleteTenantProduct);
router.delete('/catalog/:id', handleDeleteTenantProduct);

/**
 * @route   PATCH /api/tenant/products/:id & PUT /api/tenant/products/:id
 * @desc    Bayinin kataloğundaki ürünün fiyatını, stok adedini ve otomotiv parça detaylarını günceller.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
const handleUpdateTenantProduct = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const id = req.params.id;
    const { customPrice, price, stock, isDiscounted, name, productName, category, vehicleBrand, compatibleModels, partGroup, oeNumber } = req.body;

    const existing = await prisma.tenantProduct.findFirst({
      where: { id: id, tenantId: tenantId },
      include: { product: true }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Katalog parçası bulunamadı veya bayinize ait değil.'
      });
    }

    const updateData = {};
    const priceVal = customPrice !== undefined ? customPrice : price;
    if (priceVal !== undefined && priceVal !== '') {
      const parsedP = parseFloat(priceVal);
      if (!isNaN(parsedP) && parsedP >= 0) updateData.customPrice = parsedP;
    }
    if (stock !== undefined && stock !== '') {
      const parsedS = parseInt(stock, 10);
      if (!isNaN(parsedS) && parsedS >= 0) updateData.stock = parsedS;
    }
    if (isDiscounted !== undefined) {
      updateData.isDiscounted = Boolean(isDiscounted);
    }

    // Ürün tablosundaki otomotiv alanlarını da güncelle
    const productUpdates = {};
    const resolvedName = (name || productName || '').trim();
    if (resolvedName) productUpdates.name = resolvedName;
    if (category) productUpdates.category = String(category).trim();
    if (vehicleBrand !== undefined) productUpdates.vehicleBrand = vehicleBrand ? String(vehicleBrand).trim() : null;
    if (compatibleModels !== undefined) productUpdates.compatibleModels = compatibleModels ? String(compatibleModels).trim() : null;
    if (partGroup !== undefined) productUpdates.partGroup = partGroup ? String(partGroup).trim() : null;
    if (updateData.customPrice !== undefined) productUpdates.defaultPrice = updateData.customPrice;

    // Güncelleme için yeni görsel yüklendiyse uygula
    let updateImages = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      updateImages = req.files.map(f => `/uploads/${f.filename}`);
    } else if (req.file) {
      updateImages = [`/uploads/${req.file.filename}`];
    }
    if (updateImages.length > 0) {
      productUpdates.imageUrl = updateImages[0];
      productUpdates.images = JSON.stringify(updateImages);
    }

    if (Object.keys(productUpdates).length > 0 && existing.productId) {
      await prisma.product.update({
        where: { id: existing.productId },
        data: productUpdates
      });
    }

    const updated = await prisma.tenantProduct.update({
      where: { id: id },
      data: updateData,
      include: { product: true }
    });

    return res.status(200).json({
      success: true,
      message: 'Ürün bilgileri başarıyla güncellendi.',
      data: updated
    });
  } catch (error) {
    cleanupUploadedFiles(req.files);
    console.error('[TENANT_UPDATE_PRODUCT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Ürün güncellenirken sunucu hatası oluştu.'
    });
  }
};

router.patch('/products/:id', uploadProductImages, handleUpdateTenantProduct);
router.put('/products/:id', uploadProductImages, handleUpdateTenantProduct);
router.patch('/catalog/:id', uploadProductImages, handleUpdateTenantProduct);
router.put('/catalog/:id', uploadProductImages, handleUpdateTenantProduct);

// ============================================================================
// 2. OTOSERVİS / TAMİRCİ MÜŞTERİ YÖNETİMİ
// ============================================================================

/**
 * @route   POST /api/tenant/customers
 * @desc    Bayi için yeni bir tamirhane müşterisi (User + CustomerProfile) oluşturur.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.post('/customers', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const companyName = (req.body.companyName || req.body.name || req.body.servisAdi || req.body.mech_name || '').trim();
    const phone = (req.body.phone || req.body.telefon || req.body.mech_phone || '').trim();
    const address = (req.body.address || req.body.adres || req.body.mech_address || '').trim() || null;
    const discountRate = req.body.discountRate !== undefined ? req.body.discountRate : (req.body.mech_discount !== undefined ? req.body.mech_discount : (req.body.iskontoOrani !== undefined ? req.body.iskontoOrani : 0));
    const balance = req.body.balance !== undefined ? req.body.balance : (req.body.mech_balance !== undefined ? req.body.mech_balance : 0);
    const providedEmail = (req.body.email || req.body.mech_email || '').trim();
    const providedPassword = (req.body.password || req.body.mech_password || '').trim();

    if (!companyName || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen servis adı ve telefon numarasını eksiksiz giriniz.'
      });
    }

    const cleanPhone = phone.replace(/\D/g, '') || Math.floor(100000 + Math.random() * 900000);
    const cleanEmail = providedEmail
      ? providedEmail.toLowerCase().trim()
      : `servis_${cleanPhone}_${Date.now().toString(36)}@b2boto.com`;

    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: `"${cleanEmail}" e-posta adresiyle kayıtlı bir kullanıcı zaten mevcut.`
      });
    }

    const rawPassword = providedPassword || '123456';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const parsedDiscount = discountRate !== undefined ? Math.max(0, Math.min(100, parseFloat(discountRate))) : 0;
    const parsedBalance = balance !== undefined ? parseFloat(balance) : 0;

    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: cleanEmail,
          password: hashedPassword,
          role: 'CUSTOMER',
          tenantId: tenantId
        }
      });

      const newProfile = await tx.customerProfile.create({
        data: {
          userId: newUser.id,
          tenantId: tenantId,
          companyName: companyName,
          phone: phone,
          address: address,
          discountRate: parsedDiscount,
          balance: parsedBalance,
          currentBalance: parsedBalance
        }
      });

      return { user: newUser, profile: newProfile };
    });

    return res.status(201).json({
      success: true,
      message: `"${result.profile.companyName}" servisi bayinize başarıyla kaydedildi.`,
      data: {
        id: result.profile.id,
        userId: result.user.id,
        email: result.user.email,
        companyName: result.profile.companyName,
        phone: result.profile.phone,
        address: result.profile.address,
        discountRate: result.profile.discountRate,
        balance: result.profile.balance,
        currentBalance: result.profile.currentBalance
      }
    });

  } catch (error) {
    console.error('[TENANT_CREATE_CUSTOMER_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Müşteri kaydı sırasında sunucu hatası oluştu.'
    });
  }
});

/**
 * @route   GET /api/tenant/customers
 * @desc    Bayiye ait tüm otoservis müşterilerini listeler.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.get('/customers', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const customers = await prisma.customerProfile.findMany({
      where: { tenantId: tenantId },
      include: {
        user: {
          select: { id: true, email: true, createdAt: true }
        },
        _count: {
          select: { orders: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: customers.length,
      data: customers
    });

  } catch (error) {
    console.error('[TENANT_GET_CUSTOMERS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Müşteriler listelenirken sunucu hatası oluştu.'
    });
  }
});

/**
 * @route   PATCH /api/tenant/customers/:id
 * @desc    Müşterinin iskonto oranını günceller veya cari tahsilat / borç kaydeder.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.patch('/customers/:id', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const customerId = req.params.id;
    const { discountRate, collectAmount, addDebtAmount, phone, companyName } = req.body;

    const customer = await prisma.customerProfile.findFirst({
      where: { id: customerId, tenantId: tenantId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı veya bayinize ait değil.'
      });
    }

    const updateData = {};
    if (discountRate !== undefined) {
      updateData.discountRate = Math.max(0, Math.min(100, parseFloat(discountRate)));
    }
    if (phone) updateData.phone = phone.trim();
    if (companyName) updateData.companyName = companyName.trim();

    let ledgerEntry = null;
    const currentBalance = parseFloat(customer.balance) || 0;

    if (collectAmount !== undefined) {
      const parsedCollect = parseFloat(collectAmount);
      if (!isNaN(parsedCollect) && parsedCollect > 0) {
        const newBalance = parseFloat((currentBalance - parsedCollect).toFixed(2));
        updateData.balance = newBalance;
        updateData.currentBalance = newBalance;
        ledgerEntry = {
          type: 'CREDIT',
          amount: parsedCollect,
          balanceAfter: newBalance,
          description: `Tahsilat alındı: ${parsedCollect.toLocaleString('tr-TR')} ₺`
        };
      }
    } else if (addDebtAmount !== undefined) {
      const parsedDebt = parseFloat(addDebtAmount);
      if (!isNaN(parsedDebt) && parsedDebt > 0) {
        const newBalance = parseFloat((currentBalance + parsedDebt).toFixed(2));
        updateData.balance = newBalance;
        updateData.currentBalance = newBalance;
        ledgerEntry = {
          type: 'DEBIT',
          amount: parsedDebt,
          balanceAfter: newBalance,
          description: `Manuel borç eklendi: ${parsedDebt.toLocaleString('tr-TR')} ₺`
        };
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const cust = await tx.customerProfile.update({
        where: { id: customerId },
        data: updateData
      });

      if (ledgerEntry) {
        await tx.customerLedger.create({
          data: {
            tenantId: tenantId,
            customerId: customer.id,
            type: ledgerEntry.type,
            amount: ledgerEntry.amount,
            balanceAfter: ledgerEntry.balanceAfter,
            description: ledgerEntry.description
          }
        });
      }

      return cust;
    });

    return res.status(200).json({
      success: true,
      message: `"${updated.companyName}" bilgileri başarıyla güncellendi.`,
      data: updated
    });

  } catch (error) {
    console.error('[TENANT_UPDATE_CUSTOMER_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Müşteri güncellenirken sunucu hatası oluştu.'
    });
  }
});

/**
 * @route   POST /api/tenant/customers/:id/payment
 * @desc    Tahsilat: Gelen amount değerini müşterinin currentBalance değerinden düşer.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.post('/customers/:id/payment', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const customerId = req.params.id;
    const rawAmount = req.body.amount !== undefined ? req.body.amount : req.body.collectAmount;
    const amount = parseFloat(rawAmount);

    if (isNaN(amount) || amount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen geçerli bir tahsilat veya işlem tutarı giriniz (0 olamaz).'
      });
    }

    const customer = await prisma.customerProfile.findFirst({
      where: { id: customerId, tenantId: tenantId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı veya bayinize ait değil.'
      });
    }

    const prevBalance = parseFloat(customer.currentBalance !== undefined ? customer.currentBalance : customer.balance) || 0;
    // Prompt 3. ADIM: gelen amount değerinin veritabanındaki currentBalance alanına basit bir toplama işlemi (currentBalance + amount) ile eklenmesi
    const newBalance = parseFloat((prevBalance + amount).toFixed(2));

    const updated = await prisma.$transaction(async (tx) => {
      const cust = await tx.customerProfile.update({
        where: { id: customerId },
        data: {
          currentBalance: newBalance,
          balance: newBalance
        }
      });

      await tx.customerLedger.create({
        data: {
          tenantId: tenantId,
          customerId: customer.id,
          type: amount >= 0 ? 'CREDIT' : 'DEBIT',
          amount: Math.abs(amount),
          balanceAfter: newBalance,
          description: req.body.description || `Tahsilat/Bakiye İşlemi: ${amount >= 0 ? '+' : ''}${amount.toLocaleString('tr-TR')} ₺`
        }
      });

      return cust;
    });

    return res.status(200).json({
      success: true,
      message: `Tahsilat başarıyla kaydedildi. "${updated.companyName}" yeni bakiyesi: ${newBalance.toLocaleString('tr-TR')} ₺`,
      data: {
        customerId: updated.id,
        amount: amount,
        amountPaid: amount,
        newBalance: updated.currentBalance,
        currentBalance: updated.currentBalance,
        balance: updated.balance
      }
    });
  } catch (error) {
    console.error('[TENANT_CUSTOMER_PAYMENT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Tahsilat işlenirken sunucu hatası oluştu.'
    });
  }
});

/**
 * @route   PATCH /api/tenant/customers/:id/discount
 * @desc    İskonto Güncelle: Gelen discountRate değerini veritabanında günceller.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.patch('/customers/:id/discount', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const customerId = req.params.id;
    const rawRate = req.body.discountRate !== undefined ? req.body.discountRate : req.body.rate;
    const parsedRate = Math.max(0, Math.min(100, parseFloat(rawRate)));

    if (isNaN(parsedRate)) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen geçerli bir iskonto oranı giriniz (0 - 100).'
      });
    }

    const customer = await prisma.customerProfile.findFirst({
      where: { id: customerId, tenantId: tenantId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı veya bayinize ait değil.'
      });
    }

    const updated = await prisma.customerProfile.update({
      where: { id: customerId },
      data: { discountRate: parsedRate }
    });

    return res.status(200).json({
      success: true,
      message: `"${updated.companyName}" iskonto oranı %${parsedRate} olarak güncellendi.`,
      data: {
        customerId: updated.id,
        discountRate: updated.discountRate
      }
    });
  } catch (error) {
    console.error('[TENANT_CUSTOMER_DISCOUNT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'İskonto oranı güncellenirken sunucu hatası oluştu.'
    });
  }
});

/**
 * @route   PUT /api/tenant/customers/:id
 * @desc    Müşteri Güncelle: Gelen form verileriyle müşteriyi günceller.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.put('/customers/:id', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const customerId = req.params.id;
    const customer = await prisma.customerProfile.findFirst({
      where: { id: customerId, tenantId: tenantId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı veya bayinize ait değil.'
      });
    }

    const companyName = (req.body.companyName || req.body.name || req.body.servisAdi || req.body.ad);
    const phone = (req.body.phone || req.body.telefon);
    const address = (req.body.address || req.body.adres);
    const discountRate = req.body.discountRate !== undefined ? req.body.discountRate : req.body.iskontoOrani;
    const currentBalance = req.body.currentBalance !== undefined ? req.body.currentBalance : req.body.balance;

    const updateData = {};
    if (companyName) updateData.companyName = companyName.trim();
    if (phone) updateData.phone = phone.trim();
    if (address !== undefined) updateData.address = address ? address.trim() : null;
    if (discountRate !== undefined) {
      const parsedRate = Math.max(0, Math.min(100, parseFloat(discountRate)));
      if (!isNaN(parsedRate)) updateData.discountRate = parsedRate;
    }
    if (currentBalance !== undefined) {
      const parsedBal = parseFloat(currentBalance);
      if (!isNaN(parsedBal)) {
        updateData.currentBalance = parsedBal;
        updateData.balance = parsedBal;
      }
    }

    const updated = await prisma.customerProfile.update({
      where: { id: customerId },
      data: updateData
    });

    return res.status(200).json({
      success: true,
      message: `"${updated.companyName}" bilgileri başarıyla güncellendi.`,
      data: updated
    });
  } catch (error) {
    console.error('[TENANT_PUT_CUSTOMER_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Müşteri bilgileri güncellenirken sunucu hatası oluştu.'
    });
  }
});

/**
 * @route   DELETE /api/tenant/customers/:id
 * @desc    Müşteri Sil: Verilen ID'ye sahip müşteriyi ve bağlı ilişkilerini kalıcı olarak siler.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.delete('/customers/:id', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const rawId = req.params.id;
    const customerId = String(rawId);

    // Müşteriyi ID ve tenantId ile bul (3. ADIM: IDOR Koruması & Tenant Sahiplik Kontrolü)
    const whereClause = { id: customerId };
    if (req.user.role !== 'SUPER_ADMIN') {
      whereClause.tenantId = tenantId;
    }

    const customer = await prisma.customerProfile.findFirst({
      where: whereClause
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı veya bayinize ait değil.'
      });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Müşterinin siparişlerinin kalemlerini ve hareketlerini sil (Cascade)
      const customerOrders = await tx.order.findMany({
        where: { customerId: customerId },
        select: { id: true }
      });
      const orderIds = customerOrders.map(o => o.id);

      if (orderIds.length > 0) {
        await tx.orderItem.deleteMany({
          where: { orderId: { in: orderIds } }
        });
        await tx.stockMovement.deleteMany({
          where: { orderId: { in: orderIds } }
        });
        await tx.order.deleteMany({
          where: { id: { in: orderIds } }
        });
      }

      // 2. Müşteri cari hareketlerini sil
      await tx.customerLedger.deleteMany({
        where: { customerId: customerId }
      });

      // 3. Müşteri profilini sil
      await tx.customerProfile.delete({
        where: { id: customerId }
      });

      // 4. Bağlı kullanıcı hesabını temizle
      if (customer.userId) {
        await tx.user.deleteMany({
          where: { id: customer.userId, role: 'CUSTOMER' }
        });
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Müşteri silindi'
    });
  } catch (error) {
    console.error('[TENANT_DELETE_CUSTOMER_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Müşteri silinirken sunucu hatası oluştu.'
    });
  }
});

// ============================================================================
// 3. BAYİ DASHBOARD İSTATİSTİKLERİ VE SİPARİŞ YÖNETİMİ
// ============================================================================

/**
 * @route   GET /api/tenant/dashboard-stats & GET /api/tenant/stats
 * @desc    Bayi dashboard KPI istatistiklerini ve son 5 siparişi döner.
 *          { success: true, data: { pendingCount, todayRevenue, customerCount, recentOrders } }
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
const handleGetTenantStats = async (req, res) => {
  try {
    // 3. ADIM: Dashboard KPI sayaçlarının önbellekte (cache) takılı kalmasını engelle
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    // 1. pendingCount: status: 'PENDING_APPROVAL' veya 'PENDING' olan siparişlerin sayısı
    const pendingCount = await prisma.order.count({
      where: {
        tenantId: tenantId,
        status: { in: ['PENDING_APPROVAL', 'PENDING', 'Ödeme Bekliyor'] }
      }
    });

    // 2. todayRevenue: Sadece bugünün tarihine ait olan (ve iptal/red edilmemiş) siparişlerin totalAmount toplamı
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const revenueAgg = await prisma.order.aggregate({
      where: {
        tenantId: tenantId,
        createdAt: { gte: todayStart, lte: todayEnd },
        status: { notIn: ['CANCELLED', 'REJECTED'] }
      },
      _sum: { totalAmount: true }
    });
    const todayRevenue = revenueAgg._sum.totalAmount || 0.0;

    // 3. customerCount: Bu bayiye bağlı müşteri/otoservis sayısı
    const customerCount = await prisma.customerProfile.count({
      where: { tenantId: tenantId }
    });

    // 4. recentOrders: En son gelen 5 siparişi createdAt'e göre azalan (desc) şekilde getir, customer ilişkisini de dahil et
    const recentOrders = await prisma.order.findMany({
      where: { tenantId: tenantId },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: {
            id: true,
            companyName: true,
            phone: true,
            address: true,
            city: true,
            district: true,
            discountRate: true,
            balance: true
          }
        },
        items: {
          include: {
            tenantProduct: {
              include: {
                product: {
                  select: {
                    id: true,
                    oeNumber: true,
                    name: true,
                    category: true,
                    imageUrl: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // Her kalem için ürün detayını (product) doğrudan bağla
    const formattedRecentOrders = recentOrders.map(order => ({
      ...order,
      items: (order.items || []).map(item => ({
        ...item,
        product: item.tenantProduct?.product || null
      }))
    }));

    // Toplam sipariş sayısı (ekstra metrik)
    const totalOrders = await prisma.order.count({
      where: { tenantId: tenantId }
    });

    // Sonuçları JSON olarak dön
    return res.status(200).json({
      success: true,
      data: {
        pendingCount,
        todayRevenue,
        customerCount,
        recentOrders: formattedRecentOrders,
        // Geriye dönük uyumluluk aliasları
        pendingOrders: pendingCount,
        registeredCustomers: customerCount,
        totalOrders
      }
    });
  } catch (error) {
    console.error('[TENANT_GET_DASHBOARD_STATS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Bayi dashboard istatistikleri alınırken sunucu hatası oluştu.'
    });
  }
};

router.get('/dashboard-stats', handleGetTenantStats);
router.get('/stats', handleGetTenantStats);

/**
 * @route   GET /api/tenant/orders
 * @desc    Bayiye gelen siparişleri listeler.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.get('/orders', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const whereClause = { tenantId: tenantId };
    if (req.query.status && req.query.status !== 'ALL') {
      whereClause.status = req.query.status;
    }
    if (req.query.search) {
      const q = req.query.search.trim();
      whereClause.OR = [
        { orderNumber: { contains: q } },
        { customer: { companyName: { contains: q } } }
      ];
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        customer: {
          select: {
            id: true,
            companyName: true,
            phone: true,
            address: true,
            city: true,
            district: true,
            discountRate: true,
            balance: true
          }
        },
        items: {
          include: {
            tenantProduct: {
              include: {
                product: {
                  select: {
                    id: true,
                    oeNumber: true,
                    name: true,
                    category: true,
                    vehicleBrand: true,
                    compatibleModels: true,
                    partGroup: true,
                    imageUrl: true,
                    images: true,
                    defaultPrice: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Her kalem için ürün detayını (product) doğrudan bağla
    const formattedOrders = orders.map(order => ({
      ...order,
      items: (order.items || []).map(item => ({
        ...item,
        product: item.tenantProduct?.product || null
      }))
    }));

    return res.status(200).json({
      success: true,
      count: formattedOrders.length,
      data: formattedOrders
    });

  } catch (error) {
    console.error('[TENANT_GET_ORDERS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Siparişler listelenirken hata oluştu.'
    });
  }
});

/**
 * @route   GET /api/tenant/orders/:id
 * @desc    Seçilen siparişin detaylarını ve ürün kalemlerini döner.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.get('/orders/:id', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const orderId = req.params.id;
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId: tenantId },
      include: {
        customer: true,
        items: {
          include: {
            tenantProduct: {
              include: {
                product: {
                  select: {
                    id: true,
                    oeNumber: true,
                    name: true,
                    category: true,
                    vehicleBrand: true,
                    compatibleModels: true,
                    partGroup: true,
                    imageUrl: true,
                    images: true,
                    defaultPrice: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Sipariş bulunamadı veya bayinize ait değil.'
      });
    }

    const formattedOrder = {
      ...order,
      items: (order.items || []).map(item => ({
        ...item,
        product: item.tenantProduct?.product || null
      }))
    };

    return res.status(200).json({
      success: true,
      data: formattedOrder
    });
  } catch (error) {
    console.error('[TENANT_GET_ORDER_DETAIL_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Sipariş detayı alınırken sunucu hatası oluştu.'
    });
  }
});

/**
 * @route   PUT /api/tenant/orders/:id/status & PATCH /api/tenant/orders/:id/status
 * @desc    Gelen siparişin durumunu günceller (PENDING_APPROVAL -> PROCESSING veya REJECTED).
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
const updateOrderStatus = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const orderId = req.params.id;
    const { status } = req.body;
    const rejectionReason = (req.body.rejectionReason || req.body.reason || '').trim();
    const cargoCompany = (req.body.cargoCompany || req.body.kargoFirmasi || req.body.cargo || '').trim();
    const trackingNumber = (req.body.trackingNumber || req.body.takipNumarasi || req.body.cargoTrackingNumber || '').trim();

    const validStatuses = [
      'PENDING_APPROVAL',
      'PROCESSING',
      'REJECTED',
      'PENDING',
      'APPROVED',
      'SHIPPED',
      'DELIVERED',
      'Teslim Edildi',
      'COMPLETED',
      'CANCELLED',
      'RETURNED',
      'Hazırlanıyor',
      'Ödeme Bekliyor'
    ];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Geçersiz sipariş durumu. Kabul edilen değerler: ${validStatuses.join(', ')}`
      });
    }

    const existingOrder = await prisma.order.findFirst({
      where: { id: orderId, tenantId: tenantId },
      include: {
        items: true,
        customer: true
      }
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: 'Güncellenmek istenen sipariş bulunamadı veya bayinize ait değil.'
      });
    }

    // Ret Durumu (REJECTED): Eğer sipariş daha önce reddedilmemişse, stok ve cari bakiye iade edilir
    if (status === 'REJECTED') {
      const finalRejectionReason = rejectionReason || 'Bayi tarafından ret edildi (Sebep belirtilmedi).';

      const updatedOrder = await prisma.$transaction(async (tx) => {
        // 1. Siparişi REJECTED ve rejectionReason ile güncelle
        const ord = await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'REJECTED',
            rejectionReason: finalRejectionReason
          },
          include: {
            customer: {
              select: { companyName: true, phone: true }
            },
            items: true
          }
        });

        // 2. Eğer daha önce iptal edilmemişse stokları geri yükle ve cari bakiyeyi düzelt
        if (existingOrder.status !== 'REJECTED' && existingOrder.status !== 'CANCELLED') {
          // A. Stokları geri yükle
          for (const item of (existingOrder.items || [])) {
            await tx.tenantProduct.update({
              where: { id: item.tenantProductId },
              data: {
                stock: { increment: item.quantity }
              }
            });

            await tx.stockMovement.create({
              data: {
                tenantId: tenantId,
                tenantProductId: item.tenantProductId,
                orderId: existingOrder.id,
                quantityChange: item.quantity,
                type: 'RETURN',
                note: `Sipariş #${existingOrder.orderNumber} ret edildiği için stok iadesi yapıldı. Sebep: ${finalRejectionReason}`
              }
            });
          }

          // B. Cari hesaba yazılmış borcu iptal et / kredilendir
          if (existingOrder.customer && existingOrder.totalAmount > 0) {
            const currentBal = parseFloat(existingOrder.customer.balance) || 0;
            const newBal = parseFloat(Math.max(0, currentBal - existingOrder.totalAmount).toFixed(2));

            await tx.customerProfile.update({
              where: { id: existingOrder.customerId },
              data: {
                balance: newBal
              }
            });

            await tx.customerLedger.create({
              data: {
                tenantId: tenantId,
                customerId: existingOrder.customerId,
                type: 'CREDIT',
                amount: existingOrder.totalAmount,
                balanceAfter: newBal,
                description: `Sipariş #${existingOrder.orderNumber} iptali / ret sebebiyle cari bakiye iadesi`
              }
            });
          }
        }

        return ord;
      });

      return res.status(200).json({
        success: true,
        message: `Sipariş #${updatedOrder.orderNumber || updatedOrder.id} başarıyla reddedildi ve iptal edildi.`,
        data: updatedOrder
      });
    }

    // Diğer Durumlar (PROCESSING, APPROVED, SHIPPED, DELIVERED vb.)
    const updateData = { status: status };
    if (rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }
    if (cargoCompany) {
      updateData.cargoCompany = cargoCompany;
    }
    if (trackingNumber) {
      updateData.trackingNumber = trackingNumber;
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        customer: {
          select: { companyName: true, phone: true }
        },
        items: true
      }
    });

    const statusLabel = status === 'PROCESSING' ? 'Hazırlanıyor' : (status === 'APPROVED' ? 'Onaylandı' : (status === 'SHIPPED' ? 'Kargolandı' : status));
    let successMessage = `Sipariş #${updatedOrder.orderNumber || updatedOrder.id} durumu "${statusLabel}" olarak güncellendi.`;
    if (status === 'SHIPPED' && (updatedOrder.cargoCompany || updatedOrder.trackingNumber)) {
      const cargoDetail = [updatedOrder.cargoCompany, updatedOrder.trackingNumber].filter(Boolean).join(' - ');
      successMessage = `Sipariş #${updatedOrder.orderNumber || updatedOrder.id} kargoya verildi (${cargoDetail}).`;
    }

    return res.status(200).json({
      success: true,
      message: successMessage,
      data: updatedOrder
    });

  } catch (error) {
    console.error('[TENANT_UPDATE_ORDER_STATUS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Sipariş durumu güncellenirken sunucu hatası oluştu.'
    });
  }
};

router.put('/orders/:id/status', updateOrderStatus);
router.patch('/orders/:id/status', updateOrderStatus);

// ============================================================================
// 4. DENETİM VE GEÇMİŞ HAREKET DEFTERLERİ (AUDIT LOGS)
// ============================================================================

/**
 * @route   GET /api/tenant/customers/:id/ledger
 * @desc    Seçilen müşterinin cari hesap hareketlerini (borç, tahsilat) listeler.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.get('/customers/:id/ledger', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const customerId = req.params.id;
    const customer = await prisma.customerProfile.findFirst({
      where: { id: customerId, tenantId: tenantId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri bulunamadı veya bayinize ait değil.'
      });
    }

    const ledgers = await prisma.customerLedger.findMany({
      where: { customerId: customerId, tenantId: tenantId },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      customer: {
        id: customer.id,
        companyName: customer.companyName,
        currentBalance: `${parseFloat(customer.balance).toLocaleString('tr-TR')} ₺`
      },
      count: ledgers.length,
      data: ledgers
    });

  } catch (error) {
    console.error('[TENANT_GET_CUSTOMER_LEDGER_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Müşteri cari defteri alınırken hata oluştu.'
    });
  }
});

/**
 * @route   GET /api/tenant/stock-movements
 * @desc    Bayinin stok giriş-çıkış ve satış denetim loglarını listeler.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.get('/stock-movements', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const movements = await prisma.stockMovement.findMany({
      where: { tenantId: tenantId },
      include: {
        tenantProduct: {
          include: {
            product: {
              select: {
                id: true,
                oeNumber: true,
                name: true,
                category: true
              }
            }
          }
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return res.status(200).json({
      success: true,
      count: movements.length,
      data: movements
    });

  } catch (error) {
    console.error('[TENANT_GET_STOCK_MOVEMENTS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Stok hareketleri listelenirken hata oluştu.'
    });
  }
});

// ============================================================================
// 5. FİYAT VE İSKONTO YÖNETİMİ
// ============================================================================

/**
 * @route   GET /api/tenant/discounts
 * @desc    Bayinin tanımladığı iskonto kurallarını (DiscountRule) ve müşteri iskonto oranlarını döner.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.get('/discounts', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    // 1. DiscountRule tablosundan bayiye ait kuralları çek
    let rules = [];
    try {
      rules = await prisma.discountRule.findMany({
        where: { tenantId: String(tenantId) },
        orderBy: { createdAt: 'desc' }
      });
    } catch (dbErr) {
      console.warn('[TENANT_GET_DISCOUNTS_RULES_WARN]:', dbErr.message);
      rules = [];
    }

    // 2. Müşteri profillerini ve ortalama iskonto oranını hesapla
    const customers = await prisma.customerProfile.findMany({
      where: { tenantId: tenantId },
      select: {
        id: true,
        companyName: true,
        phone: true,
        discountRate: true,
        balance: true,
        createdAt: true,
        user: { select: { email: true } }
      },
      orderBy: { discountRate: 'desc' }
    });

    const avgDiscount = customers.length > 0
      ? (customers.reduce((acc, c) => acc + (c.discountRate || 0), 0) / customers.length).toFixed(1)
      : '0.0';

    return res.status(200).json({
      success: true,
      data: {
        rules: rules,
        discountRules: rules,
        customers,
        customerDiscounts: customers,
        totalCustomers: customers.length,
        averageDiscount: parseFloat(avgDiscount) || 0,
        globalDiscountRate: 20.0
      }
    });
  } catch (error) {
    console.error('[TENANT_GET_DISCOUNTS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'İskonto kuralları alınırken sunucu hatası oluştu.'
    });
  }
});

/**
 * @route   POST /api/tenant/discounts
 * @desc    Yeni bir iskonto kuralı (DiscountRule) kaydeder veya müşterilere iskonto tanımlar.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.post('/discounts', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const { ruleName, targetCust, category, rate, customerId, target, discountRate, globalDiscountRate, disc_name, disc_target, disc_category, disc_rate } = req.body;

    // 1. KURAL OLUŞTURMA AKIŞI (Prompt 4. ADIM: ruleName, targetCust, category, rate)
    const effectiveRuleName = (ruleName || disc_name || req.body.name || req.body.kuralAdi || '').trim();
    if (effectiveRuleName || targetCust || disc_target) {
      const effectiveTarget = (targetCust || disc_target || req.body.hedefMusteri || 'Tüm Müşteriler').trim();
      const effectiveCategory = (category || disc_category || req.body.kategori || 'Tüm Kategoriler').trim();
      const rawRate = rate !== undefined ? rate : (disc_rate !== undefined ? disc_rate : discountRate);
      const parsedRate = Math.max(0, Math.min(100, parseFloat(rawRate) || 0));

      const newRule = await prisma.discountRule.create({
        data: {
          tenantId: String(tenantId),
          ruleName: effectiveRuleName || 'Yeni İskonto Kuralı',
          targetCust: effectiveTarget,
          category: effectiveCategory,
          rate: parsedRate,
          isActive: true
        }
      });

      return res.status(201).json({
        success: true,
        message: 'İskonto kuralı başarıyla oluşturuldu.',
        data: newRule
      });
    }

    // 2. MÜŞTERİ BAZLI VEYA GENEL İSKONTO TANIMLAMA (Geriye Dönük Uyumluluk)
    const rawCustomerRate = discountRate !== undefined ? discountRate : globalDiscountRate;
    const parsedCustomerRate = Math.max(0, Math.min(100, parseFloat(rawCustomerRate)));
    if (isNaN(parsedCustomerRate)) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen geçerli bir iskonto oranı giriniz (0 - 100).'
      });
    }

    if (customerId && customerId !== 'ALL') {
      const customer = await prisma.customerProfile.findFirst({
        where: { id: customerId, tenantId: tenantId }
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Müşteri profili bulunamadı veya bayinize ait değil.'
        });
      }

      const updated = await prisma.customerProfile.update({
        where: { id: customerId },
        data: { discountRate: parsedCustomerRate }
      });

      return res.status(200).json({
        success: true,
        message: `"${updated.companyName}" iskonto oranı %${parsedCustomerRate} olarak güncellendi.`,
        data: { customer: updated, customerId, discountRate: parsedCustomerRate }
      });
    } else {
      const result = await prisma.customerProfile.updateMany({
        where: { tenantId: tenantId },
        data: { discountRate: parsedCustomerRate }
      });

      return res.status(200).json({
        success: true,
        message: `Tüm kayıtlı servislere (%${parsedCustomerRate}) iskonto oranı başarıyla tanımlandı (${result.count} müşteri güncellendi).`,
        data: { updatedCount: result.count, globalDiscountRate: parsedCustomerRate, discountRate: parsedCustomerRate }
      });
    }
  } catch (error) {
    console.error('[TENANT_SET_DISCOUNT_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'İskonto kuralı kaydedilirken sunucu hatası oluştu.'
    });
  }
});

/**
 * @route   DELETE /api/tenant/discounts/:id
 * @desc    İskonto kuralını veritabanından kalıcı olarak siler (Prompt 4. ADIM).
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.delete('/discounts/:id', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const ruleId = parseInt(req.params.id, 10);
    if (isNaN(ruleId)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz iskonto kuralı kimliği.'
      });
    }

    const existingRule = await prisma.discountRule.findFirst({
      where: { id: ruleId, tenantId: String(tenantId) }
    });

    if (!existingRule) {
      return res.status(404).json({
        success: false,
        message: 'İskonto kuralı bulunamadı veya bayinize ait değil.'
      });
    }

    await prisma.discountRule.delete({
      where: { id: ruleId }
    });

    return res.status(200).json({
      success: true,
      message: 'İskonto kuralı silindi'
    });
  } catch (error) {
    console.error('[TENANT_DELETE_DISCOUNT_RULE_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'İskonto kuralı silinirken sunucu hatası oluştu.'
    });
  }
});

// ============================================================================
// 6. İADE YÖNETİMİ (RMA) ROTALARI - Bayi Paneli (Prompt 2. ADIM)
// ============================================================================

/**
 * @route   GET /api/tenant/returns
 * @desc    Bayiye gelen tüm iade taleplerini (ReturnRequest) listeler.
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
router.get('/returns', async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const { status, search } = req.query;
    const whereCondition = { tenantId: tenantId };

    if (status && status !== 'ALL') {
      if (status === 'PENDING') {
        whereCondition.status = { in: ['Bekliyor', 'PENDING'] };
      } else if (status === 'APPROVED') {
        whereCondition.status = { in: ['Onaylandı', 'APPROVED'] };
      } else if (status === 'REJECTED') {
        whereCondition.status = { in: ['Reddedildi', 'REJECTED'] };
      } else {
        whereCondition.status = status;
      }
    }

    if (search) {
      const q = String(search).trim();
      whereCondition.OR = [
        { order: { orderNumber: { contains: q } } },
        { customer: { companyName: { contains: q } } },
        { reason: { contains: q } }
      ];
    }

    const returns = await prisma.returnRequest.findMany({
      where: whereCondition,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            status: true,
            createdAt: true,
            items: {
              include: {
                tenantProduct: {
                  include: {
                    product: {
                      select: {
                        id: true,
                        oeNumber: true,
                        name: true,
                        category: true,
                        imageUrl: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        customer: {
          select: {
            id: true,
            companyName: true,
            phone: true,
            discountRate: true,
            balance: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const pendingCount = await prisma.returnRequest.count({
      where: {
        tenantId: tenantId,
        status: { in: ['Bekliyor', 'PENDING'] }
      }
    });

    return res.status(200).json({
      success: true,
      count: returns.length,
      pendingCount: pendingCount,
      data: returns
    });

  } catch (error) {
    console.error('[TENANT_GET_RETURNS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'İade talepleri listelenirken hata oluştu.'
    });
  }
});

/**
 * @route   PUT /api/tenant/returns/:id/status & PATCH /api/tenant/returns/:id/status & PUT /api/tenant/returns/:id
 * @desc    Bayi iade talebini onaylar veya reddeder.
 *          Kritik Stok Mantığı: İade onaylanırsa (APPROVED), siparişteki kalemlerin
 *          stok miktarları veritabanında iade edilen adet kadar geri artırılır (Stoka iade girişi).
 * @access  Protected (TENANT_ADMIN - İlgili Bayi)
 */
const handleUpdateReturnStatus = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req, res);
    if (!tenantId) return;

    const returnId = req.params.id;
    const { status, adminNote, note, rejectionReason } = req.body;
    const finalNote = (adminNote || note || rejectionReason || '').trim();

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen yeni iade durumunu belirtiniz (Onayla veya Reddet).'
      });
    }

    const isApprove = status === 'APPROVED' || status === 'Onaylandı' || status === 'ONAYLA' || status === 'ONAYLANDI';
    const isReject = status === 'REJECTED' || status === 'Reddedildi' || status === 'REDDET' || status === 'REDDEDILDI';

    if (!isApprove && !isReject) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz iade durumu. Kabul edilen değerler: APPROVED (Onaylandı) veya REJECTED (Reddedildi).'
      });
    }

    // 1. İade talebini bul ve bayiye ait olduğunu doğrula (IDOR koruması)
    const existingReturn = await prisma.returnRequest.findFirst({
      where: {
        id: returnId,
        tenantId: tenantId
      },
      include: {
        order: {
          include: {
            items: true
          }
        },
        customer: true
      }
    });

    if (!existingReturn) {
      return res.status(404).json({
        success: false,
        message: 'İade talebi bulunamadı veya bayinize ait değil.'
      });
    }

    // Eğer zaten sonuçlandırılmışsa uyar
    const currentStatus = existingReturn.status;
    if (currentStatus === 'Onaylandı' || currentStatus === 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Bu iade talebi zaten onaylanmış ve stok girişi yapılmıştır.'
      });
    }

    // 2. İADE ONAYLAMA AKIŞI (Stok Geri Yükleme + Stok Hareketi + Cari Düzenleme)
    if (isApprove) {
      const updatedReturn = await prisma.$transaction(async (tx) => {
        // A. İade talebi statüsünü güncelle
        const ret = await tx.returnRequest.update({
          where: { id: returnId },
          data: {
            status: 'Onaylandı',
            adminNote: finalNote || 'İade onaylandı, ürünler stoka geri alındı.'
          }
        });

        // B. Kritik Stok Mantığı: Siparişteki her kalemi bul ve stok miktarlarını geri artır (Stoka iade girişi)
        const orderItems = existingReturn.order?.items || [];
        for (const item of orderItems) {
          await tx.tenantProduct.update({
            where: { id: item.tenantProductId },
            data: {
              stock: { increment: item.quantity }
            }
          });

          // Stok Denetim Defterine (StockMovement) RETURN kaydı yaz
          await tx.stockMovement.create({
            data: {
              tenantId: tenantId,
              tenantProductId: item.tenantProductId,
              orderId: existingReturn.orderId,
              quantityChange: item.quantity,
              type: 'RETURN',
              note: `İade Talebi Onaylandı (#${existingReturn.order.orderNumber}): +${item.quantity} adet stoka iade girişi yapıldı.`
            }
          });
        }

        // C. Müşteri cari bakiyesinden sipariş bedelini düşerek alacak kaydı oluştur (CustomerLedger)
        if (existingReturn.customer && existingReturn.order.totalAmount > 0) {
          const prevBalance = parseFloat(existingReturn.customer.balance) || 0;
          const newBalance = parseFloat(Math.max(0, prevBalance - existingReturn.order.totalAmount).toFixed(2));

          await tx.customerProfile.update({
            where: { id: existingReturn.customerId },
            data: {
              balance: newBalance,
              currentBalance: newBalance
            }
          });

          await tx.customerLedger.create({
            data: {
              tenantId: tenantId,
              customerId: existingReturn.customerId,
              type: 'CREDIT',
              amount: existingReturn.order.totalAmount,
              balanceAfter: newBalance,
              description: `İade Onayı (#${existingReturn.order.orderNumber}): Ürünler iade alındı ve cari hesaba alacak işlendi.`
            }
          });
        }

        // D. Sipariş durumunu güncelle
        await tx.order.update({
          where: { id: existingReturn.orderId },
          data: {
            status: 'RETURNED'
          }
        });

        return ret;
      });

      return res.status(200).json({
        success: true,
        message: `İade talebi başarıyla onaylandı. #${existingReturn.order.orderNumber} siparişindeki parçalar stoka geri eklendi.`,
        data: updatedReturn
      });
    }

    // 3. İADE REDDETME AKIŞI
    if (isReject) {
      const updatedReturn = await prisma.returnRequest.update({
        where: { id: returnId },
        data: {
          status: 'Reddedildi',
          adminNote: finalNote || 'İade talebi bayi tarafından reddedildi.'
        }
      });

      return res.status(200).json({
        success: true,
        message: `İade talebi reddedildi. Müşteriye bildirim iletildi.`,
        data: updatedReturn
      });
    }

  } catch (error) {
    console.error('[TENANT_UPDATE_RETURN_STATUS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'İade talebi durumu güncellenirken sunucu hatası oluştu.'
    });
  }
};

router.put('/returns/:id/status', handleUpdateReturnStatus);
router.patch('/returns/:id/status', handleUpdateReturnStatus);
router.put('/returns/:id', handleUpdateReturnStatus);

module.exports = router;

