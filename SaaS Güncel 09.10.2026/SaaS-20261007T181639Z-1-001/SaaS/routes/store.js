// ============================================================================
// Multi-Tenant B2B SaaS - B2B Vitrin API Rotaları (routes/store.js)
// Yalnızca CUSTOMER (Otoservis / Tamirhane) rolünün erişimine açıktır.
// ============================================================================

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const config = require('../config');
const { verifyToken, checkCustomer } = require('../middleware/auth');

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
    const tenantId = req.user.tenantId;
    const userId = req.user.id;

    // 1. Müşterinin (Tamirhane) profilini ve tanımlı iskonto oranını getir
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId },
      select: {
        id: true,
        companyName: true,
        discountRate: true,
        balance: true
      }
    });

    if (!customerProfile) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri servis profili bulunamadı.'
      });
    }

    const discountRate = parseFloat(customerProfile.discountRate) || 0; // Örn: 20 -> %20

    // Filtreleme ve Sayfalama Parametreleri (EKSİK-06 & ÖNERİ-06)
    const { category, search, model, inStock, page = 1, limit = 50 } = req.query;
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

    if (category) {
      whereCondition.product = {
        category: { equals: category }
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
            imageUrl: true
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
        appliedDiscountRate: `%${discountRate}`,
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
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId }
    });

    if (!customerProfile) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı.'
      });
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
    let calculatedTotalAmount = 0;
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

      const unitPrice = parseFloat((listPrice * discountMultiplier).toFixed(2));
      const lineTotal = parseFloat((unitPrice * qty).toFixed(2));

      calculatedTotalAmount += lineTotal;

      orderItemsToCreate.push({
        tenantProductId: dbProd.id,
        quantity: qty,
        unitPrice: unitPrice,
        totalPrice: lineTotal
      });
    }

    calculatedTotalAmount = parseFloat(calculatedTotalAmount.toFixed(2));

    // KDV ve Toplam Tutar Hesaplamaları (%20 KDV)
    const subtotal = calculatedTotalAmount;
    const vatRate = config.DEFAULT_VAT_RATE || 20.00;
    const vatAmount = parseFloat((subtotal * (vatRate / 100)).toFixed(2));
    const finalTotalWithVat = parseFloat((subtotal + vatAmount).toFixed(2));

    // Çakışmasız Benzersiz Sipariş Numarası Üret (Örn: SP-KXZ91A-4821)
    const orderNumber = `SP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

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
          status: 'PENDING',
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
      data: createdOrder
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
// 3. GET /api/store/orders - Müşterinin Kendi Geçmiş Siparişlerini Listeleme
// ============================================================================
router.get('/orders', async (req, res) => {
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
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: userId },
      include: {
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
      return res.status(404).json({
        success: false,
        message: 'Müşteri profili bulunamadı.'
      });
    }

    return res.status(200).json({
      success: true,
      data: customerProfile
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

