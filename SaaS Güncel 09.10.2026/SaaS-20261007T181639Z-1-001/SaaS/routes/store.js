// ============================================================================
// Multi-Tenant B2B SaaS - B2B Vitrin API Rotaları (routes/store.js)
// Yalnızca CUSTOMER (Otoservis / Tamirhane) rolünün erişimine açıktır.
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const config = require('../config');
const { verifyToken, checkCustomer } = require('../middleware/auth');

// ============================================================================
// 0. GET /api/store/bank-info - Havale / EFT için Bayi Banka ve IBAN Bilgileri
// (Genel Vitrin ve Ödeme Modalı Erişimi)
// ============================================================================
router.get('/bank-info', async (req, res) => {
  try {
    let tenantId = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, config.jwtSecret);
        if (decoded && decoded.tenantId) {
          tenantId = decoded.tenantId;
        }
      } catch (e) {}
    }

    if (!tenantId) {
      const defTenant = await prisma.tenant.findFirst();
      tenantId = defTenant ? defTenant.id : null;
    }
    const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null;
    const tenantName = tenant ? tenant.name : 'Ahmet Oto';

    return res.status(200).json({
      success: true,
      data: {
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

// Tüm B2B vitrin rotalarına JWT doğrulama ve CUSTOMER rol kontrolü uygula
router.use(verifyToken, checkCustomer);

// ============================================================================
// 1. GET /api/store/products
// ============================================================================
/**
 * @route   GET /api/store/products
 * @desc    Tamircinin bağlı olduğu bayinin kataloğundaki (TenantProduct) ürünleri listeler.
 *          CustomerProfile tablosundaki discountRate (İskonto Oranı) değerini alıp,
 *          ürünün fiyatından bu indirimi düşerek "finalPrice" değerini dinamik hesaplar.
 * @access  Protected (CUSTOMER)
 */
router.get('/products', async (req, res) => {
  try {
    let tenantId = req.user.tenantId;
    const userId = req.user.id;

    // Eğer kullanıcıda tenantId yoksa (örn: SUPER_ADMIN) veya URL'de subdomain belirtilmişse ilgili bayiyi bul
    if (!tenantId || req.query.subdomain) {
      const subdomainToFind = req.query.subdomain || 'ahmetoto';
      const tenantMatch = await prisma.tenant.findUnique({
        where: { subdomain: subdomainToFind }
      });
      if (tenantMatch) {
        tenantId = tenantMatch.id;
      } else if (!tenantId) {
        const defaultTenant = await prisma.tenant.findFirst({
          where: { subdomain: 'ahmetoto' }
        });
        tenantId = defaultTenant ? defaultTenant.id : null;
      }
    }

    // 1. Müşterinin (Tamirhane) profilini ve tanımlı iskonto oranını getir
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId },
      select: {
        id: true,
        companyName: true,
        discountRate: true,
        balance: true
      }
    });

    // Eğer oturum açan kullanıcı yönetici ise vitrini önizleme modunda görebilsin
    if (!customerProfile) {
      if (req.user.role === 'TENANT_ADMIN' || req.user.role === 'SUPER_ADMIN') {
        customerProfile = {
          id: 'admin-preview',
          companyName: (req.user.role === 'SUPER_ADMIN' ? 'Süper Admin' : 'Bayi Yöneticisi') + ' (Önizleme)',
          discountRate: 0,
          balance: 0
        };
      } else {
        return res.status(404).json({
          success: false,
          message: 'Müşteri servis profili bulunamadı.'
        });
      }
    }

    const discountRate = (customerProfile.discountRate !== undefined && customerProfile.discountRate !== null && !isNaN(parseFloat(customerProfile.discountRate)))
      ? Math.max(0, parseFloat(customerProfile.discountRate))
      : 0;

    // Filtreleme ve Sayfalama Parametreleri (Marka / Arama / Kategori)
    const { category, search, model, brand, inStock, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // Prisma filtre koşulu
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

    // Marka Izgarası Filtresi (Partsouq Brand Grid)
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

    // 2. Tamircinin bağlı olduğu bayinin kataloğundaki ürünleri getir (Sayfalamalı)
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

    // 3. Fiyat Hesaplama: customPrice veya defaultPrice üzerinden tamircinin iskonto oranını düş
    const calculatedProducts = tenantProducts.map(item => {
      // Liste fiyatı: Bayi özel fiyatı varsa o, yoksa merkezi havuz varsayılan fiyatı
      const listPrice = item.customPrice !== null && item.customPrice !== undefined
        ? parseFloat(item.customPrice)
        : parseFloat(item.product.defaultPrice);

      // İskonto hesaplaması
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
        stock: item.stock,
        isDiscounted: item.isDiscounted,
        defaultPrice: listPrice,
        customPrice: item.customPrice,
        discountedPrice: finalPrice,
        appliedDiscountRate: discountRate,
        pricing: {
          listPrice: listPrice,           // Liste Satış Fiyatı (₺)
          discountRate: discountRate,     // Tamirciye Özel İskonto Oranı (%)
          savedAmount: savedAmount,       // İndirim Tutarı (₺)
          finalPrice: finalPrice          // İskonto Düşülmüş Net Satış Fiyatı (₺)
        }
      };
    });

    return res.status(200).json({
      success: true,
      customer: {
        companyName: customerProfile.companyName,
        appliedDiscountRate: discountRate > 0 ? `%${discountRate}` : '%0',
        currentBalance: `${parseFloat(customerProfile.balance).toLocaleString('tr-TR')} ₺`
      },
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

    // Ödeme Yöntemi ve Başlangıç Statüsü (Cari: 'Hazırlanıyor', Havale: 'Ödeme Bekliyor')
    const paymentMethod = req.body.paymentMethod || (req.body.paymentMethodSelect ? req.body.paymentMethodSelect : null);
    let orderStatus = 'PENDING';
    if (paymentMethod === 'CURRENT_ACCOUNT') {
      orderStatus = 'Hazırlanıyor';
    } else if (paymentMethod === 'BANK_TRANSFER') {
      orderStatus = 'Ödeme Bekliyor';
    }

    // 5. Prisma Transaction (Atomik Sipariş Oluşturma, KDV, Güvenli Stok Düşme, Stok Denetimi ve Cari Bakiye Defteri)
    const createdOrder = await prisma.$transaction(async (tx) => {
      // A. Sipariş ana kaydını oluştur (KDV oran ve tutarlarıyla birlikte)
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

      // C. Müşterinin açık cari bakiyesine sipariş tutarını ekle ve Finansal Denetim Defterine (CustomerLedger) işle
      const previousBalance = parseFloat(customerProfile.balance) || 0;
      const newBalance = parseFloat((previousBalance + finalTotalWithVat).toFixed(2));

      await tx.customerProfile.update({
        where: { id: customerProfile.id },
        data: {
          balance: newBalance
        }
      });

      await tx.customerLedger.create({
        data: {
          tenantId: tenantId,
          customerId: customerProfile.id,
          type: 'DEBIT',
          amount: finalTotalWithVat,
          balanceAfter: newBalance,
          description: `Sipariş #${orderNumber} borç kaydı (KDV Dahil)`
        }
      });

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
            }
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
        }
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
            balance: 14850.00,
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

    return res.status(200).json({
      success: true,
      data: {
        ...customerProfile,
        name: customerProfile.user ? customerProfile.user.name : customerProfile.companyName,
        email: customerProfile.user ? customerProfile.user.email : ''
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
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, companyName, phone, email, address, taxNumber, password } = req.body;

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
});

router.patch('/profile', async (req, res, next) => {
  req.method = 'PUT';
  return router.handle(req, res, next);
});

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
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı.'
      });
    }

    const ledgers = await prisma.customerLedger.findMany({
      where: {
        customerId: customerProfile.id,
        tenantId: tenantId
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      currentBalance: `${parseFloat(customerProfile.balance).toLocaleString('tr-TR')} ₺`,
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

module.exports = router;

