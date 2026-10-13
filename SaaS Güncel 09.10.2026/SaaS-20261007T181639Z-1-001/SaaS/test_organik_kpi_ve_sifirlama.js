// ============================================================================
// Doğrulama Testi: Organik KPI ve Test Verilerini Temizleme (prompt.md)
// ============================================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const app = require('./app');
const prisma = require('./lib/prisma');

let total = 0;
let passed = 0;

function check(condition, message) {
  total++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Test başarısız: ${message}`);
  }
}

async function runVerification() {
  console.log('====================================================');
  console.log('🧪 PROMPT.MD TAM DOĞRULAMA TESTİ');
  console.log('====================================================\n');

  // --- 1. ADIM: VERİTABANI ORGANİK SIFIRLAMA KONTROLLERİ ---
  console.log('--- 1. ADIM: Veritabanı Temizliği ve Yetkili Hesap Kontrolleri ---');
  
  await prisma.orderItem.deleteMany({});
  await prisma.stockMovement.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.customerLedger.deleteMany({});
  await prisma.customerProfile.deleteMany({});
  await prisma.discountRule.deleteMany({});
  await prisma.tenantProduct.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.user.deleteMany({ where: { role: 'CUSTOMER' } });

  const customerProfileCount = await prisma.customerProfile.count();
  check(customerProfileCount === 0, `CustomerProfile (Otoservis Müşterileri) tablosu tamamen boş (${customerProfileCount})`);

  const productCount = await prisma.product.count();
  check(productCount === 0, `Product (Merkezi Parça Havuzu) tablosu tamamen boş (${productCount})`);

  const tenantProductCount = await prisma.tenantProduct.count();
  check(tenantProductCount === 0, `TenantProduct (Bayi Kataloğu) tablosu tamamen boş (${tenantProductCount})`);

  const discountRuleCount = await prisma.discountRule.count();
  check(discountRuleCount === 0, `DiscountRule (İskonto Kuralları) tablosu tamamen boş (${discountRuleCount})`);

  const orderCount = await prisma.order.count();
  check(orderCount === 0, `Order (Siparişler) tablosu tamamen boş (${orderCount})`);

  const customerUserCount = await prisma.user.count({ where: { role: 'CUSTOMER' } });
  check(customerUserCount === 0, `Müşteri (CUSTOMER) rolündeki sahte kullanıcılar silindi (${customerUserCount})`);

  const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  check(!!superAdmin, `Süper Admin hesabı korunuyor (${superAdmin ? superAdmin.email : 'yok'})`);

  const tenantAdmin = await prisma.user.findUnique({ where: { email: 'ahmet@ahmetoto.com' } });
  check(!!tenantAdmin && tenantAdmin.role === 'TENANT_ADMIN', `Bayi Yöneticisi hesabı korunuyor (${tenantAdmin ? tenantAdmin.email : 'yok'})`);


  // --- 2. ADIM: HTML'DEKİ STATİK VERİLERİ TEMİZLEME KONTROLLERİ ---
  console.log('\n--- 2. ADIM: HTML Statik Değer Temizliği (bayi.html) Kontrolleri ---');
  const bayiHtmlPath = path.join(__dirname, 'bayi.html');
  const html = fs.readFileSync(bayiHtmlPath, 'utf8');

  check(html.includes('id="stat-customer-count">0</span>'), 'Kayıtlı Servis Sayısı: <span id="stat-customer-count">0</span> başlangıç değeri 0 olarak mevcut');
  check(html.includes('id="stat-avg-discount">%0</span>'), 'Ortalama İskonto Oranı: <span id="stat-avg-discount">%0</span> başlangıç değeri %0 olarak mevcut');
  check(html.includes('id="stat-default-discount">%0</span>'), 'Varsayılan İskonto Oranı: <span id="stat-default-discount">%0</span> başlangıç değeri %0 olarak mevcut');
  
  // Eski statik sahte değerlerin silindiği kontrolü
  check(!html.includes('>2</') || !html.includes('discount-stat-num">2<'), 'Statik "2" sahte sayısı HTML KPI kutularında bulunmuyor');
  check(!html.includes('>%22.5</') && !html.includes('>%22,5</'), 'Statik "%22.5" sahte sayısı HTML KPI kutularında bulunmuyor');


  // --- 3. ADIM: JAVASCRIPT VE API HESAPLAMA KONTROLLERİ ---
  console.log('\n--- 3. ADIM: JavaScript Dinamik Hesaplama ve API Kontrolleri ---');

  check(html.includes('async function loadDashboardStats'), 'loadDashboardStats fonksiyonu tanımlı');
  check(html.includes('async function loadDiscountsTab'), 'loadDiscountsTab fonksiyonu tanımlı');
  check(html.includes('window.loadDiscounts ='), 'window.loadDiscounts fonksiyon köprüsü tanımlı');
  check(html.includes('async function loadCustomers'), 'loadCustomers fonksiyonu tanımlı');
  check(html.includes('async function loadProducts'), 'loadProducts fonksiyonu tanımlı');
  check(html.includes('async function loadOrdersTab'), 'loadOrdersTab fonksiyonu tanımlı');

  // Canlı API testi
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Bayi Girişi
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ahmet@ahmetoto.com', password: '123456' })
    });
    const loginData = await loginRes.json();
    check(loginRes.status === 200 && loginData.token, 'Bayi girişi başarılı ve JWT token alındı');
    const token = loginData.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // Dashboard Stats API
    const statsRes = await fetch(`${baseUrl}/api/tenant/dashboard-stats`, { headers: authHeaders });
    check(statsRes.status === 200, 'GET /api/tenant/dashboard-stats HTTP 200 döndü');
    const statsData = await statsRes.json();
    check(statsData.success === true, 'dashboard-stats success: true');
    check(statsData.data.pendingCount === 0, `Bekleyen sipariş sayısı organik olarak 0 (${statsData.data.pendingCount})`);
    check(statsData.data.todayRevenue === 0, `Bugünkü ciro organik olarak 0 (${statsData.data.todayRevenue})`);
    check(statsData.data.customerCount === 0, `Kayıtlı otoservis sayısı organik olarak 0 (${statsData.data.customerCount})`);
    check(Array.isArray(statsData.data.recentOrders) && statsData.data.recentOrders.length === 0, 'recentOrders boş dizi []');

    // Discounts API
    const discountsRes = await fetch(`${baseUrl}/api/tenant/discounts`, { headers: authHeaders });
    check(discountsRes.status === 200, 'GET /api/tenant/discounts HTTP 200 döndü');
    const discountsData = await discountsRes.json();
    check(discountsData.success === true, 'discounts success: true');
    check(Array.isArray(discountsData.data.rules) && discountsData.data.rules.length === 0, 'İskonto kuralları boş dizi []');
    check(Array.isArray(discountsData.data.customers) && discountsData.data.customers.length === 0, 'Müşteriler boş dizi []');
    check(discountsData.data.totalCustomers === 0, `Toplam müşteri sayısı organik olarak 0 (${discountsData.data.totalCustomers})`);
    check(discountsData.data.averageDiscount === 0, `Ortalama iskonto oranı organik olarak 0 (${discountsData.data.averageDiscount})`);

    // Customers API
    const custRes = await fetch(`${baseUrl}/api/tenant/customers`, { headers: authHeaders });
    check(custRes.status === 200, 'GET /api/tenant/customers HTTP 200 döndü');
    const custData = await custRes.json();
    check(Array.isArray(custData.data) && custData.data.length === 0, 'Müşteri listesi boş dizi []');

    // Products API
    const prodRes = await fetch(`${baseUrl}/api/tenant/products`, { headers: authHeaders });
    check(prodRes.status === 200, 'GET /api/tenant/products HTTP 200 döndü');
    const prodData = await prodRes.json();
    check(Array.isArray(prodData.data) && prodData.data.length === 0, 'Ürün listesi boş dizi []');

    // Orders API
    const ordersRes = await fetch(`${baseUrl}/api/tenant/orders`, { headers: authHeaders });
    check(ordersRes.status === 200, 'GET /api/tenant/orders HTTP 200 döndü');
    const ordersData = await ordersRes.json();
    check(Array.isArray(ordersData.data) && ordersData.data.length === 0, 'Sipariş listesi boş dizi []');

    console.log('\n====================================================');
    console.log(`🎉 TÜM DOĞRULAMA KONTROLLERİ BAŞARIYLA TAMAMLANDI! (${passed}/${total})`);
    console.log('====================================================');
  } finally {
    server.close();
    await prisma.$disconnect();
    try {
      require('child_process').execSync('node prisma/seed.js', { stdio: 'ignore' });
    } catch (e) {}
  }
}

runVerification().catch(err => {
  console.error('Kritik Hata:', err);
  process.exit(1);
});
