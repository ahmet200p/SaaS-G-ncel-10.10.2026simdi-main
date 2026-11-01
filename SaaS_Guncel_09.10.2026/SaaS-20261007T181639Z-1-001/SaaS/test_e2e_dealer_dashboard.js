/**
 * ============================================================================
 * E2E TEST: Bayi Yönetim Paneli (bayi.html) Dashboard & Siparişler Doğrulaması
 * Dosya: test_e2e_dealer_dashboard.js
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const app = require('./app');

let server;
let serverPort;

function startTestServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      console.log(`[TEST_SERVER] Express test sunucusu 127.0.0.1:${serverPort} üzerinde başlatıldı.`);
      resolve();
    });
    server.on('error', reject);
  });
}

function stopTestServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('[TEST_SERVER] Test sunucusu kapatıldı.');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

async function request(endpoint, options = {}) {
  const url = `http://127.0.0.1:${serverPort}${endpoint}`;
  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  };
  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOptions);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 BAYİ DASHBOARD & SİPARİŞLER (PROMPT.MD) E2E TESTİ');
  console.log('====================================================');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Test başarısız: ${message}`);
    }
  }

  try {
    // 1. ADIM: Prisma Şeması Kontrolü (schema.prisma)
    console.log('\n--- 1. ADIM: Prisma Şeması Kontrolü ---');
    const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
    assert(fs.existsSync(schemaPath), 'prisma/schema.prisma dosyası mevcut');

    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    assert(schemaContent.includes('model Order'), 'Order modeli tanımlı');
    assert(schemaContent.includes('model OrderItem'), 'OrderItem modeli tanımlı');
    assert(schemaContent.includes('tenantId       String'), 'Order modelinde tenantId alanı mevcut');
    assert(schemaContent.includes('customerId     String'), 'Order modelinde customerId alanı mevcut');
    assert(schemaContent.includes('totalAmount    Float'), 'Order modelinde totalAmount (Float) alanı mevcut');
    assert(schemaContent.includes('@default("PENDING")') || schemaContent.includes('@default("PENDING_APPROVAL")'), 'Order modelinde status (varsayılan PENDING veya PENDING_APPROVAL) alanı mevcut');
    assert(schemaContent.includes('createdAt      DateTime        @default(now())'), 'Order modelinde createdAt (DateTime) alanı mevcut');

    // Sunucuyu başlat
    await startTestServer();

    // 2. Bayi Yöneticisi Girişi (ahmet@ahmetoto.com)
    console.log('\n--- 2. Bayi Yöneticisi Oturum Doğrulaması ---');
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'ahmet@ahmetoto.com',
        password: '123456'
      }
    });

    assert(loginRes.status === 200, 'POST /api/auth/login HTTP 200 döndü');
    assert(loginRes.data && loginRes.data.success === true, 'Giriş başarılı (success: true)');
    assert(loginRes.data.token && typeof loginRes.data.token === 'string', 'JWT token üretildi');
    const token = loginRes.data.token;

    const authHeaders = { Authorization: `Bearer ${token}` };

    // 3. GET /api/tenant/stats (KPI İstatistikleri)
    console.log('\n--- 3. GET /api/tenant/stats (KPI İstatistikleri) ---');
    const statsRes = await request('/api/tenant/stats', { headers: authHeaders });
    assert(statsRes.status === 200, 'GET /api/tenant/stats HTTP 200 döndü');
    assert(statsRes.data && statsRes.data.success === true, 'Stats yanıtı başarılı (success: true)');
    assert(typeof statsRes.data.data.pendingOrders === 'number', 'pendingOrders sayısal değer döndü');
    assert(typeof statsRes.data.data.todayRevenue === 'number', 'todayRevenue sayısal değer döndü');
    assert(typeof statsRes.data.data.registeredCustomers === 'number', 'registeredCustomers sayısal değer döndü');
    console.log(`     -> Bekleyen Siparişler: ${statsRes.data.data.pendingOrders}, Bugünkü Ciro: ${statsRes.data.data.todayRevenue} ₺, Müşteri: ${statsRes.data.data.registeredCustomers}`);

    // Alias kontrolü: GET /api/tenant/dashboard-stats
    const aliasRes = await request('/api/tenant/dashboard-stats', { headers: authHeaders });
    assert(aliasRes.status === 200 && aliasRes.data.success === true, 'GET /api/tenant/dashboard-stats alias uç noktası çalışıyor');

    // 4. GET /api/tenant/orders (Siparişler Listesi)
    console.log('\n--- 4. GET /api/tenant/orders (Siparişler Listesi) ---');
    let ordersRes = await request('/api/tenant/orders', { headers: authHeaders });
    assert(ordersRes.status === 200, 'GET /api/tenant/orders HTTP 200 döndü');
    assert(ordersRes.data && Array.isArray(ordersRes.data.data), 'Siparişler bir dizi olarak döndü');

    if (ordersRes.data.data.length === 0) {
      const prisma = require('./lib/prisma');
      const tenantId = loginRes.data.user?.tenantId || (loginRes.data.tenant && loginRes.data.tenant.id);
      let cust = await prisma.customerProfile.findFirst({ where: { tenantId } });
      if (!cust) {
        let custUser = await prisma.user.findFirst({ where: { role: 'CUSTOMER', tenantId } });
        if (!custUser) {
          custUser = await prisma.user.create({
            data: {
              email: `servis_dash_${Date.now()}@oto.com`,
              password: 'hashedpassword',
              role: 'CUSTOMER',
              tenantId
            }
          });
        }
        cust = await prisma.customerProfile.create({
          data: {
            userId: custUser.id,
            tenantId,
            companyName: 'Test Servis A.Ş.',
            phone: '05551112233'
          }
        });
      }
      let tp = await prisma.tenantProduct.findFirst({ where: { tenantId } });
      if (!tp) {
        let prod = await prisma.product.findFirst();
        if (!prod) {
          prod = await prisma.product.create({
            data: {
              name: 'Fren Balatası',
              oeNumber: `OE-12345-${Date.now()}`,
              category: 'Fren Sistemi',
              defaultPrice: 500
            }
          });
        }
        tp = await prisma.tenantProduct.create({
          data: {
            tenantId,
            productId: prod.id,
            stock: 50,
            customPrice: 500
          }
        });
      }
      if (cust && tp) {
        await prisma.order.create({
          data: {
            orderNumber: `SP-TEST-${Date.now().toString(36).toUpperCase()}`,
            tenantId: tenantId,
            customerId: cust.id,
            subtotal: 1000,
            vatRate: 20,
            vatAmount: 200,
            totalAmount: 1200,
            status: 'PENDING',
            items: {
              create: [
                {
                  tenantProductId: tp.id,
                  quantity: 2,
                  unitPrice: 500,
                  totalPrice: 1000
                }
              ]
            }
          }
        });
        ordersRes = await request('/api/tenant/orders', { headers: authHeaders });
      }
    }

    assert(ordersRes.data.data.length >= 1, `En az 1 sipariş listelendi (Toplam: ${ordersRes.data.data.length})`);

    const firstOrder = ordersRes.data.data[0];
    assert(firstOrder.id && firstOrder.orderNumber, 'Sipariş nesnesi ID ve orderNumber içeriyor');
    assert(firstOrder.customer && firstOrder.customer.companyName, 'Sipariş müşteri şirket adını içeriyor');
    assert(Array.isArray(firstOrder.items), 'Sipariş kalemleri items dizisi içeriyor');

    // 5. GET /api/tenant/orders/:id (Tekil Sipariş Detayı)
    console.log('\n--- 5. GET /api/tenant/orders/:id (Tekil Sipariş Detayı) ---');
    const singleOrderRes = await request(`/api/tenant/orders/${firstOrder.id}`, { headers: authHeaders });
    assert(singleOrderRes.status === 200, 'GET /api/tenant/orders/:id HTTP 200 döndü');
    assert(singleOrderRes.data.data.id === firstOrder.id, 'Doğru sipariş detayı getirildi');

    // 6. PATCH /api/tenant/orders/:id/status (Siparişi Onayla)
    console.log('\n--- 6. PATCH /api/tenant/orders/:id/status (Siparişi Onayla) ---');
    const pendingOrder = ordersRes.data.data.find(o => o.status === 'PENDING') || firstOrder;
    const patchRes = await request(`/api/tenant/orders/${pendingOrder.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { status: 'APPROVED' }
    });
    assert(patchRes.status === 200, 'PATCH /api/tenant/orders/:id/status HTTP 200 döndü');
    assert(patchRes.data && patchRes.data.success === true, 'Durum güncellemesi başarılı');
    assert(patchRes.data.data.status === 'APPROVED', 'Sipariş durumu "APPROVED" olarak güncellendi');

    // 7. Frontend bayi.html Arayüz Kontrolü
    console.log('\n--- 7. Frontend bayi.html Arayüz Kontrolü ---');
    const bayiHtmlPath = path.join(__dirname, 'bayi.html');
    assert(fs.existsSync(bayiHtmlPath), 'bayi.html dosyası mevcut');

    const bayiHtml = fs.readFileSync(bayiHtmlPath, 'utf-8');
    assert(bayiHtml.includes('id="kpi-pending-orders"'), 'kpi-pending-orders kimliği mevcut');
    assert(bayiHtml.includes('id="kpi-today-revenue"'), 'kpi-today-revenue kimliği mevcut');
    assert(bayiHtml.includes('id="kpi-customer-count"'), 'kpi-customer-count kimliği mevcut');
    assert(bayiHtml.includes('id="menu-badge-orders"'), 'menu-badge-orders bildirim rozeti mevcut');
    assert(bayiHtml.includes('id="section-orders-badge"'), 'section-orders-badge başlık rozeti mevcut');
    assert(bayiHtml.includes('id="table-recent-orders"'), 'table-recent-orders tablosu mevcut');
    assert(bayiHtml.includes('id="order-drawer"'), 'order-drawer sipariş detay çekmecesi mevcut');
    assert(bayiHtml.includes('loadDashboard'), 'loadDashboard fonksiyon çağrısı mevcut');
    assert(bayiHtml.includes('approveOrder'), 'approveOrder fonksiyonu mevcut');
    assert(bayiHtml.includes('showOrderDetail'), 'showOrderDetail fonksiyonu mevcut');

    console.log('\n====================================================');
    console.log(`🎉 TÜM TESTLER BAŞARIYLA TAMAMLANDI! (${passed}/${total})`);
    console.log('====================================================\n');

  } finally {
    await stopTestServer();
  }
}

runTests().catch(err => {
  console.error('\n❌ E2E TESTİ SIRASINDA KRİTİK HATA:', err);
  process.exit(1);
});
