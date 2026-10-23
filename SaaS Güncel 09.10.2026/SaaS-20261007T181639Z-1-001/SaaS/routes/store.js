// ============================================================================
// Multi-Tenant B2B SaaS - B2B Vitrin API Rotaları (routes/store.js)
// Yalnızca CUSTOMER (Otoservis / Tamirhane) rolünün erişimine açıktır.
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const config = require('../config');
const { verifyToken, checkCustomer } = require('../middleware/auth');

const jwt = require('jsonwebtoken');

// Helper: Dinamik Tenant / Bayi Çözümleme (Subdomain, X-Tenant-Slug veya Query Parametrelerinden)
const resolveTargetTenant = async (req, fallbackTenantId = null) => {
  let slug = req.headers['x-tenant-slug'] || req.query.tenant || req.query.subdomain;
  if (slug && typeof slug === 'string') {
    slug = slug.trim().toLowerCase();
  }

  let tenant = null;
  if (slug) {
    tenant = await prisma.tenant.findUnique({
      where: { subdomain: slug }
    });
  }

  if (!tenant && fallbackTenantId) {
    tenant = await prisma.tenant.findUnique({
      where: { id: fallbackTenantId }
    });
  }

  if (!tenant) {
    tenant = await prisma.tenant.findUnique({
      where: { subdomain: 'ahmetoto' }
    });
  }

  if (!tenant) {
    tenant = await prisma.tenant.findFirst({
      where: { isActive: true }
    });
  }

  return tenant;
};

// ============================================================================
// 0. GET /api/store/bank-info - Havale / EFT için Bayi Banka ve IBAN Bilgileri
// (Genel Vitrin ve Ödeme Modalı Erişimi - Public / SEO Uyumlu)
// ============================================================================
router.get('/bank-info', async (req, res) => {
  try {
    let tenantIdFromToken = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const secret = config.JWT_SECRET || process.env.JWT_SECRET;
        const decoded = jwt.verify(token, secret);
        if (decoded && decoded.tenantId) {
          tenantIdFromToken = decoded.tenantId;
        }
      } catch (e) {}
    }

    const tenant = await resolveTargetTenant(req, tenantIdFromToken);
    const tenantName = tenant ? tenant.name : 'Ahmet Oto';

    return res.status(200).json({
      success: true,
      data: {
        tenantId: tenant ? tenant.id : null,
        subdomain: tenant ? tenant.subdomain : 'ahmetoto',
        bankName: 'Ziraat Bankası',
        accountHolder: `${tenantName} Otomotiv San. ve Tic. Ltd. Şti.`,
        iban: 'TR33 0001 0001 2345 6789 0000 01',
        branch: 'Merkez Sanayi Şubesi (Şube Kodu: 1042)',
        accountNumber: '12345678-5001',
        instructions: 'Lütfen açıklama alanına Firma Adınızı veya Sipariş Numaranızı yazmayı unutmayınız.'
      }
    });
  } catch (error) {
    return res.status(200).json({
      success: true,
      data: {
        bankName: 'Ziraat Bankası',
        accountHolder: 'Ahmet Oto Otomotiv San. ve Tic. Ltd. Şti.',
        iban: 'TR33 0001 0001 2345 6789 0000 01',
        branch: 'Merkez Sanayi Şubesi (Şube Kodu: 1042)',
        accountNumber: '12345678-5001',
        instructions: 'Lütfen açıklama alanına Firma Adınızı veya Sipariş Numaranızı yazmayı unutmayınız.'
      }
    });
  }
});

// ============================================================================
// 0.1 GET /api/store/tenant-info - Bayi Marka ve Tema Bilgisi (Public / SEO Uyumlu)
// ============================================================================
router.get('/tenant-info', async (req, res) => {
  try {
    let tenantIdFromToken = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const secret = config.JWT_SECRET || process.env.JWT_SECRET;
        const decoded = jwt.verify(token, secret);
        if (decoded && decoded.tenantId) {
          tenantIdFromToken = decoded.tenantId;
        }
      } catch (e) {}
    }

    const tenant = await resolveTargetTenant(req, tenantIdFromToken);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Bayi mağazası bulunamadı.'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        themeColor: tenant.themeColor,
        logoUrl: tenant.logoUrl,
        phone: tenant.phone || null,
        address: tenant.address || null,
        isActive: tenant.isActive
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Bayi bilgileri alınırken hata oluştu.'
    });
  }
});

// ============================================================================
// 1. GET /api/store/products
// 2. ADIM: Ziyaretçi Modu ve SEO Uyumluluğu (Public Access)
// 5. ADIM: Tenant Algılama (Subdomain/Slug Resolution)
// ============================================================================
/**
 * @route   GET /api/store/products
 * @desc    Herkese açık (SEO Botları ve Ziyaretçiler dahil) parça kataloğu listeleme.
 *          X-Tenant-Slug, subdomain veya query parametresi ile hedef bayi dinamik algılanır.
 *          Giriş yapılmamışsa (Guest Mode):
 *            - B2B Fiyatı, İskonto ve Stok Miktarları kesinlikle gizlenir (null).
 *            - "Fiyatları görmek için giriş yapın veya kayıt olun" uyarısı döner.
 *          Giriş yapılmışsa (Authenticated Customer / Admin):
 *            - Müşteriye özel tanımlı iskonto ve B2B fiyatları dinamik hesaplanır.
 * @access  Public (Guest Mode Supported & SEO Bot Friendly)
 */
router.get('/products', async (req, res) => {
  try {
    // 1. Token ve Oturum Denetimi (İsteğe Bağlı - Public / Ziyaretçi Korumalı)
    let isGuest = true;
    let currentUser = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token && token.trim()) {
        try {
          const secret = config.JWT_SECRET || process.env.JWT_SECRET;
          const decoded = jwt.verify(token, secret);
          if (decoded && decoded.id) {
            currentUser = decoded;
            isGuest = false;
          }
        } catch (e) {
          // Geçersiz veya süresi dolmuş token: Ziyaretçi olarak devam et
          isGuest = true;
        }
      }
    }

    // 2. 5. ADIM: Tenant Algılama (Subdomain/Slug Resolution)
    const targetTenant = await resolveTargetTenant(req, currentUser ? currentUser.tenantId : null);

    if (!targetTenant) {
      return res.status(404).json({
        success: false,
        message: 'Bayi mağazası bulunamadı.'
      });
    }

    if (!targetTenant.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Bu bayi Kurumumuz tarafından pasife alınmıştır lütfen müşteri temsilcisi ile iletişime geçiniz.'
      });
    }

    const tenantId = targetTenant.id;

    // 3. Müşteri Profili ve İskonto Oranı (Sadece Giriş Yapılmışsa)
    let customerProfile = null;
    let discountRate = 0;

    if (!isGuest && currentUser) {
      customerProfile = await prisma.customerProfile.findUnique({
        where: { userId: currentUser.id },
        select: {
          id: true,
          companyName: true,
          discountRate: true,
          balance: true,
          customerType: true
        }
      });

      if (!customerProfile) {
        if (currentUser.role === 'TENANT_ADMIN' || currentUser.role === 'SUPER_ADMIN') {
          customerProfile = {
            id: 'admin-preview',
            companyName: (currentUser.role === 'SUPER_ADMIN' ? 'Süper Admin' : 'Bayi Yöneticisi') + ' (Önizleme)',
            discountRate: 0,
            balance: 0,
            customerType: 'MECHANIC'
          };
        }
      }

      if (customerProfile && customerProfile.discountRate !== undefined && customerProfile.discountRate !== null) {
        discountRate = Math.max(0, parseFloat(customerProfile.discountRate) || 0);
      }
    }

    // 4. Filtreleme ve Sayfalama Parametreleri
    const { category, search, model, brand, inStock, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const whereCondition = {
      tenantId: tenantId
    };

    if (inStock === 'true') {
      whereCondition.stock = { gt: 0 };
    }

    if (category && category !== 'ALL') {
      whereCondition.product = {
        ...(whereCondition.product || {}),
        category: { equals: category }
      };
    }

    if (brand && brand !== 'ALL' && brand !== 'all') {
      const brandClean = brand.trim();
      whereCondition.product = {
        ...(whereCondition.product || {}),
        vehicleBrand: { contains: brandClean }
      };
    }

    if (search) {
      const searchClean = search.trim();
      whereCondition.product = {
        ...(whereCondition.product || {}),
        OR: [
          { name: { contains: searchClean } },
          { oeNumber: { contains: searchClean } },
          { vehicleBrand: { contains: searchClean } },
          { compatibleModels: { contains: searchClean } },
          { partGroup: { contains: searchClean } }
        ]
      };
    }

    if (model) {
      const modelClean = model.trim();
      whereCondition.product = {
        ...(whereCondition.product || {}),
        OR: [
          { name: { contains: modelClean } },
          { compatibleModels: { contains: modelClean } },
          { vehicleBrand: { contains: modelClean } }
        ]
      };
    }

    const totalCount = await prisma.tenantProduct.count({
      where: whereCondition
    });

    const tenantProducts = await prisma.tenantProduct.findMany({
      where: whereCondition,
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
            defaultPrice: true,
            imageUrl: true,
            images: true
          }
        }
      },
      skip: skip,
      take: limitNum,
      orderBy: {
        createdAt: 'desc'
      }
    });

    // 5. 2. ADIM Güvenlik Kuralı: Ziyaretçi modunda katalog ve ürünler listelensin ancak
    // 'B2B Fiyatı', 'Stok Durumu' ve 'Sepete Ekle' gizlensin / maskelensin.
    const calculatedProducts = tenantProducts.map(item => {
      // Ziyaretçi Modu (Guest Mode - SEO botları ve üye olmayanlar):
      if (isGuest) {
        return {
          tenantProductId: item.id,
          productId: item.productId,
          oeNumber: item.product.oeNumber,
          name: item.product.name,
          category: item.product.category,
          vehicleBrand: item.product.vehicleBrand,
          compatibleModels: item.product.compatibleModels,
          partGroup: item.product.partGroup,
          imageUrl: item.product.imageUrl,
          images: item.product.images || [],
          // Güvenlik Koruması: Fiyat ve stok gizlenir
          stock: null,
          isDiscounted: false,
          defaultPrice: null,
          customPrice: null,
          discountedPrice: null,
          appliedDiscountRate: null,
          pricing: null,
          isGuest: true,
          guestNotice: 'Fiyatları görmek için giriş yapın veya kayıt olun'
        };
      }

      // Oturum Açmış Müşteri / Yönetici Modu:
      const listPrice = item.customPrice !== null && item.customPrice !== undefined
        ? parseFloat(item.customPrice)
        : parseFloat(item.product.defaultPrice);

      const discountMultiplier = Math.max(0, (100 - discountRate) / 100);
      const finalPrice = parseFloat((listPrice * discountMultiplier).toFixed(2));
      const savedAmount = parseFloat((listPrice - finalPrice).toFixed(2));

      return {
        tenantProductId: item.id,
        productId: item.productId,
        oeNumber: item.product.oeNumber,
        name: item.product.name,
        category: item.product.category,
        vehicleBrand: item.product.vehicleBrand,
        compatibleModels: item.product.compatibleModels,
        partGroup: item.product.partGroup,
        imageUrl: item.product.imageUrl,
        images: item.product.images || [],
        stock: item.stock,
        isDiscounted: item.isDiscounted,
        defaultPrice: listPrice,
        customPrice: item.customPrice,
        discountedPrice: finalPrice,
        appliedDiscountRate: discountRate,
        pricing: {
          listPrice: listPrice,
          discountRate: discountRate,
          savedAmount: savedAmount,
          finalPrice: finalPrice
        },
        isGuest: false
      };
    });

    return res.status(200).json({
      success: true,
      isGuest: isGuest,
      tenant: {
        id: targetTenant.id,
        name: targetTenant.name,
        subdomain: targetTenant.subdomain,
        themeColor: targetTenant.themeColor,
        logoUrl: targetTenant.logoUrl
      },
      customer: customerProfile ? {
        companyName: customerProfile.companyName,
        appliedDiscountRate: discountRate > 0 ? `%${discountRate}` : '%0',
        currentBalance: `${parseFloat(customerProfile.balance || 0).toLocaleString('tr-TR')} ₺`
      } : null,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount: totalCount,
        totalPages: Math.ceil(totalCount / limitNum) || 1
      },
      count: calculatedProducts.length,
      data: calculatedProducts
    });

  } catch (error) {
    console.error('[STORE_GET_PRODUCTS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Ürün listesi ve iskonto hesaplanırken sunucu hatası oluştu.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================================================
// B2B İŞLEM VE SİPARİŞ KORUMASI:
// Sipariş verme, bakiye defteri, iade ve profil gibi tüm işlemler
// kesinlikle doğrulanmış CUSTOMER token'ı gerektirir.
// ============================================================================
router.use(verifyToken, checkCustomer);

// ============================================================================
// 2. POST /api/store/orders
// ============================================================================
/**
 * @route   POST /api/store/orders
 * @desc    Tamircinin sepetindeki ürünlerle yeni sipariş oluşturur.
 *          Order ve OrderItem kayıtları atılır.
 *          tenantId otomatik olarak req.user.tenantId olarak atanır.
 *          totalAmount hesaplanır ve Prisma Transaction ile atomik kaydedilir.
 * @access  Protected (CUSTOMER)
 */
router.post('/orders', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const { items } = req.body;

    // 1. Sepet Doğrulaması
    // 1. Sepet Doğrulaması ve Tekrarlı Ürünleri Birleştirme (Deduplication / Merge)
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen sipariş edilecek en az bir ürün belirtiniz.'
      });
    }

    const mergedItemsMap = new Map();
    for (const item of items) {
      if (!item || !item.tenantProductId) continue;
      const qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty <= 0) continue;
      const currentQty = mergedItemsMap.get(item.tenantProductId) || 0;
      mergedItemsMap.set(item.tenantProductId, currentQty + qty);
    }

    const consolidatedItems = Array.from(mergedItemsMap.entries()).map(([tenantProductId, quantity]) => ({
      tenantProductId,
      quantity
    }));

    if (consolidatedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sepette geçerli bir ürün ve miktar bulunamadı.'
      });
    }

    // 2. Müşteri Profilini Getir
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId }
    });

    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        customerProfile = await prisma.customerProfile.findFirst({
          where: tenantId ? { tenantId: tenantId } : {}
        });
      }
      if (!customerProfile) {
        return res.status(404).json({
          success: false,
          message: 'Müşteri profili bulunamadı.'
        });
      }
    }

    const discountRate = parseFloat(customerProfile.discountRate) || 0;
    const discountMultiplier = Math.max(0, (100 - discountRate) / 100);

    // 3. Sepetteki ürünlerin bayiye ait olduğunu doğrula ve fiyatları hesapla
    const tenantProductIds = consolidatedItems.map(i => i.tenantProductId);
    const dbProducts = await prisma.tenantProduct.findMany({
      where: {
        id: { in: tenantProductIds },
        tenantId: tenantId // Kesin Data Isolation
      },
      include: {
        product: true
      }
    });

    if (dbProducts.length !== consolidatedItems.length) {
      return res.status(400).json({
        success: false,
        message: 'Sepetteki bazı ürünler bayinizin kataloğunda bulunamadı veya geçersiz.'
      });
    }

    // 4. Kalem hesaplamaları ve stok kontrolleri
    let listPriceTotal = 0;
    let calculatedSubtotal = 0;
    const orderItemsToCreate = [];

    for (const cartItem of consolidatedItems) {
      const dbProd = dbProducts.find(p => p.id === cartItem.tenantProductId);
      const qty = cartItem.quantity;

      if (dbProd.stock < qty) {
        return res.status(400).json({
          success: false,
          message: `Yetersiz stok: "${dbProd.product.name}" için mevcut stok: ${dbProd.stock}, talep edilen: ${qty}`
        });
      }

      // Liste fiyatı ve iskonto uygulanmış birim fiyat
      const listPrice = dbProd.customPrice !== null && dbProd.customPrice !== undefined
        ? parseFloat(dbProd.customPrice)
        : parseFloat(dbProd.product.defaultPrice);

      // Formül: İndirimli Fiyat = Liste Fiyatı - (Liste Fiyatı * (Müşteri İskonto Oranı / 100))
      const unitPrice = parseFloat((listPrice * discountMultiplier).toFixed(2));
      const lineTotal = parseFloat((unitPrice * qty).toFixed(2));

      listPriceTotal += listPrice * qty;
      calculatedSubtotal += lineTotal;

      orderItemsToCreate.push({
        tenantProductId: dbProd.id,
        quantity: qty,
        unitPrice: unitPrice,
        totalPrice: lineTotal
      });
    }

    listPriceTotal = parseFloat(listPriceTotal.toFixed(2));
    const subtotal = parseFloat(calculatedSubtotal.toFixed(2)); // Ara Toplam (KDV Hariç)
    const discountAmountTotal = parseFloat((listPriceTotal - subtotal).toFixed(2)); // İskonto Kazancı

    // KDV (%20) ve Genel Toplam (Ara Toplam + KDV)
    const vatRate = config.DEFAULT_VAT_RATE || 20.00;
    const vatAmount = parseFloat((subtotal * (vatRate / 100)).toFixed(2));
    const finalTotalWithVat = parseFloat((subtotal + vatAmount).toFixed(2));

    // Çakışmasız Benzersiz Sipariş Numarası Üret (Örn: SP-KXZ91A-4821)
    const orderNumber = `SP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Ödeme Yöntemi ve Başlangıç Statüsü
    // 2. ve 4. ADIM: Rol Tabanlı ve Limit Kontrollü B2B Cari Hesap Doğrulaması
    const paymentMethod = req.body.paymentMethod || (req.body.paymentMethodSelect ? req.body.paymentMethodSelect : 'CURRENT_ACCOUNT');
    const orderStatus = 'PENDING_APPROVAL';

    const isRetail = (customerProfile.customerType || 'MECHANIC') === 'RETAIL';
    const creditLimit = 50000.00;
    const currentDebt = parseFloat(customerProfile.balance || 0);
    const availableLimit = Math.max(0, parseFloat((creditLimit - currentDebt).toFixed(2)));

    if (paymentMethod === 'CURRENT_ACCOUNT' || paymentMethod === 'CARI') {
      // 2. ADIM: Perakende (son tüketici) müşteriler için Cari Hesaba Yaz kesinlikle engellenmelidir
      if (isRetail) {
        return res.status(400).json({
          success: false,
          message: 'Perakende (son tüketici) müşteriler için Cari Hesap (Açık Hesap) ile sipariş yetkisi bulunmamaktadır. Lütfen Havale/EFT veya Kredi Kartı seçiniz.'
        });
      }

      // 4. ADIM: 'Cari Hesaba Yaz' seçeneği yalnızca limiti yeterli olan B2B tamirciler için aktif olmalıdır
      if (finalTotalWithVat > availableLimit) {
        return res.status(400).json({
          success: false,
          message: `Cari hesap limitiniz bu sipariş için yetersizdir. (Kullanılabilir Limit: ${availableLimit.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺, Sipariş Tutarı: ${finalTotalWithVat.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺). Lütfen Havale/EFT ile devam ediniz.`
        });
      }
    }

    // 1. ADIM (prompt.md): 'Snapshot' Mimarisi
    // Müşterinin o anki adresi sipariş tablosuna kopyalanmalı (snapshot)
    // ki müşteri ileride adresini değiştirirse eski siparişlerin teslimat geçmişi bozulmasın.
    let snapshotShippingAddress = '';
    const bodyShipping = req.body.shippingAddress || req.body.deliveryAddress;
    const bodyCity = (req.body.city || '').trim();
    const bodyDistrict = (req.body.district || '').trim();
    const bodyAddress = (req.body.address || req.body.addressDetail || '').trim();

    if (bodyShipping && typeof bodyShipping === 'string' && bodyShipping.trim().length > 0) {
      snapshotShippingAddress = bodyShipping.trim();
    } else if (bodyAddress || bodyCity || bodyDistrict) {
      const parts = [bodyAddress, bodyDistrict, bodyCity].filter(Boolean);
      snapshotShippingAddress = parts.join(', ');
    } else if (bodyShipping && typeof bodyShipping === 'object') {
      try {
        snapshotShippingAddress = JSON.stringify(bodyShipping);
      } catch (e) {
        snapshotShippingAddress = String(bodyShipping);
      }
    } else {
      const defaultParts = [
        customerProfile.address,
        customerProfile.district,
        customerProfile.city
      ].filter(Boolean);
      snapshotShippingAddress = defaultParts.length > 0 ? defaultParts.join(', ') : 'Adres belirtilmedi';
    }

    if (snapshotShippingAddress.length > 1000) {
      snapshotShippingAddress = snapshotShippingAddress.substring(0, 1000);
    }

    // 5. Prisma Transaction (Atomik Sipariş Oluşturma, KDV, Güvenli Stok Düşme, Stok Denetimi ve Cari Bakiye Defteri)
    const createdOrder = await prisma.$transaction(async (tx) => {
      // A. Sipariş ana kaydını oluştur (KDV oran ve tutarlarıyla, shippingAddress snapshot'ı ile birlikte)
      const order = await tx.order.create({
        data: {
          orderNumber: orderNumber,
          tenantId: tenantId,
          customerId: customerProfile.id,
          subtotal: subtotal,
          vatRate: vatRate,
          vatAmount: vatAmount,
          totalAmount: finalTotalWithVat,
          status: orderStatus,
          paymentMethod: paymentMethod || null,
          shippingAddress: snapshotShippingAddress,
          items: {
            create: orderItemsToCreate
          }
        },
        include: {
          items: {
            include: {
              tenantProduct: {
                include: { product: true }
              }
            }
          },
          customer: true
        }
      });

      // B. Bayinin stoklarını atomik olarak düş ve Stok Denetim Defterine (StockMovement) kaydet
      for (const item of orderItemsToCreate) {
        const updateResult = await tx.tenantProduct.updateMany({
          where: {
            id: item.tenantProductId,
            stock: { gte: item.quantity }
          },
          data: {
            stock: { decrement: item.quantity }
          }
        });

        if (updateResult.count === 0) {
          throw new Error(`Yetersiz stok: "${item.tenantProductId}" ürünü tükendi veya eş zamanlı başka bir siparişle satıldı.`);
        }

        // Stok Hareket Denetim Kaydı (Audit)
        await tx.stockMovement.create({
          data: {
            tenantId: tenantId,
            tenantProductId: item.tenantProductId,
            orderId: order.id,
            quantityChange: -item.quantity,
            type: 'SALE',
            note: `Sipariş #${orderNumber} satışı`
          }
        });
      }

      // C. SADECE Cari Hesaba Yaz (Açık Hesap) seçildiyse müşterinin açık borcuna sipariş tutarını ekle ve Deftere işle
      if (paymentMethod === 'CURRENT_ACCOUNT' || paymentMethod === 'CARI') {
        const previousBalance = parseFloat(customerProfile.balance) || 0;
        const newBalance = parseFloat((previousBalance + finalTotalWithVat).toFixed(2));

        await tx.customerProfile.update({
          where: { id: customerProfile.id },
          data: {
            balance: newBalance,
            currentBalance: newBalance
          }
        });

        await tx.customerLedger.create({
          data: {
            tenantId: tenantId,
            customerId: customerProfile.id,
            type: 'DEBIT',
            amount: finalTotalWithVat,
            balanceAfter: newBalance,
            description: `Sipariş #${orderNumber} açık hesap borç kaydı (KDV Dahil)`
          }
        });
      }

      return order;
    });

    return res.status(201).json({
      success: true,
      message: `Siparişiniz #${createdOrder.orderNumber} numarasıyla başarıyla oluşturuldu ve bayinize iletildi.`,
      data: {
        ...createdOrder,
        breakdown: {
          listPriceTotal: listPriceTotal,
          discountAmount: discountAmountTotal,
          subtotal: subtotal,
          vatRate: vatRate,
          vatAmount: vatAmount,
          totalAmount: finalTotalWithVat
        }
      }
    });

  } catch (error) {
    console.error('[STORE_CREATE_ORDER_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Sipariş oluşturulurken sunucu hatası meydana geldi.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================================================
// 3. GET /api/store/orders & GET /api/store/my-orders - Müşterinin Geçmiş Siparişleri
// ============================================================================
router.get(['/orders', '/my-orders'], async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;

    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId }
    });

    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        const tenantOrders = await prisma.order.findMany({
          where: req.user.tenantId ? { tenantId: req.user.tenantId } : {},
          include: {
            items: {
              include: {
                tenantProduct: {
                  include: { product: true }
                }
              }
            },
            returnRequests: true
          },
          orderBy: { createdAt: 'desc' }
        });
        return res.status(200).json({
          success: true,
          count: tenantOrders.length,
          data: tenantOrders
        });
      }

      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı.'
      });
    }

    const orders = await prisma.order.findMany({
      where: {
        customerId: customerProfile.id,
        tenantId: tenantId
      },
      include: {
        items: {
          include: {
            tenantProduct: {
              include: { product: true }
            }
          }
        },
        returnRequests: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });

  } catch (error) {
    console.error('[STORE_GET_ORDERS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Sipariş geçmişi listelenirken sunucu hatası oluştu.'
    });
  }
});

// ============================================================================
// 4. GET /api/store/profile - Müşterinin Kendi Cari ve Profil Bilgileri
// ============================================================================
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        },
        tenant: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            themeColor: true
          }
        }
      }
    });

    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        let tenant = null;
        if (req.user.tenantId) {
          tenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { id: true, name: true, subdomain: true, themeColor: true }
          });
        }
        if (!tenant) {
          tenant = await prisma.tenant.findFirst({
            select: { id: true, name: true, subdomain: true, themeColor: true }
          });
        }
        const creditLimit = 50000.00;
        const currentDebt = 14850.00;
        const availableLimit = 35150.00;
        return res.status(200).json({
          success: true,
          data: {
            id: 'admin-preview',
            companyName: (req.user.role === 'SUPER_ADMIN' ? 'Süper Admin' : 'Bayi Yöneticisi') + ' (Önizleme)',
            name: req.user.role === 'SUPER_ADMIN' ? 'Süper Admin' : 'Bayi Yöneticisi',
            email: req.user.email,
            phone: '0555 123 45 67',
            address: 'Merkez Sanayi Sitesi No: 42',
            taxNumber: '1234567890',
            discountRate: 0,
            balance: currentDebt,
            creditLimit: creditLimit,
            currentDebt: currentDebt,
            availableLimit: availableLimit,
            customerType: 'MECHANIC',
            isB2B: true,
            tenant: tenant || {
              id: 'tenant-ahmet-oto',
              name: 'Ahmet Oto',
              subdomain: 'ahmetoto',
              themeColor: '#f97316'
            }
          }
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı.'
      });
    }

    const creditLimit = 50000.00;
    const currentDebt = parseFloat(customerProfile.balance || 0);
    const availableLimit = Math.max(0, parseFloat((creditLimit - currentDebt).toFixed(2)));
    const isRetail = (customerProfile.customerType || 'MECHANIC') === 'RETAIL';

    return res.status(200).json({
      success: true,
      data: {
        ...customerProfile,
        name: customerProfile.user ? customerProfile.user.name : customerProfile.companyName,
        email: customerProfile.user ? customerProfile.user.email : '',
        creditLimit: creditLimit,
        currentDebt: currentDebt,
        availableLimit: availableLimit,
        customerType: customerProfile.customerType || 'MECHANIC',
        isB2B: !isRetail
      }
    });

  } catch (error) {
    console.error('[STORE_GET_PROFILE_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Profil bilgisi alınırken sunucu hatası oluştu.'
    });
  }
});

// ============================================================================
// 5. PUT & PATCH /api/store/profile - Müşteri Profil ve Hesap Ayarlarını Güncelleme
// ============================================================================
const handleUpdateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, companyName, phone, email, address, city, district, taxNumber, password } = req.body;

    // 1. Veritabanında Kullanıcıyı Bul (ID veya E-posta ile)
    let user = await prisma.user.findUnique({
      where: { id: userId }
    });
    if (!user && req.user.email) {
      user = await prisma.user.findUnique({
        where: { email: req.user.email }
      });
    }

    const effectiveUserId = user ? user.id : userId;

    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: effectiveUserId }
    });
    if (!customerProfile && user) {
      customerProfile = await prisma.customerProfile.findFirst({
        where: { userId: user.id }
      });
    }

    const userUpdateData = {};
    if (name && name.trim()) userUpdateData.name = name.trim();
    if (email && email.trim()) {
      const emailLower = email.trim().toLowerCase();
      // Başka bir kullanıcı aynı e-postayı kullanıyor mu kontrol et
      const existingUser = await prisma.user.findFirst({
        where: {
          email: emailLower,
          NOT: { id: effectiveUserId }
        }
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Bu e-posta adresi başka bir kullanıcı tarafından kullanılmaktadır.'
        });
      }
      userUpdateData.email = emailLower;
    }
    if (password && password.trim()) {
      if (password.trim().length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Yeni şifreniz en az 6 karakter uzunluğunda olmalıdır.'
        });
      }
      const bcrypt = require('bcryptjs');
      userUpdateData.password = await bcrypt.hash(password.trim(), 10);
    }

    let updatedUser = user;
    if (user && Object.keys(userUpdateData).length > 0) {
      updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: userUpdateData,
        select: { id: true, name: true, email: true, role: true }
      });
    }

    if (customerProfile) {
      const profileUpdateData = {};
      if (companyName && companyName.trim()) {
        profileUpdateData.companyName = companyName.trim();
      } else if (name && name.trim()) {
        profileUpdateData.companyName = name.trim();
      }
      if (phone !== undefined) profileUpdateData.phone = phone.trim();
      if (address !== undefined) profileUpdateData.address = address.trim();
      if (city !== undefined) profileUpdateData.city = city.trim();
      if (district !== undefined) profileUpdateData.district = district.trim();
      if (taxNumber !== undefined) profileUpdateData.taxNumber = taxNumber.trim();

      customerProfile = await prisma.customerProfile.update({
        where: { id: customerProfile.id },
        data: profileUpdateData,
        include: {
          tenant: {
            select: { id: true, name: true, subdomain: true, themeColor: true }
          }
        }
      });
    }

    const finalCompanyName = customerProfile ? customerProfile.companyName : (companyName || name || (updatedUser ? updatedUser.name : 'Müşteri'));
    const finalName = (updatedUser ? updatedUser.name : name) || finalCompanyName;
    const finalEmail = (updatedUser ? updatedUser.email : email) || (req.user ? req.user.email : '');

    return res.status(200).json({
      success: true,
      message: 'Profil bilgileriniz başarıyla güncellendi.',
      data: {
        user: updatedUser,
        customerProfile: customerProfile,
        companyName: finalCompanyName,
        name: finalName,
        email: finalEmail,
        phone: customerProfile ? customerProfile.phone : (phone || ''),
        address: customerProfile ? customerProfile.address : (address || ''),
        city: customerProfile ? customerProfile.city : (city || ''),
        district: customerProfile ? customerProfile.district : (district || ''),
        taxNumber: customerProfile ? customerProfile.taxNumber : (taxNumber || ''),
        balance: customerProfile ? customerProfile.balance : 14850.00,
        discountRate: customerProfile ? customerProfile.discountRate : 0
      }
    });

  } catch (error) {
    console.error('[STORE_UPDATE_PROFILE_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Profil güncellenirken sunucu hatası oluştu.'
    });
  }
};

router.put('/profile', handleUpdateProfile);
router.patch('/profile', handleUpdateProfile);

// ============================================================================
// 5. GET /api/store/ledger - Müşterinin Kendi Cari Hesap Ekstresi (Audit)
// ============================================================================
router.get('/ledger', async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;

    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId }
    });

    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        return res.status(200).json({
          success: true,
          creditLimit: 50000.00,
          currentDebt: 14850.00,
          availableLimit: 35150.00,
          isB2B: true,
          customerType: 'MECHANIC',
          currentBalance: '14.850,00 ₺',
          count: 0,
          data: []
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı.'
      });
    }

    const isRetail = (customerProfile.customerType || 'MECHANIC') === 'RETAIL';
    const creditLimit = 50000.00;
    const currentDebt = parseFloat(customerProfile.balance || 0);
    const availableLimit = Math.max(0, parseFloat((creditLimit - currentDebt).toFixed(2)));

    const ledgers = await prisma.customerLedger.findMany({
      where: {
        customerId: customerProfile.id,
        tenantId: tenantId
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      creditLimit: creditLimit,
      currentDebt: currentDebt,
      availableLimit: availableLimit,
      isB2B: !isRetail,
      customerType: customerProfile.customerType || 'MECHANIC',
      currentBalance: `${currentDebt.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`,
      count: ledgers.length,
      data: ledgers
    });

  } catch (error) {
    console.error('[STORE_GET_LEDGER_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Cari hesap ekstresi alınırken sunucu hatası oluştu.'
    });
  }
});

// ============================================================================
// 6. İADE YÖNETİMİ (RMA) ROTALARI - Müşteri Vitrini (Prompt 2. ADIM)
// ============================================================================

/**
 * @route   POST /api/store/orders/:id/return & POST /api/store/returns
 * @desc    Müşteri teslim edilmiş sipariş için iade talebi (ReturnRequest) oluşturur.
 *          Yalnızca 'Teslim Edildi' (DELIVERED / COMPLETED) statüsündeki siparişler kabul edilir.
 * @access  Protected (CUSTOMER)
 */
const handleCreateReturnRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.id || req.body.orderId;
    const { reason, customerNote, iadeSebebi, aciklama, note } = req.body;

    const finalReason = (reason || iadeSebebi || '').trim();
    const finalNote = (customerNote || aciklama || note || '').trim();

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'İade edilecek sipariş kimliği (orderId) belirtilmelidir.'
      });
    }

    if (!finalReason) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen bir iade sebebi (Örn: Parça Araca Uymadı, Kusurlu Geldi) seçiniz.'
      });
    }

    // 1. Müşteri profilini bul
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId }
    });

    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        customerProfile = await prisma.customerProfile.findFirst({
          where: req.user.tenantId ? { tenantId: req.user.tenantId } : {}
        });
      }
      if (!customerProfile) {
        return res.status(404).json({
          success: false,
          message: 'Müşteri profili bulunamadı.'
        });
      }
    }

    // 2. Siparişi bul ve müşteri yetkisi doğrula
    const orderWhere = {
      id: orderId,
      customerId: customerProfile.id
    };
    if (req.user.tenantId && req.user.role !== 'SUPER_ADMIN') {
      orderWhere.tenantId = req.user.tenantId;
    }

    let order = await prisma.order.findFirst({
      where: orderWhere,
      include: {
        items: true,
        returnRequests: true
      }
    });

    // orderNumber ile arama fallback'i
    if (!order) {
      order = await prisma.order.findFirst({
        where: {
          orderNumber: orderId,
          customerId: customerProfile.id
        },
        include: {
          items: true,
          returnRequests: true
        }
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'İade edilmek istenen sipariş bulunamadı veya hesabınıza ait değil.'
      });
    }

    // 3. Statü Kontrolü: YALNIZCA 'Teslim Edildi' (DELIVERED / COMPLETED) siparişler
    const statusUpper = (order.status || '').toUpperCase();
    const isDelivered = statusUpper === 'DELIVERED' ||
      statusUpper === 'TESLIM_EDILDI' ||
      statusUpper === 'COMPLETED' ||
      order.status === 'Teslim Edildi';

    if (!isDelivered) {
      return res.status(400).json({
        success: false,
        message: `Yalnızca "Teslim Edildi" statüsündeki siparişler için iade talebi oluşturulabilir. Bu siparişin mevcut durumu: "${order.status}".`
      });
    }

    // 4. Mükerrer (Duplicate) Bekleyen Talep Kontrolü
    const existingPending = await prisma.returnRequest.findFirst({
      where: {
        orderId: order.id,
        status: { in: ['Bekliyor', 'PENDING'] }
      }
    });

    if (existingPending) {
      return res.status(400).json({
        success: false,
        message: 'Bu sipariş için halihazırda onay bekleyen bir iade talebiniz bulunmaktadır.'
      });
    }

    // 5. İade Talebini Oluştur
    const newReturn = await prisma.returnRequest.create({
      data: {
        orderId: order.id,
        tenantId: order.tenantId,
        customerId: customerProfile.id,
        reason: finalReason,
        customerNote: finalNote || null,
        status: 'Bekliyor'
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            status: true
          }
        }
      }
    });

    return res.status(201).json({
      success: true,
      message: `Sipariş #${order.orderNumber} için iade talebiniz başarıyla oluşturuldu ve bayinize iletildi.`,
      data: newReturn
    });

  } catch (error) {
    console.error('[STORE_CREATE_RETURN_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'İade talebi oluşturulurken sunucu hatası meydana geldi.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

router.post('/orders/:id/return', handleCreateReturnRequest);
router.post('/returns', handleCreateReturnRequest);

/**
 * @route   GET /api/store/returns
 * @desc    Müşterinin geçmiş iade taleplerini listeler.
 * @access  Protected (CUSTOMER)
 */
router.get('/returns', async (req, res) => {
  try {
    const userId = req.user.id;
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId }
    });

    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        customerProfile = await prisma.customerProfile.findFirst({
          where: req.user.tenantId ? { tenantId: req.user.tenantId } : {}
        });
      }
      if (!customerProfile) {
        return res.status(404).json({
          success: false,
          message: 'Müşteri profili bulunamadı.'
        });
      }
    }

    const returns = await prisma.returnRequest.findMany({
      where: {
        customerId: customerProfile.id
      },
      include: {
        order: {
          include: {
            items: {
              include: {
                tenantProduct: {
                  include: { product: true }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      count: returns.length,
      data: returns
    });

  } catch (error) {
    console.error('[STORE_GET_RETURNS_ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'İade talepleri listelenirken hata oluştu.'
    });
  }
});

module.exports = router;

