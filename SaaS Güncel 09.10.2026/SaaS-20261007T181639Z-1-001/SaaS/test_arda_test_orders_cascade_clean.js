/**
 * ============================================================================
 * Doğrulama Testi: Arda / 1111111111 Test Siparişleri ve Cascade Silme Testi
 * Dosya: test_arda_test_orders_cascade_clean.js
 * ============================================================================
 */

const assert = require('assert');
const bcrypt = require('bcryptjs');
const prisma = require('./lib/prisma');
const { cleanArdaTestOrders } = require('./clean_test_orders');

async function testCascadeClean() {
  console.log('================================================================');
  console.log('🧪 TEST: Arda Test Siparişi Oluşturma ve Cascade Silme Doğrulaması');
  console.log('================================================================\n');

  // 1. Bayi ve Ürün Bilgilerini Al
  let tenantProduct = await prisma.tenantProduct.findFirst({
    include: { tenant: true, product: true }
  });

  let tenant;
  if (tenantProduct) {
    tenant = tenantProduct.tenant;
  } else {
    tenant = await prisma.tenant.findFirst();
    assert(tenant, 'Veritabanında en az bir tenant (bayi) bulunmalıdır');
    let product = await prisma.product.findFirst();
    if (!product) {
      product = await prisma.product.create({
        data: {
          oeNumber: 'TEST-OE-999',
          name: 'Test Parça',
          category: 'Genel',
          defaultPrice: 500
        }
      });
    }
    tenantProduct = await prisma.tenantProduct.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        stock: 50,
        customPrice: 500
      },
      include: { product: true, tenant: true }
    });
  }

  console.log(`📌 Hedef Bayi: ${tenant.name} (${tenant.id})`);
  console.log(`📌 Hedef Ürün: ${tenantProduct.product.name} (TP ID: ${tenantProduct.id})`);

  // 2. Test Müşterisi 'arda' ve '1111111111' Oluştur
  const testEmail = `arda_test_${Date.now()}@test.com`;
  const passwordHash = await bcrypt.hash('Test12345!', 10);

  const testUser = await prisma.user.create({
    data: {
      email: testEmail,
      password: passwordHash,
      role: 'CUSTOMER',
      name: 'arda',
      tenantId: tenant.id
    }
  });

  const testProfile = await prisma.customerProfile.create({
    data: {
      userId: testUser.id,
      tenantId: tenant.id,
      companyName: 'arda oto test',
      phone: '1111111111',
      customerType: 'MECHANIC',
      status: 'APPROVED',
      discountRate: 20.0,
      balance: 1000.0,
      currentBalance: 1000.0
    }
  });

  console.log(`✅ Test Müşteri Profili Oluşturuldu: ID=${testProfile.id}, İsim='arda oto test', Tel='1111111111'`);

  // 3. Test Siparişi ve Bağlı İlişkisel Kayıtları Oluştur
  const testOrderNumber = `SP-TEST-ARDA-${Date.now().toString().slice(-4)}`;
  const testOrder = await prisma.order.create({
    data: {
      orderNumber: testOrderNumber,
      tenantId: tenant.id,
      customerId: testProfile.id,
      subtotal: 1000.0,
      vatRate: 20.0,
      vatAmount: 200.0,
      totalAmount: 1200.0,
      status: 'PENDING_APPROVAL',
      paymentMethod: 'CURRENT_ACCOUNT',
      items: {
        create: [
          {
            tenantProductId: tenantProduct.id,
            quantity: 2,
            unitPrice: 500.0,
            totalPrice: 1000.0
          }
        ]
      },
      stockMovements: {
        create: [
          {
            tenantId: tenant.id,
            tenantProductId: tenantProduct.id,
            quantityChange: -2,
            type: 'SALE',
            note: 'Test arda sipariş düşümü'
          }
        ]
      },
      returnRequests: {
        create: [
          {
            tenantId: tenant.id,
            customerId: testProfile.id,
            reason: 'Test İade Sebebi',
            status: 'Bekliyor'
          }
        ]
      }
    }
  });

  // Cari Hareket Kaydı
  await prisma.customerLedger.create({
    data: {
      tenantId: tenant.id,
      customerId: testProfile.id,
      type: 'DEBIT',
      amount: 1200.0,
      balanceAfter: 1200.0,
      description: `Sipariş #${testOrderNumber} Tutarı`
    }
  });

  console.log(`✅ Test Siparişi Oluşturuldu: Sipariş No=${testOrderNumber}, ID=${testOrder.id}`);

  // Varlık Kontrolü
  const itemsBefore = await prisma.orderItem.count({ where: { orderId: testOrder.id } });
  const stockBefore = await prisma.stockMovement.count({ where: { orderId: testOrder.id } });
  const returnsBefore = await prisma.returnRequest.count({ where: { orderId: testOrder.id } });
  const ledgersBefore = await prisma.customerLedger.count({ where: { customerId: testProfile.id } });

  assert.strictEqual(itemsBefore, 1, 'OrderItem oluşturulmuş olmalı');
  assert.strictEqual(stockBefore, 1, 'StockMovement oluşturulmuş olmalı');
  assert.strictEqual(returnsBefore, 1, 'ReturnRequest oluşturulmuş olmalı');
  assert.strictEqual(ledgersBefore, 1, 'CustomerLedger oluşturulmuş olmalı');
  console.log(`🔍 Doğrulama: Tüm alt ilişkisel kayıtlar veritabanında aktif.\n`);

  // 4. Cascade Temizleme Betiğini Çalıştır
  console.log('🚀 cleanArdaTestOrders() fonksiyonu çağrılıyor...');
  const result = await cleanArdaTestOrders({ silent: false });

  // 5. Test Kayıtlarının Tamamen Silindiğini ve Veritabanı Bütünlüğünü Doğrula
  const orderAfter = await prisma.order.findUnique({ where: { id: testOrder.id } });
  assert.strictEqual(orderAfter, null, 'Test siparişi tamamen silinmiş olmalı');

  const itemsAfter = await prisma.orderItem.count({ where: { orderId: testOrder.id } });
  assert.strictEqual(itemsAfter, 0, 'Siparişe bağlı OrderItem kayıtları silinmiş olmalı');

  const stockAfter = await prisma.stockMovement.count({ where: { orderId: testOrder.id } });
  assert.strictEqual(stockAfter, 0, 'Siparişe bağlı StockMovement kayıtları silinmiş olmalı');

  const returnsAfter = await prisma.returnRequest.count({ where: { orderId: testOrder.id } });
  assert.strictEqual(returnsAfter, 0, 'Siparişe bağlı ReturnRequest kayıtları silinmiş olmalı');

  const profileAfter = await prisma.customerProfile.findUnique({ where: { id: testProfile.id } });
  assert.strictEqual(profileAfter, null, 'Test müşteri profili silinmiş olmalı');

  const ledgersAfter = await prisma.customerLedger.count({ where: { customerId: testProfile.id } });
  assert.strictEqual(ledgersAfter, 0, 'Test müşterisinin cari kayıtları silinmiş olmalı');

  const userAfter = await prisma.user.findUnique({ where: { id: testUser.id } });
  assert.strictEqual(userAfter, null, 'Test müşteri kullanıcısı silinmiş olmalı');

  console.log('================================================================');
  console.log('🎉 TÜM DOĞRULAMA TESTLERİ BAŞARIYLA GEÇTİ!');
  console.log('   - Test siparişleri ilişkisel olarak (cascade) silindi.');
  console.log('   - Veritabanı bütünlüğü (foreign keys & integrity) korundu.');
  console.log('   - 0 test siparişi veya artık veri bırakılmadı.');
  console.log('================================================================');

  await prisma.$disconnect();
}

testCascadeClean().catch(async (err) => {
  console.error('❌ Test Hatası:', err);
  await prisma.$disconnect();
  process.exit(1);
});
