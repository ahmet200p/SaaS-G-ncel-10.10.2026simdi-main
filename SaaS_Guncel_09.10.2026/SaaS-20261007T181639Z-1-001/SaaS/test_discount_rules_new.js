// ============================================================================
// Multi-Tenant B2B Yedek Parça SaaS - Yeni İskonto Kuralları & UI Doğrulama Testi
// ============================================================================

const fs = require('fs');
const path = require('path');
const http = require('http');

let total = 0;
let passed = 0;

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

async function run() {
  console.log('====================================================');
  console.log('🧪 YENİ İSKONTO YÖNETİMİ & DISCOUNT_RULE TESTİ');
  console.log('====================================================');

  // 1. ADIM: bayi.html HTML / UI Kontrolleri
  console.log('\n--- 1. ADIM: HTML ve Tasarım Kuralları Kontrolleri ---');
  const bayiHtmlPath = path.join(__dirname, 'bayi.html');
  const bayiHtml = fs.readFileSync(bayiHtmlPath, 'utf8');

  // 1. ADIM: Butonda tek artı ve standart metin
  assert(
    bayiHtml.includes('<button type="button" class="btn-primary" id="btn-add-discount">+ Yeni Kural Ekle</button>'),
    '1. ADIM: id="btn-add-discount" butonu temizlendi: "+ Yeni Kural Ekle"'
  );

  // 2. ADIM: 3'lü KPI Kutuları ve Kalıcı Formun Kaldırılması
  assert(bayiHtml.includes('id="discount-stat-active-customers"'), '2. ADIM: Kayıtlı Servis Sayısı KPI kutusu mevcut');
  assert(bayiHtml.includes('id="discount-stat-avg-rate"'), '2. ADIM: Ortalama İskonto Oranı KPI kutusu mevcut');
  assert(bayiHtml.includes('id="discount-stat-default-rate"') || bayiHtml.includes('Varsayılan İskonto'), '2. ADIM: Varsayılan İskonto KPI kutusu mevcut');
  assert(!bayiHtml.includes('id="form-section-discount"'), '2. ADIM: Sol taraftaki kalıcı form (#form-section-discount) KESİNLİKLE kaldırıldı');
  assert(!bayiHtml.includes('İskonto Kuralı Tanımla</h3>'), '2. ADIM: Sol taraftaki kalıcı form başlığı kaldırıldı');
  assert(bayiHtml.includes('id="discount-rules-tbody"'), '2. ADIM: Geniş İskonto Kuralları Tablosu (#discount-rules-tbody) mevcut');

  // 3. ADIM: 'İskonto Kuralı Oluştur' Modalı ve 2x2 Grid Yapısı
  assert(bayiHtml.includes('discount-modal-card'), '3. ADIM: discount-modal-card ferah card/modal yapısı mevcut');
  assert(bayiHtml.includes('discount-form-grid-2x2'), '3. ADIM: 2x2 grid (ızgara) yapısı (.discount-form-grid-2x2) mevcut');
  assert(bayiHtml.includes('id="disc-name"') && bayiHtml.includes('name="ruleName"'), '3. ADIM: Kural Adı (ruleName) inputu mevcut');
  assert(bayiHtml.includes('id="disc-target"') && bayiHtml.includes('name="targetCust"'), '3. ADIM: Hedef Müşteri (targetCust) seçimi mevcut');
  assert(bayiHtml.includes('id="disc-category"') && bayiHtml.includes('name="category"'), '3. ADIM: Kategori (category) seçimi mevcut');
  assert(bayiHtml.includes('id="disc-rate"') && bayiHtml.includes('name="rate"'), '3. ADIM: İskonto Oranı (rate) inputu mevcut');
  assert(bayiHtml.includes('form-control'), '3. ADIM: Inputlarda form-control CSS sınıfları mevcut');
  assert(bayiHtml.includes('deleteDiscountRule'), '3. ADIM: deleteDiscountRule fonksiyon çağrısı tanımlı');

  // 4. ADIM: SweetAlert2 ve JS Fonksiyon Doğrulamaları
  assert(bayiHtml.includes('Swal.fire') && bayiHtml.includes('Bu iskonto kuralını veritabanından kalıcı olarak silmek üzeresiniz!'), '4. ADIM: deleteDiscountRule içinde SweetAlert2 onayı mevcut');
  assert(bayiHtml.includes("fetch(`/api/tenant/discounts/${id}`") /* ) */ || bayiHtml.includes("fetch('/api/tenant/discounts/' + id") /* ) */, '4. ADIM: deleteDiscountRule içinde DELETE isteği tanımlı');

  // 2. CSS Kontrolleri
  console.log('\n--- 2. CSS Tasarım ve Grid Kuralları Kontrolleri ---');
  const tenantCssPath = path.join(__dirname, 'tenant.css');
  const tenantCss = fs.readFileSync(tenantCssPath, 'utf8');
  assert(tenantCss.includes('.discount-form-grid-2x2'), 'tenant.css: .discount-form-grid-2x2 kuralı tanımlı');
  assert(tenantCss.includes('.discount-modal-card'), 'tenant.css: .discount-modal-card ferah zemin stili tanımlı');
  assert(tenantCss.includes('.btn-delete-rule'), 'tenant.css: .btn-delete-rule kırmızı sil butonu stili tanımlı');

  // 3. API ve Veritabanı Testleri (Prisma DiscountRule)
  console.log('\n--- 3. Canlı API (DiscountRule CRUD) Testleri ---');
  const app = require('./app');
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 3.a Bayi Girişi
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ahmet@ahmetoto.com', password: '123456' })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && loginData.token, 'Bayi yöneticisi girişi başarılı');
    const token = loginData.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // 3.b POST /api/tenant/discounts ile Kural Oluşturma (ruleName, targetCust, category, rate)
    const newRulePayload = {
      ruleName: '2026 Bahar Kampanyası Filtre İndirimi',
      targetCust: 'Tüm Müşteriler',
      category: 'Filtre Grubu',
      rate: 17.5
    };

    const createRuleRes = await fetch(`${baseUrl}/api/tenant/discounts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(newRulePayload)
    });
    const createRuleData = await createRuleRes.json();
    assert(createRuleRes.status === 201, 'POST /api/tenant/discounts HTTP 201 döndü');
    assert(createRuleData.success === true, 'Kural oluşturma yanıtı true');
    assert(createRuleData.data && createRuleData.data.id, 'Oluşturulan kuralın ID değeri var');
    assert(createRuleData.data.ruleName === newRulePayload.ruleName, 'Kural adı doğru kaydedildi');
    assert(createRuleData.data.rate === 17.5, 'İskonto oranı %17.5 olarak kaydedildi');
    const createdRuleId = createRuleData.data.id;

    // 3.c GET /api/tenant/discounts ile Kuralları Listeleme
    const getRulesRes = await fetch(`${baseUrl}/api/tenant/discounts`, {
      headers: authHeaders
    });
    const getRulesData = await getRulesRes.json();
    assert(getRulesRes.status === 200, 'GET /api/tenant/discounts HTTP 200 döndü');
    assert(getRulesData.success === true, 'GET isteği başarılı');
    assert(Array.isArray(getRulesData.data.rules), 'Dönen veride kurallar listesi (rules) mevcut');
    const foundRule = getRulesData.data.rules.find(r => r.id === createdRuleId);
    assert(!!foundRule, 'Oluşturulan kural GET yanıtı kurallar listesinde bulundu');

    // 3.d DELETE /api/tenant/discounts/:id ile Kural Silme
    const deleteRuleRes = await fetch(`${baseUrl}/api/tenant/discounts/${createdRuleId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const deleteRuleData = await deleteRuleRes.json();
    assert(deleteRuleRes.status === 200, 'DELETE /api/tenant/discounts/:id HTTP 200 döndü');
    assert(deleteRuleData.success === true, 'Silme yanıtı success: true');
    assert(deleteRuleData.message === 'İskonto kuralı silindi', 'Silme yanıt mesajı "İskonto kuralı silindi"');

    // 3.e Silinen Kuralın Listede Olmadığını Doğrulama
    const verifyGetRes = await fetch(`${baseUrl}/api/tenant/discounts`, {
      headers: authHeaders
    });
    const verifyGetData = await verifyGetRes.json();
    const stillExists = (verifyGetData.data.rules || []).some(r => r.id === createdRuleId);
    assert(!stillExists, 'Silinen kural veritabanından kalıcı olarak kaldırıldı');

    console.log('\n====================================================');
    console.log(`🎉 TÜM TESTLER BAŞARIYLA TAMAMLANDI! (${passed}/${total})`);
    console.log('====================================================');
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error('Test hatası:', err);
  process.exit(1);
});
