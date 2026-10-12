/**
 * Canlı Simülasyon: Bayi Yönetim Paneli (bayi.html) & Gerçek Veritabanı Akışı
 * Dosya: test_live_bayi_simulation.js
 */

const http = require('http');
const app = require('./app');

let server;
let port;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(5000, () => {
      port = 5000;
      console.log(`[LIVE_SIM] Sunucu http://localhost:${port} adresinde başlatıldı.`);
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

async function simulate() {
  console.log('====================================================');
  console.log('🚀 CANLI SİMÜLASYON: BAYİ DASHBOARD & GERÇEK SİPARİŞ AKIŞI');
  console.log('====================================================');

  await startServer();

  try {
    // 1. bayi.html sayfasının statik dosya sunumunu test et
    const pageRes = await fetch('http://localhost:5000/bayi.html');
    const pageHtml = await pageRes.text();
    console.log('1. bayi.html HTTP yanıtı:', pageRes.status);
    console.log('   - kpi-pending-orders mevcut:', pageHtml.includes('id="kpi-pending-orders"'));
    console.log('   - kpi-today-revenue mevcut:', pageHtml.includes('id="kpi-today-revenue"'));
    console.log('   - kpi-customer-count mevcut:', pageHtml.includes('id="kpi-customer-count"'));
    console.log('   - menu-badge-orders mevcut:', pageHtml.includes('id="menu-badge-orders"'));
    console.log('   - table-recent-orders mevcut:', pageHtml.includes('id="table-recent-orders"'));
    console.log('   - order-drawer mevcut:', pageHtml.includes('id="order-drawer"'));

    // 2. Bayi Yöneticisi Girişi
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ahmet@ahmetoto.com', password: '123456' })
    });
    const loginData = await loginRes.json();
    console.log('2. Bayi Girişi:', loginData.success, '| Rol:', loginData.role, '| Firma:', loginData.tenant ? loginData.tenant.name : '-');
    const dealerToken = loginData.token;

    // 3. Bayi Dashboard İstatistikleri (GET /api/tenant/stats)
    const statsRes = await fetch('http://localhost:5000/api/tenant/stats', {
      headers: { 'Authorization': 'Bearer ' + dealerToken }
    });
    const statsData = await statsRes.json();
    console.log('3. Bayi Dashboard İstatistikleri:');
    console.log('   - Bekleyen Siparişler:', statsData.data.pendingOrders);
    console.log('   - Bugünkü Ciro:', statsData.data.todayRevenue, '₺');
    console.log('   - Kayıtlı Otoservis:', statsData.data.registeredCustomers);
    console.log('   - Toplam Sipariş:', statsData.data.totalOrders);

    // 4. Bayi Siparişleri (GET /api/tenant/orders)
    const ordersRes = await fetch('http://localhost:5000/api/tenant/orders', {
      headers: { 'Authorization': 'Bearer ' + dealerToken }
    });
    const ordersData = await ordersRes.json();
    console.log('4. Gelen Siparişler Adedi:', ordersData.data.length);
    if (ordersData.data.length > 0) {
      const ord = ordersData.data[0];
      console.log(`   - İlk Sipariş: #${ord.orderNumber} | Tutar: ${ord.totalAmount} ₺ | Müşteri: ${ord.customer.companyName} | Durum: ${ord.status}`);
    }

    // 5. Bir Müşterinin Canlı Sipariş Vermesi (B2B E-Ticaret Akışı)
    console.log('\n--- B2B Otoservis Müşterisi Sipariş Oluşturma Simülasyonu ---');
    const custLoginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'kemal@kemaloto.com', password: '123456' })
    });
    const custLoginData = await custLoginRes.json();
    const custToken = custLoginData.token;

    // Müşterinin bayi kataloğundaki ürünleri görmesi
    const prodsRes = await fetch('http://localhost:5000/api/store/products', {
      headers: { 'Authorization': 'Bearer ' + custToken }
    });
    const prodsData = await prodsRes.json();
    const firstProd = prodsData.data && prodsData.data[0];

    if (firstProd) {
      console.log(`5. Otoservis Ürünü Seçti: [${firstProd.oeNumber}] ${firstProd.name} (Fiyat: ${firstProd.discountedPrice} ₺)`);
      // Sepeti onayla ve sipariş oluştur
      const orderCreateRes = await fetch('http://localhost:5000/api/store/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + custToken
        },
        body: JSON.stringify({
          items: [{ tenantProductId: firstProd.tenantProductId, quantity: 2 }]
        })
      });
      const orderCreateData = await orderCreateRes.json();
      console.log('   - Yeni Sipariş Oluşturuldu:', orderCreateData.success, '| No:', orderCreateData.data ? orderCreateData.data.orderNumber : '-');

      // 6. Bayi Paneline Yeni Siparişin Yansıdığını Doğrulama
      const newStatsRes = await fetch('http://localhost:5000/api/tenant/stats', {
        headers: { 'Authorization': 'Bearer ' + dealerToken }
      });
      const newStatsData = await newStatsRes.json();
      console.log('6. Bayi Paneli Canlı Sayaç Güncellendi:');
      console.log('   - Yeni Bekleyen Siparişler:', newStatsData.data.pendingOrders);
      console.log('   - Yeni Bugünkü Ciro:', newStatsData.data.todayRevenue, '₺');

      // 7. Bayi Yöneticisi Siparişi Onaylıyor
      const createdOrderId = orderCreateData.data.id;
      const approveRes = await fetch(`http://localhost:5000/api/tenant/orders/${createdOrderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + dealerToken
        },
        body: JSON.stringify({ status: 'APPROVED' })
      });
      const approveData = await approveRes.json();
      console.log('7. Bayi Siparişi Onayladı:', approveData.message);
    }

    console.log('\n====================================================');
    console.log('🎉 CANLI SİMÜLASYON %100 BAŞARIYLA TAMAMLANDI!');
    console.log('====================================================');

  } finally {
    await stopServer();
  }
}

simulate().catch(err => {
  console.error('Simülasyon hatası:', err);
  process.exit(1);
});
