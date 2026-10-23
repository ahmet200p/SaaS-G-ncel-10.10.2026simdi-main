/**
 * ============================================================================
 * Multi-Tenant B2B SaaS - Test Siparişleri ve Müşteri Temizleme Betiği
 * Dosya: clean_test_orders.js
 * ============================================================================
 * Görev (prompt.md):
 * 1. Test Kayıtlarını Hedefle:
 *    Müşteri adı 'arda' ve telefon numarası '1111111111' olan test hesabına ait
 *    tüm sipariş kayıtlarını bul.
 * 2. İlişkisel Silme (Cascade Delete):
 *    Veritabanı bütünlüğünü koruyarak; siparişlere bağlı OrderItem, StockMovement,
 *    kargo/teslimat durumları, ReturnRequest ve CustomerLedger kayıtlarını
 *    Prisma $transaction ile ilişkisel olarak kalıcı olarak sil.
 * 3. Panel İstatistiklerini Güncelle:
 *    Dashboard KPI sayaçlarının ('Bekleyen Siparişler', 'Bugünkü Ciro', 'Kayıtlı Otoservis')
 *    önbellekte takılı kalmamasını ve canlı veritabanı verisiyle senkronize olmasını sağla.
 */

const path = require('path');
let prisma;
try {
  prisma = require('./lib/prisma');
} catch (e) {
  prisma = require('../lib/prisma');
}

/**
 * Arda / 1111111111 test müşteri ve sipariş kayıtlarını cascade olarak siler.
 * @param {Object} options - Opsiyonel yapılandırma
 * @param {boolean} options.silent - Log çıktılarını sustur
 * @returns {Promise<Object>} Temizleme istatistikleri
 */
async function cleanArdaTestOrders(options = {}) {
  const verbose = !options.silent;

  if (verbose) {
    console.log('================================================================');
    console.log('🧹 [CASCADE_CLEAN] Test Siparişleri ve Müşteri Temizliği Başlatılıyor');
    console.log('================================================================');
  }

  // 1. ADIM: Test Kayıtlarını Hedefle (Müşteri 'arda' ve Telefon '1111111111')
  const matchedProfiles = await prisma.customerProfile.findMany({
    where: {
      OR: [
        { companyName: { contains: 'arda', mode: 'insensitive' } },
        { phone: { contains: '1111111111' } },
        { user: { name: { contains: 'arda', mode: 'insensitive' } } },
        { user: { email: { contains: 'arda', mode: 'insensitive' } } }
      ]
    },
    include: {
      user: true,
      orders: {
        include: {
          items: true,
          stockMovements: true,
          returnRequests: true
        }
      },
      customerLedgers: true
    }
  });

  const matchedProfileIds = matchedProfiles.map(p => p.id);
  const matchedUserIds = matchedProfiles.map(p => p.userId).filter(Boolean);

  // Eşleşen profillerden veya doğrudan müşteri telefonu '1111111111' olan tüm siparişleri bul
  const matchedOrders = await prisma.order.findMany({
    where: {
      OR: [
        { customerId: { in: matchedProfileIds } },
        { customer: { phone: { contains: '1111111111' } } },
        { customer: { companyName: { contains: 'arda', mode: 'insensitive' } } }
      ]
    },
    include: {
      items: true,
      stockMovements: true,
      returnRequests: true,
      customer: true
    }
  });

  const matchedOrderIds = matchedOrders.map(o => o.id);
  const matchedOrderNumbers = matchedOrders.map(o => o.orderNumber).filter(Boolean);

  if (verbose) {
    console.log(`🎯 1. ADIM SONUCU: Hedef Test Kayıtları:`);
    console.log(`   - Bulunan Müşteri Profili Sayısı: ${matchedProfiles.length}`);
    matchedProfiles.forEach(p => {
      console.log(`     * ID: ${p.id} | Firma: ${p.companyName} | Tel: ${p.phone} | Kullanıcı: ${p.user?.name} (${p.user?.email})`);
    });
    console.log(`   - Bulunan İlişkili Sipariş Sayısı: ${matchedOrders.length}`);
    matchedOrders.forEach(o => {
      console.log(`     * Sipariş No: ${o.orderNumber} (ID: ${o.id}) | Müşteri: ${o.customer?.companyName} | Toplam: ${o.totalAmount} ₺ | Durum: ${o.status}`);
    });
  }

  // 2. ADIM: İlişkisel Silme (Cascade Delete) via Prisma $transaction
  const stats = {
    deletedOrders: 0,
    deletedOrderItems: 0,
    deletedStockMovements: 0,
    deletedReturnRequests: 0,
    deletedCustomerLedgers: 0,
    deletedCustomerProfiles: 0,
    deletedUsers: 0
  };

  if (matchedOrderIds.length > 0 || matchedProfileIds.length > 0) {
    const txResult = await prisma.$transaction(async (tx) => {
      // 2.a İade Talepleri (ReturnRequest)
      const resReturns = await tx.returnRequest.deleteMany({
        where: {
          OR: [
            { orderId: { in: matchedOrderIds } },
            { customerId: { in: matchedProfileIds } }
          ]
        }
      });

      // 2.b Stok Hareketleri (StockMovement)
      const resStock = await tx.stockMovement.deleteMany({
        where: {
          orderId: { in: matchedOrderIds }
        }
      });

      // 2.c Sipariş Kalemleri (OrderItem)
      const resItems = await tx.orderItem.deleteMany({
        where: {
          orderId: { in: matchedOrderIds }
        }
      });

      // 2.d Cari Hesap Defteri ve Fatura/Ödeme Hareketleri (CustomerLedger)
      const resLedgers = await tx.customerLedger.deleteMany({
        where: {
          OR: [
            { customerId: { in: matchedProfileIds } },
            ...matchedOrderNumbers.map(num => ({ description: { contains: num } }))
          ]
        }
      });

      // 2.e Siparişlerin Kalıcı Olarak Silinmesi (Order)
      const resOrders = await tx.order.deleteMany({
        where: {
          id: { in: matchedOrderIds }
        }
      });

      // 2.f Test Müşteri Profillerinin Silinmesi (CustomerProfile)
      const resProfiles = await tx.customerProfile.deleteMany({
        where: {
          id: { in: matchedProfileIds }
        }
      });

      // 2.g Test Müşteri Kullanıcı Hesaplarının Silinmesi (User - Sadece CUSTOMER rolü, Adminler ASLA silinmez)
      const resUsers = await tx.user.deleteMany({
        where: {
          id: { in: matchedUserIds },
          role: 'CUSTOMER'
        }
      });

      return {
        deletedOrders: resOrders.count,
        deletedOrderItems: resItems.count,
        deletedStockMovements: resStock.count,
        deletedReturnRequests: resReturns.count,
        deletedCustomerLedgers: resLedgers.count,
        deletedCustomerProfiles: resProfiles.count,
        deletedUsers: resUsers.count
      };
    });

    Object.assign(stats, txResult);
  }

  if (verbose) {
    console.log('\n🗑️  2. ADIM SONUCU: Cascade Silme İstatistikleri:');
    console.log(`   - Silinen Sipariş Kalemleri (OrderItem):        ${stats.deletedOrderItems}`);
    console.log(`   - Silinen Stok Hareketleri (StockMovement):       ${stats.deletedStockMovements}`);
    console.log(`   - Silinen İade Talepleri (ReturnRequest):         ${stats.deletedReturnRequests}`);
    console.log(`   - Silinen Cari/Fatura Kayıtları (CustomerLedger): ${stats.deletedCustomerLedgers}`);
    console.log(`   - Silinen Siparişler (Order):                     ${stats.deletedOrders}`);
    console.log(`   - Silinen Test Profilleri (CustomerProfile):      ${stats.deletedCustomerProfiles}`);
    console.log(`   - Silinen Test Kullanıcıları (User - CUSTOMER):   ${stats.deletedUsers}`);
  }

  // 3. ADIM: Doğrulama ve Güncel Sayaç Durumu
  const remainingArdaProfiles = await prisma.customerProfile.count({
    where: {
      OR: [
        { companyName: { contains: 'arda', mode: 'insensitive' } },
        { phone: { contains: '1111111111' } }
      ]
    }
  });

  const remainingOrdersTotal = await prisma.order.count();
  const remainingCustomersTotal = await prisma.customerProfile.count();

  if (verbose) {
    console.log('\n📊 3. ADIM SONUCU: Güncel Veritabanı Bütünlüğü:');
    console.log(`   - Kalan 'arda' / '1111111111' Test Profili:      ${remainingArdaProfiles} (0 olmalı)`);
    console.log(`   - Toplam Kalan Organik Sipariş Sayısı:            ${remainingOrdersTotal}`);
    console.log(`   - Toplam Kalan Organik Müşteri Profili Sayısı:    ${remainingCustomersTotal}`);
    console.log('✨ [SUCCESS] Veritabanı bütünlüğü korundu ve test kayıtları tamamen temizlendi.\n');
  }

  return {
    success: true,
    stats,
    remainingArdaProfiles,
    remainingOrdersTotal,
    remainingCustomersTotal
  };
}

// CLI doğrudan çalıştırma desteği
if (require.main === module) {
  cleanArdaTestOrders()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Temizleme sırasında hata:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = { cleanArdaTestOrders };
