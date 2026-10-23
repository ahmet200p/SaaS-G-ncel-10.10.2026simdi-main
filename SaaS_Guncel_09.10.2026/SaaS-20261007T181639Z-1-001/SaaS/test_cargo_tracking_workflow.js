require('dotenv').config();
const http = require('http');
const app = require('./app');
const prisma = require('./lib/prisma');
const jwt = require('jsonwebtoken');
const config = require('./config');

let server;
let port;

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: body });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runCargoTest() {
  console.log('====================================================');
  console.log('🚚 LOJİSTİK & KARGO TAKİP UÇTAN UCA ENTEGRASYON TESTİ');
  console.log('====================================================\n');

  server = http.createServer(app);
  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      console.log(`[TEST_SUNUCU] Test sunucusu 127.0.0.1:${port} üzerinde dinliyor.`);
      resolve();
    });
  });

  try {
    // 1. Tenant ve Ürün Bul
    const tenant = await prisma.tenant.findFirst({
      where: {
        isActive: true,
        tenantProducts: { some: {} }
      },
      include: {
        users: true,
        tenantProducts: { include: { product: true } }
      }
    });

    if (!tenant) throw new Error('Aktif bayi bulunamadı.');
    const tenantUser = tenant.users.find(u => u.role === 'TENANT_ADMIN') || tenant.users[0];
    const tenantProduct = tenant.tenantProducts[0];

    // 2. Müşteri Bul
    const customer = await prisma.customerProfile.findFirst({
      where: { tenantId: tenant.id },
      include: { user: true }
    });
    if (!customer) throw new Error('Test müşterisi bulunamadı.');

    const tenantToken = jwt.sign(
      { id: tenantUser.id, email: tenantUser.email, role: 'TENANT_ADMIN', tenantId: tenant.id },
      config.JWT_SECRET || 'super-secret-jwt-key-auto-spare-parts-saas-2026',
      { expiresIn: '1d' }
    );

    const customerToken = jwt.sign(
      { id: customer.userId, email: customer.user ? customer.user.email : 'cust@test.com', role: 'CUSTOMER', tenantId: tenant.id },
      config.JWT_SECRET || 'super-secret-jwt-key-auto-spare-parts-saas-2026',
      { expiresIn: '1d' }
    );

    // 3. Test Siparişi Oluştur (Durum: PROCESSING / Hazırlanıyor)
    const testOrder = await prisma.order.create({
      data: {
        orderNumber: `CARGO-TEST-${Date.now().toString().slice(-6)}`,
        tenantId: tenant.id,
        customerId: customer.id,
        subtotal: 1000,
        vatAmount: 200,
        totalAmount: 1200,
        status: 'PROCESSING',
        paymentMethod: 'CURRENT_ACCOUNT',
        items: {
          create: [
            {
              tenantProductId: tenantProduct.id,
              quantity: 1,
              unitPrice: 1000,
              totalPrice: 1000
            }
          ]
        }
      }
    });

    console.log(`1. Test Siparişi Hazırlandı: #${testOrder.orderNumber} (Durum: ${testOrder.status})`);

    // 4. Bayi Siparişi Kargoya Veriyor (PUT /api/tenant/orders/:id/status)
    const testCargoCompany = 'Yurtiçi Kargo';
    const testTrackingNumber = '987654321012';

    console.log(`\n2. Bayi Siparişi Kargoya Veriyor: ${testCargoCompany} - ${testTrackingNumber}`);
    const shipRes = await request({
      hostname: '127.0.0.1',
      port,
      path: `/api/tenant/orders/${testOrder.id}/status`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantToken}`
      }
    }, {
      status: 'SHIPPED',
      cargoCompany: testCargoCompany,
      trackingNumber: testTrackingNumber
    });

    if (shipRes.status === 200 && shipRes.data && shipRes.data.success) {
      console.log('  ✅ [PASS] Bayi API kargolama yanıtı başarılı (HTTP 200).');
      console.log('  - Mesaj:', shipRes.data.message);
    } else {
      throw new Error(`Kargolama API isteği başarısız: ${JSON.stringify(shipRes)}`);
    }

    // 5. Veritabanı Doğrulaması
    console.log('\n3. Veritabanı Alanlarının Doğrulanması (Prisma findUnique):');
    const dbOrder = await prisma.order.findUnique({
      where: { id: testOrder.id }
    });

    console.log(`  - DB Durum: ${dbOrder.status} (Beklenen: SHIPPED)`);
    console.log(`  - DB Kargo Firması: ${dbOrder.cargoCompany} (Beklenen: ${testCargoCompany})`);
    console.log(`  - DB Takip Numarası: ${dbOrder.trackingNumber} (Beklenen: ${testTrackingNumber})`);

    if (
      dbOrder.status === 'SHIPPED' &&
      dbOrder.cargoCompany === testCargoCompany &&
      dbOrder.trackingNumber === testTrackingNumber
    ) {
      console.log('  ✅ [PASS] Kargo bilgileri veritabanında eksiksiz ve doğru kaydedildi.');
    } else {
      throw new Error('Veritabanındaki kargo bilgileri uyuşmuyor!');
    }

    // 6. Müşteri Vitrin API Doğrulaması (GET /api/store/orders)
    console.log('\n4. Müşteri Vitrini API Kontrolü (GET /api/store/orders):');
    const storeOrdersRes = await request({
      hostname: '127.0.0.1',
      port,
      path: '/api/store/orders',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${customerToken}`
      }
    });

    if (storeOrdersRes.status === 200 && Array.isArray(storeOrdersRes.data.data)) {
      const orderInStore = storeOrdersRes.data.data.find(o => o.id === testOrder.id);
      if (orderInStore && orderInStore.cargoCompany === testCargoCompany && orderInStore.trackingNumber === testTrackingNumber) {
        console.log(`  ✅ [PASS] Müşteri vitrininde kargo firması (${orderInStore.cargoCompany}) ve takip no (${orderInStore.trackingNumber}) doğrulandı.`);
      } else {
        throw new Error('Müşteri vitrini siparişinde kargo bilgisi eksik!');
      }
    } else {
      throw new Error(`Müşteri siparişleri listelenemedi: ${JSON.stringify(storeOrdersRes)}`);
    }

    // 7. Bayi Detay API Doğrulaması (GET /api/tenant/orders/:id)
    console.log('\n5. Bayi Detay API Kontrolü (GET /api/tenant/orders/:id):');
    const tenantDetailRes = await request({
      hostname: '127.0.0.1',
      port,
      path: `/api/tenant/orders/${testOrder.id}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tenantToken}`
      }
    });

    if (tenantDetailRes.status === 200 && tenantDetailRes.data.data) {
      const detail = tenantDetailRes.data.data;
      if (detail.cargoCompany === testCargoCompany && detail.trackingNumber === testTrackingNumber) {
        console.log(`  ✅ [PASS] Bayi panel detayında kargo firması (${detail.cargoCompany}) ve takip no (${detail.trackingNumber}) doğrulandı.`);
      } else {
        throw new Error('Bayi detayında kargo bilgisi eksik!');
      }
    } else {
      throw new Error(`Bayi sipariş detayı alınamadı: ${JSON.stringify(tenantDetailRes)}`);
    }

    // Temizlik
    await prisma.orderItem.deleteMany({ where: { orderId: testOrder.id } });
    await prisma.order.deleteMany({ where: { id: testOrder.id } });
    console.log('\n🧹 Test verisi temizlendi.');

    console.log('\n====================================================');
    console.log('🎉 TÜM LOJİSTİK & KARGO TAKİP TESTLERİ %100 BAŞARILI!');
    console.log('====================================================');

  } catch (err) {
    console.error('\n❌ TEST HATASI:', err);
  } finally {
    if (server) server.close();
    await prisma.$disconnect();
  }
}

runCargoTest();
