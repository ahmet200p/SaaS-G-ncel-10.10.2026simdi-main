/**
 * ============================================================================
 * E2E TEST: Bayi Yönetim Paneli (bayi.html) Sekmeler & Canlı Veri API Testi
 * Dosya: test_e2e_dealer_tabs.js
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const app = fs.existsSync(path.join(__dirname, 'app.js')) ? require('./app') : require('./backend-api/app');

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
  console.log('🧪 BAYİ PANELİ SEKMELER VE ENTEGRASYON E2E TESTİ');
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
    // 1. ADIM: bayi.html Yapısal Kontrolleri
    console.log('\n--- 1. ADIM: bayi.html Sekme ve Bileşen Doğrulaması ---');
    const bayiHtmlPath = path.join(__dirname, 'bayi.html');
    assert(fs.existsSync(bayiHtmlPath), 'bayi.html dosyası mevcut');

    const html = fs.readFileSync(bayiHtmlPath, 'utf-8');

    // Prompt'ta istenen 5 sekme konteyneri kontrolü
    assert(html.includes('id="section-dashboard"') && html.includes('tenant-section active'), '1. #section-dashboard (tenant-section active) mevcut');
    assert(html.includes('id="section-orders"') && html.includes('tenant-section'), '2. #section-orders (tenant-section) mevcut');
    assert(html.includes('id="section-products"') && html.includes('tenant-section'), '3. #section-products (tenant-section) mevcut');
    assert(html.includes('id="section-customers"') && html.includes('tenant-section'), '4. #section-customers (tenant-section) mevcut');
    assert(html.includes('id="section-discount"') && html.includes('tenant-section'), '5. #section-discount (tenant-section) mevcut');

    // Sidebar butonlarının data-section tanımları
    assert(html.includes('data-section="section-dashboard"'), 'Sidebar Dashboard linki data-section="section-dashboard" içeriyor');
    assert(html.includes('data-section="section-orders"'), 'Sidebar Siparişler linki data-section="section-orders" içeriyor');
    assert(html.includes('data-section="section-products"'), 'Sidebar Ürünler linki data-section="section-products" içeriyor');
    assert(html.includes('data-section="section-customers"'), 'Sidebar Müşteriler linki data-section="section-customers" içeriyor');
    assert(html.includes('data-section="section-discount"'), 'Sidebar İskonto linki data-section="section-discount" içeriyor');

    // Müşteri tablosunda statik sahte satır kalmadığı kontrolü
    assert(!html.includes('<td>Demir Otomotiv</td>'), 'Müşteriler tablosunda statik "Demir Otomotiv" mock verisi kaldırıldı');
    assert(!html.includes('<td>Yıldız Oto Tamir</td>'), 'Müşteriler tablosunda statik "Yıldız Oto Tamir" mock verisi kaldırıldı');
    assert(!html.includes('<td>Akdeniz Servis</td>'), 'Müşteriler tablosunda statik "Akdeniz Servis" mock verisi kaldırıldı');
    assert(html.includes('id="customers-table-body"'), 'Dinamik müşteri tablosu #customers-table-body konteyneri mevcut');
    assert(html.includes('id="btn-add-customer"') && html.includes('>+ Yeni Otoservis Ekle</button>'), '1. ADIM: Butonda fazla artı simgesi temizlendi: id="btn-add-customer" ve metin tek arti');

    // JS Sekme fonksiyonları
    assert(html.includes('function switchSection'), 'switchSection sekme geçiş motoru tanımlı');
    assert(html.includes('function loadOrdersTab'), 'loadOrdersTab sipariş sekmesi yükleyicisi tanımlı');
    assert(html.includes('filterOrdersByStatus'), 'filterOrdersByStatus sipariş filtreleyici tanımlı');
    assert(html.includes('function loadDiscountsTab'), 'loadDiscountsTab iskonto kuralları yükleyicisi tanımlı');
    assert(html.includes('quickEditProduct'), 'quickEditProduct ürün düzenleyici tanımlı');

    // Sunucuyu başlat
    await startTestServer();

    // 2. Bayi Yöneticisi Girişi
    console.log('\n--- 2. Bayi Yetkilendirmesi (Giriş) ---');
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'ahmet@ahmetoto.com',
        password: process.env.DEFAULT_DEALER_PASSWORD || 'SaaS_Dealer_Admin_2026!#Secure'
      }
    });

    assert(loginRes.status === 200, 'Giriş HTTP 200 döndü');
    assert(loginRes.data && loginRes.data.success, 'Giriş başarılı');
    const token = loginRes.data.token;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 3. Siparişler API ve Filtreleme Testi
    console.log('\n--- 3. GET /api/tenant/orders Filtreleme Testi ---');
    const allOrdersRes = await request('/api/tenant/orders', { headers: authHeaders });
    assert(allOrdersRes.status === 200, 'Tüm siparişler HTTP 200 ile listelendi');
    assert(Array.isArray(allOrdersRes.data.data), 'Sipariş listesi bir dizi');

    const pendingOrdersRes = await request('/api/tenant/orders?status=PENDING', { headers: authHeaders });
    assert(pendingOrdersRes.status === 200, 'PENDING filtresi HTTP 200 döndü');
    assert(Array.isArray(pendingOrdersRes.data.data), 'Filtrelenmiş siparişler bir dizi');
    const allPending = pendingOrdersRes.data.data.every(o => o.status === 'PENDING');
    assert(allPending, 'Filtrelenen siparişlerin hepsi PENDING durumunda');

    // 4. Katalog ve Ürün Güncelleme (PATCH) Testi
    let catalogRes = await request('/api/tenant/products', { headers: authHeaders });
    assert(catalogRes.status === 200, 'GET /api/tenant/products HTTP 200 döndü');

    if (!Array.isArray(catalogRes.data.data) || catalogRes.data.data.length === 0) {
      await request('/api/tenant/products', {
        method: 'POST',
        headers: authHeaders,
        body: {
          name: 'Hava Filtresi Bosch Orijinal',
          oeNumber: `OE-AUTO-${Date.now()}`,
          category: 'Filtre Grubu',
          vehicleBrand: 'Volkswagen',
          customPrice: 450,
          stock: 20
        }
      });
      catalogRes = await request('/api/tenant/products', { headers: authHeaders });
    }
    assert(Array.isArray(catalogRes.data.data) && catalogRes.data.data.length > 0, 'Bayi ürün kataloğunda en az 1 ürün var');

    const testProduct = catalogRes.data.data[0];
    const newPrice = Number((testProduct.customPrice || 100) + 15);
    const newStock = Number((testProduct.stock || 10) + 5);

    const patchRes = await request(`/api/tenant/products/${testProduct.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: {
        customPrice: newPrice,
        stock: newStock,
        isDiscounted: true
      }
    });

    assert(patchRes.status === 200, `PATCH /api/tenant/products/${testProduct.id} HTTP 200 döndü`);
    assert(patchRes.data && patchRes.data.success === true, 'Ürün güncelleme başarılı yanıt döndü');
    assert(patchRes.data.data.customPrice === newPrice, 'Ürün fiyatı SQLite veritabanında güncellendi');
    assert(patchRes.data.data.stock === newStock, 'Ürün stoğu SQLite veritabanında güncellendi');

    // 5. Müşteriler (Otoservisler) API Testi
    console.log('\n--- 5. GET /api/tenant/customers (Otoservisler) Testi ---');
    let customersRes = await request('/api/tenant/customers', { headers: authHeaders });
    assert(customersRes.status === 200, 'GET /api/tenant/customers HTTP 200 döndü');
    assert(Array.isArray(customersRes.data.data), 'Müşteri profilleri başarıyla çekildi');
    if (customersRes.data.data.length === 0) {
      await request('/api/tenant/customers', {
        method: 'POST',
        headers: authHeaders,
        body: {
          companyName: 'Akınlar Oto Servis Seed',
          phone: '0533 999 88 77',
          address: 'Oto Sanayi Sitesi',
          discountRate: 20
        }
      });
      customersRes = await request('/api/tenant/customers', { headers: authHeaders });
    }
    assert(customersRes.data.data.length > 0, 'En az 1 kayıtlı otoservis mevcut');
    const sampleCustomer = customersRes.data.data[0];
    assert(sampleCustomer.companyName && typeof sampleCustomer.companyName === 'string', 'Müşteri companyName içeriyor');
    assert(typeof sampleCustomer.discountRate === 'number', 'Müşteri discountRate (iskonto oranı) sayısal değer içeriyor');

    // 5.b Müşteri Ekleme (POST /api/tenant/customers: Otoservis Adı, Telefon, Adres, İskonto Oranı)
    console.log('\n--- 5.b POST /api/tenant/customers (Yeni Müşteri Ekleme) Testi ---');
    const newWorkshopPayload = {
      companyName: 'Akınlar Oto Servis ' + Date.now().toString(36),
      phone: '0533 999 88 77',
      address: 'Oto Sanayi Sitesi 3. Cadde No: 45',
      discountRate: 22.5
    };
    const createCustomerRes = await request('/api/tenant/customers', {
      method: 'POST',
      headers: authHeaders,
      body: newWorkshopPayload
    });
    assert(createCustomerRes.status === 201, 'POST /api/tenant/customers HTTP 201 döndü');
    assert(createCustomerRes.data && createCustomerRes.data.success === true, 'Müşteri ekleme başarılı yanıt döndü');
    assert(createCustomerRes.data.data.address === newWorkshopPayload.address, 'Müşteri adresi veritabanına kaydedildi');
    assert(createCustomerRes.data.data.discountRate === 22.5, 'Müşteri iskonto oranı %22.5 olarak kaydedildi');

    const createdCustomerId = createCustomerRes.data.data.id;

    // 5.c Tahsilat API Testi (POST /api/tenant/customers/:id/payment)
    console.log('\n--- 5.c POST /api/tenant/customers/:id/payment (Tahsilat) Testi ---');
    const paymentRes = await request(`/api/tenant/customers/${createdCustomerId}/payment`, {
      method: 'POST',
      headers: authHeaders,
      body: { amount: 250 }
    });
    assert(paymentRes.status === 200, 'POST /customers/:id/payment HTTP 200 döndü');
    assert(paymentRes.data && paymentRes.data.success === true, 'Tahsilat başarılı yanıt döndü');
    assert(paymentRes.data.data.amountPaid === 250, 'Tahsil edilen tutar 250 ₺ doğrulandı');
    assert(typeof paymentRes.data.data.newBalance === 'number', 'Yeni bakiye sayısal olarak hesaplandı');

    // 5.d İskonto Güncelle API Testi (PATCH /api/tenant/customers/:id/discount)
    console.log('\n--- 5.d PATCH /api/tenant/customers/:id/discount (İskonto Güncelle) Testi ---');
    const discountRes = await request(`/api/tenant/customers/${createdCustomerId}/discount`, {
      method: 'PATCH',
      headers: authHeaders,
      body: { discountRate: 28.5 }
    });
    assert(discountRes.status === 200, 'PATCH /customers/:id/discount HTTP 200 döndü');
    assert(discountRes.data && discountRes.data.success === true, 'İskonto güncelleme başarılı yanıt döndü');
    assert(discountRes.data.data.discountRate === 28.5, 'Yeni iskonto oranı %28.5 olarak güncellendi');

    // 5.e Müşteri Güncelle API Testi (PUT /api/tenant/customers/:id)
    console.log('\n--- 5.e PUT /api/tenant/customers/:id (Müşteri Güncelle) Testi ---');
    const updateCustomerRes = await request(`/api/tenant/customers/${createdCustomerId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: {
        companyName: 'Akınlar Master Servis',
        phone: '0533 888 77 66',
        address: 'Sanayi Bulvarı Plaza No: 12'
      }
    });
    assert(updateCustomerRes.status === 200, 'PUT /customers/:id HTTP 200 döndü');
    assert(updateCustomerRes.data && updateCustomerRes.data.success === true, 'Müşteri güncelleme başarılı yanıt döndü');
    assert(updateCustomerRes.data.data.companyName === 'Akınlar Master Servis', 'Müşteri adı güncellendi');
    assert(updateCustomerRes.data.data.phone === '0533 888 77 66', 'Müşteri telefonu güncellendi');

    // 5.f Müşteri Sil API Testi (DELETE /api/tenant/customers/:id)
    console.log('\n--- 5.f DELETE /api/tenant/customers/:id (Müşteri Sil) Testi ---');
    const deleteCustomerRes = await request(`/api/tenant/customers/${createdCustomerId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    assert(deleteCustomerRes.status === 200, 'DELETE /customers/:id HTTP 200 döndü');
    assert(deleteCustomerRes.data && deleteCustomerRes.data.success === true, 'Müşteri silme başarılı yanıt döndü');

    // 6. İskonto Kuralları API Testi (GET & POST)
    console.log('\n--- 6. GET & POST /api/tenant/discounts (İskonto Yönetimi) Testi ---');
    const getDiscountsRes = await request('/api/tenant/discounts', { headers: authHeaders });
    assert(getDiscountsRes.status === 200, 'GET /api/tenant/discounts HTTP 200 döndü');
    assert(getDiscountsRes.data && getDiscountsRes.data.success === true, 'İskonto verileri başarılı yanıt döndü');
    assert(typeof getDiscountsRes.data.data.globalDiscountRate === 'number', 'globalDiscountRate (genel iskonto) mevcut');
    assert(Array.isArray(getDiscountsRes.data.data.customerDiscounts), 'customerDiscounts listesi mevcut');

    // Müşteriye özel iskonto tanımlama
    const postCustomerDiscountRes = await request('/api/tenant/discounts', {
      method: 'POST',
      headers: authHeaders,
      body: {
        customerId: sampleCustomer.id,
        discountRate: 18.5
      }
    });
    assert(postCustomerDiscountRes.status === 200, 'POST /api/tenant/discounts (Müşteri iskontosu) HTTP 200 döndü');
    assert(postCustomerDiscountRes.data.data.customer.discountRate === 18.5, 'Müşteri iskonto oranı %18.5 olarak güncellendi');

    // Genel bayi iskontosu tanımlama
    const postGlobalDiscountRes = await request('/api/tenant/discounts', {
      method: 'POST',
      headers: authHeaders,
      body: {
        globalDiscountRate: 12
      }
    });
    assert(postGlobalDiscountRes.status === 200, 'POST /api/tenant/discounts (Genel iskonto) HTTP 200 döndü');
    assert(postGlobalDiscountRes.data.data.globalDiscountRate === 12, 'Genel bayi iskonto oranı %12 olarak güncellendi');

    console.log('\n====================================================');
    console.log(`🎉 TÜM TESTLER BAŞARIYLA TAMAMLANDI! (${passed}/${total})`);
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ Test yürütme sırasında hata:', err.message);
    process.exitCode = 1;
  } finally {
    await stopTestServer();
  }
}

runTests();
