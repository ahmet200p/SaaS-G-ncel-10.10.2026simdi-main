/**
 * ============================================================================
 * Doğrulama Testi: Dashboard Canlı KPI ve Anti-Cache Başlıkları Testi
 * Dosya: test_dashboard_stats_live_anti_cache.js
 * ============================================================================
 */

require('dotenv').config();
const assert = require('assert');

async function testLiveDashboardStats() {
  console.log('================================================================');
  console.log('🧪 TEST: Canlı Dashboard KPI & Anti-Cache Başlıkları Doğrulaması');
  console.log('================================================================\n');

  const baseUrl = 'http://127.0.0.1:5000';

  // 1. Bayi Girişi (Ahmet Oto)
  console.log('🔑 Bayi oturumu açılıyor (ahmet@ahmetoto.com)...');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'ahmet@ahmetoto.com',
      password: process.env.DEFAULT_DEALER_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || 'SaaS_Super_Admin_2026!#Secure'
    })
  });

  const loginData = await loginRes.json();
  assert(loginRes.ok && loginData.token, `Bayi girişi başarısız: ${JSON.stringify(loginData)}`);
  const token = loginData.token;
  console.log('✅ Bayi girişi başarılı, JWT token alındı.');

  // 2. GET /api/tenant/dashboard-stats Çağrısı
  console.log('\n📊 GET /api/tenant/dashboard-stats çağrılıyor...');
  const statsRes = await fetch(`${baseUrl}/api/tenant/dashboard-stats?_t=${Date.now()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  assert.strictEqual(statsRes.status, 200, 'dashboard-stats HTTP 200 dönmelidir');

  // Anti-cache başlıkları doğrulaması
  const cacheControl = statsRes.headers.get('cache-control') || '';
  const pragma = statsRes.headers.get('pragma') || '';
  console.log(`🔒 Cache-Control Başlığı: "${cacheControl}"`);
  console.log(`🔒 Pragma Başlığı: "${pragma}"`);

  assert(cacheControl.includes('no-store'), 'Cache-Control header "no-store" içermelidir');
  assert(cacheControl.includes('no-cache'), 'Cache-Control header "no-cache" içermelidir');
  assert.strictEqual(pragma, 'no-cache', 'Pragma header "no-cache" olmalıdır');
  console.log('✅ Anti-Cache başlıkları doğrulandı (önbellek takılma riski sıfırlandı).');

  const json = await statsRes.json();
  assert(json.success === true, 'dashboard-stats success: true dönmeli');
  const stats = json.data;
  console.log('\n📈 Gelen Canlı Sayaç Değerleri:');
  console.log(`   - Bekleyen Siparişler: ${stats.pendingCount} (alias: ${stats.pendingOrders})`);
  console.log(`   - Bugünkü Ciro:       ${stats.todayRevenue} ₺`);
  console.log(`   - Kayıtlı Otoservis:  ${stats.customerCount} (alias: ${stats.registeredCustomers})`);
  console.log(`   - Son Sipariş Sayısı:  ${stats.recentOrders?.length || 0}`);

  // Test müşteri 'arda' ya da '1111111111' kontrolü
  if (Array.isArray(stats.recentOrders)) {
    stats.recentOrders.forEach(o => {
      const custName = (o.customer?.companyName || '').toLowerCase();
      const custPhone = o.customer?.phone || '';
      assert(!custName.includes('arda'), `Son siparişlerde 'arda' test kaydı bulunmamalı! (Bulunan: ${custName})`);
      assert(!custPhone.includes('1111111111'), `Son siparişlerde '1111111111' test telefonu bulunmamalı! (Bulunan: ${custPhone})`);
    });
    console.log('✅ Son siparişlerde test kullanıcısı "arda" veya "1111111111" bulunmuyor.');
  }

  // 3. GET /api/tenant/orders Çağrısı
  console.log('\n📦 GET /api/tenant/orders çağrılıyor...');
  const ordersRes = await fetch(`${baseUrl}/api/tenant/orders?_t=${Date.now()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  assert.strictEqual(ordersRes.status, 200, 'GET /orders HTTP 200 dönmelidir');
  const ordersCacheControl = ordersRes.headers.get('cache-control') || '';
  assert(ordersCacheControl.includes('no-store'), 'GET /orders Cache-Control no-store içermelidir');

  const ordersJson = await ordersRes.json();
  assert(ordersJson.success === true, 'orders success: true dönmeli');
  console.log(`✅ Sipariş listesi canlı çekildi, toplam ${ordersJson.data?.length || 0} sipariş mevcut.`);

  if (Array.isArray(ordersJson.data)) {
    ordersJson.data.forEach(o => {
      const custName = (o.customer?.companyName || '').toLowerCase();
      const custPhone = o.customer?.phone || '';
      assert(!custName.includes('arda'), `Sipariş listesinde 'arda' test kaydı bulunmamalı!`);
      assert(!custPhone.includes('1111111111'), `Sipariş listesinde '1111111111' test telefonu bulunmamalı!`);
    });
    console.log('✅ Tüm sipariş listesinde "arda" / "1111111111" kaydı kalmadığı teyit edildi.');
  }

  console.log('\n================================================================');
  console.log('🎉 TÜM CANLI DASHBOARD & ANTİ-CACHE TESTLERİ BAŞARIYLA GEÇTİ!');
  console.log('================================================================');
}

testLiveDashboardStats().catch(err => {
  console.error('❌ Test Başarısız:', err);
  process.exit(1);
});
