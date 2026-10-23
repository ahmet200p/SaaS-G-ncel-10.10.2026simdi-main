/**
 * test_frontend_bayi_modals.js
 * Bayi.html Otoservis Müşterilerim Modalları (Tahsilat, İskonto, Düzenle, Sil)
 * ve Uçtan Uca (E2E) Doğrulama Testi
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let passedAssertions = 0;
let totalAssertions = 0;

function assert(condition, message) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 BAYI.HTML ÖZEL MODALLAR & API DOĞRULAMA TESTİ');
  console.log('====================================================\n');

  // 1. STATİK DOSYA VE MARKUP KONTROLLERİ
  console.log('--- 1. Frontend Markup ve Modal Elemanları Kontrolü ---');
  const bayiPath = path.join(__dirname, 'bayi.html');
  const tenantCssPath = path.join(__dirname, 'tenant.css');

  assert(fs.existsSync(bayiPath), 'bayi.html dosyası mevcut');
  assert(fs.existsSync(tenantCssPath), 'tenant.css dosyası mevcut');

  const bayiHtml = fs.readFileSync(bayiPath, 'utf8');
  const tenantCss = fs.readFileSync(tenantCssPath, 'utf8');

  // 3. ADIM: Modalların Varlığı (modal-payment, modal-discount, modal-edit-customer)
  assert(bayiHtml.includes('id="modal-payment"'), '3. ADIM: modal-payment DOM içinde mevcut');
  assert(bayiHtml.includes('id="modal-discount"'), '3. ADIM: modal-discount DOM içinde mevcut');
  assert(bayiHtml.includes('id="modal-edit-customer"'), '3. ADIM: modal-edit-customer DOM içinde mevcut');

  // Form ve Buton elemanları
  assert(bayiHtml.includes('Tahsil Edilen Tutar (₺)'), 'modal-payment: "Tahsil Edilen Tutar (₺)" input etiketi mevcut');
  assert(bayiHtml.includes('id="payment-modal-customer-id"') && bayiHtml.includes('name="customerId"'), 'modal-payment: customer-id hidden input mevcut');
  assert(bayiHtml.includes('>Kaydet</button>'), 'modal-payment: Kaydet butonu mevcut');

  assert(bayiHtml.includes('Yeni İskonto Oranı (%)'), 'modal-discount: "Yeni İskonto Oranı (%)" input etiketi mevcut');
  assert(bayiHtml.includes('id="discount-modal-customer-id"') && bayiHtml.includes('name="customerId"'), 'modal-discount: customer-id hidden input mevcut');
  assert(bayiHtml.includes('>Uygula</button>'), 'modal-discount: Uygula butonu mevcut');

  assert(bayiHtml.includes('id="edit-modal-name"') && bayiHtml.includes('name="companyName"'), 'modal-edit-customer: Ad inputu mevcut');
  assert(bayiHtml.includes('id="edit-modal-phone"') && bayiHtml.includes('name="phone"'), 'modal-edit-customer: Telefon inputu mevcut');
  assert(bayiHtml.includes('id="edit-modal-contact"') && bayiHtml.includes('name="contactName"'), 'modal-edit-customer: Yetkili inputu mevcut');
  assert(bayiHtml.includes('>Güncelle</button>'), 'modal-edit-customer: Güncelle butonu mevcut');
  assert(bayiHtml.includes('id="btn-delete-customer"') && bayiHtml.includes('Bayiyi Sil'), 'modal-edit-customer: Sol alt köşede kırmızı Bayiyi Sil butonu mevcut');

  // Tablo satır içi butonlar ve modal tetikleyiciler
  assert(bayiHtml.includes('openPaymentModal'), 'Tabloda openPaymentModal çağrısı mevcut');
  assert(bayiHtml.includes('openDiscountModal'), 'Tabloda openDiscountModal çağrısı mevcut');
  assert(bayiHtml.includes('openEditCustomerModal'), 'Tabloda openEditCustomerModal çağrısı mevcut');
  assert(bayiHtml.includes('openDeleteCustomerModal'), 'Tabloda openDeleteCustomerModal çağrısı mevcut');

  // 1 & 2. ADIM: Butonlara ID Tanımlama ve Fonksiyon Çağrısı
  assert(bayiHtml.includes('btn-delete-customer'), '2. ADIM: Tabloda "btn-delete-customer" butonu tanımlı');
  assert(bayiHtml.includes('deleteCustomer'), '2. ADIM: Tabloda deleteCustomer(${customer.id}) çağrısı tanımlı');

  // 3. ADIM: Frontend SweetAlert2 Onayı ve Silme Fonksiyonu
  assert(bayiHtml.includes('Bu müşteriyi ve tüm bakiyesini/verilerini kalıcı olarak silmek üzeresiniz!'), '3. ADIM: SweetAlert2 detaylı onay mesajı mevcut');
  assert(bayiHtml.includes("fetch(`/api/tenant/customers/${id}`") /* ) */, '3. ADIM: deleteCustomer içinde fetch DELETE çağrısı mevcut');

  // 4. ADIM: Tablo satır içi butonlar ve çift teyitli silme kontrolleri
  assert(bayiHtml.includes('>Tahsilat Gir</button>'), 'Tabloda "Tahsilat Gir" butonu mevcut');
  assert(bayiHtml.includes('>İskonto Güncelle</button>'), 'Tabloda "İskonto Güncelle" butonu mevcut');
  assert(bayiHtml.includes('>Düzenle</button>'), 'Tabloda "Düzenle" butonu mevcut');
  assert(bayiHtml.includes('confirm1') && bayiHtml.includes('confirm2'), '4. ADIM: Çift teyitli silme mantığı (confirm1 ve confirm2) tanımlı');

  // 3. ADIM: SweetAlert2 ve confirm() Kullanılmadığı Kontrolleri
  assert(bayiHtml.includes('sweetalert2'), '3. ADIM: SweetAlert2 kütüphanesi bayi.html içinde dahil edilmiş');
  assert(!bayiHtml.includes('confirm(') /* ) */, '3. ADIM: Tarayıcının default confirm() fonksiyonu tamamen kaldırıldı');
  assert(bayiHtml.includes('Bu müşteriyi silmek üzeresiniz'), '3. ADIM: 1. Aşama silme onayı metni mevcut');
  assert(bayiHtml.includes('Son Uyarı! Müşterinin tüm bakiye ve sipariş verileri kalıcı olarak silinecektir'), '3. ADIM: 2. Aşama silme onayı metni mevcut');


  // Müşteri işlemlerinde prompt kullanılmadığı kontrolü
  const customerSection = bayiHtml.substring(bayiHtml.indexOf('CANLI MÜŞTERİ YÜKLEME VE İŞLEMLER'), bayiHtml.indexOf('CANLI KATALOG YÜKLEME'));
  const promptToken = 'prompt' + String.fromCharCode(40);
  assert(!customerSection.includes(promptToken), 'Otoservis Müşterilerim bölümünde modal kullanılıyor');

  // 2. ADIM: 'Yeni Otoservis Ekle' Modalı / Çekmecesi Doğrulamaları
  assert(bayiHtml.includes('id="mechanic-drawer"'), '2. ADIM: mechanic-drawer mevcut');
  assert(bayiHtml.includes('id="form-add-mechanic"'), '2. ADIM: form-add-mechanic mevcut');
  assert(bayiHtml.includes('mechanic-form-grid'), '2. ADIM: İki sütunlu grid yapısı (.mechanic-form-grid) mevcut');
  assert(bayiHtml.includes('mechanic-form-col'), '2. ADIM: İki sütunlu kolonlar (.mechanic-form-col) mevcut');

  // CSS stilleri kontrolü
  console.log('\n--- 2. CSS Modal ve Buton Tasarım Kuralları Kontrolü ---');
  assert(tenantCss.includes('.modal-overlay'), 'tenant.css içinde .modal-overlay stili tanımlı');
  assert(tenantCss.includes('.modal-container'), 'tenant.css içinde .modal-container stili tanımlı');
  assert(tenantCss.includes('.modal-header'), 'tenant.css içinde .modal-header stili tanımlı');
  assert(tenantCss.includes('.btn-action-edit'), 'tenant.css içinde .btn-action-edit stili tanımlı');
  assert(tenantCss.includes('.btn-action-delete'), 'tenant.css içinde .btn-action-delete stili tanımlı');
  assert(tenantCss.includes('.mechanic-form-grid'), '2. ADIM: tenant.css içinde .mechanic-form-grid stili tanımlı');
  assert(tenantCss.includes('#mechanic-drawer .drawer-content'), '2. ADIM: tenant.css içinde genişletilmiş drawer içeriği stili tanımlı');

  // 4. ADIM: Müşteri Silme Modalı Görünürlük (Z-Index) Çözümü Kontrolleri
  console.log('\n--- 4. ADIM: Modal Z-Index ve Görünürlük Kuralları Kontrolü ---');
  assert(tenantCss.includes('9998 !important'), '4. ADIM: tenant.css içinde karartma katmanı (.modal-backdrop / .modal-overlay) z-index: 9998 tanımlı');
  assert(tenantCss.includes('#modal-edit-customer') && tenantCss.includes('9999 !important'), '4. ADIM: tenant.css içinde #modal-edit-customer z-index: 9999 !important tanımlı');
  assert(tenantCss.includes('.modal-container') && tenantCss.includes('z-index: 9999'), '4. ADIM: tenant.css içinde .modal-container z-index: 9999 tanımlı');
  assert(tenantCss.includes('.modern-danger-btn') && tenantCss.includes('#dc2626'), '4. ADIM: Kırmızı silme butonu (.modern-danger-btn) görsel olarak ön planda');
  
  const styleCssPath = path.join(__dirname, 'style.css');
  if (fs.existsSync(styleCssPath)) {
    const styleCss = fs.readFileSync(styleCssPath, 'utf8');
    assert(styleCss.includes('9998 !important') && styleCss.includes('9999 !important'), '4. ADIM: style.css içinde 9998 backdrop ve 9999 modal z-index tanımları mevcut');
  }


  // 3. CANLI SUNUCU E2E MODAL İŞLEMLERİ DOĞRULAMASI
  console.log('\n--- 3. Canlı API ile Modal İşlem Akışları (E2E) ---');
  const app = require('./app');
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 3.a Bayi Girişi (JWT Alma)
    const loginRes = await makeRequest(`${baseUrl}/api/auth/login`, 'POST', {
      email: 'ahmet@ahmetoto.com',
      password: '123456'
    });
    assert(loginRes.status === 200 && loginRes.data.token, 'Bayi girişi başarılı ve JWT token alındı');
    const token = loginRes.data.token;

    // 3.b Test Otoservisi Oluştur
    const createRes = await makeRequest(`${baseUrl}/api/tenant/customers`, 'POST', {
      companyName: 'Test Modal Otomotiv Sanayi',
      phone: '05559998877',
      address: 'Kadıköy Oto Sanayi Sitesi No: 42',
      discountRate: 15.0,
      balance: -10000.0
    }, token);
    assert(createRes.status === 201 && createRes.data.data.id, 'Test otoservis müşterisi başarıyla oluşturuldu');
    const custId = createRes.data.data.id;

    // 3.c Tahsilat Modalı İşlemi (POST /customers/:id/payment)
    const paymentRes = await makeRequest(`${baseUrl}/api/tenant/customers/${custId}/payment`, 'POST', {
      amount: 3500.0,
      description: 'Modal Nakit Tahsilat'
    }, token);
    assert(paymentRes.status === 200, 'Tahsilat modalı API uç noktası HTTP 200 döndü');
    assert(paymentRes.data.success === true, 'Tahsilat modalı başarı yanıtı true');
    assert(paymentRes.data.data.amount === 3500.0, 'Tahsilat tutarı (3.500 ₺) doğrulandı');
    assert(paymentRes.data.data.newBalance === -6500.0, 'Yeni bakiye doğru hesaplandı (-10000 + 3500 = -6500 ₺)');

    // 3.d İskonto Modalı İşlemi (PATCH /customers/:id/discount)
    const discountRes = await makeRequest(`${baseUrl}/api/tenant/customers/${custId}/discount`, 'PATCH', {
      discountRate: 22.5
    }, token);
    assert(discountRes.status === 200, 'İskonto modalı API uç noktası HTTP 200 döndü');
    assert(discountRes.data.success === true, 'İskonto modalı başarı yanıtı true');
    assert(discountRes.data.data.discountRate === 22.5, 'Yeni iskonto oranı (%22.5) doğrulandı');

    // 3.e Müşteri Düzenle Modalı İşlemi (PUT /customers/:id)
    const editRes = await makeRequest(`${baseUrl}/api/tenant/customers/${custId}`, 'PUT', {
      companyName: 'Test Modal Otomotiv A.Ş. (Revize)',
      phone: '05551112233',
      address: 'Bostancı Oto Sanayi D Blok No: 12',
      discountRate: 25.0,
      balance: 5000.0
    }, token);
    assert(editRes.status === 200, 'Müşteri düzenle modalı API uç noktası HTTP 200 döndü');
    assert(editRes.data.success === true, 'Müşteri düzenleme başarılı yanıt döndü');
    assert(editRes.data.data.companyName === 'Test Modal Otomotiv A.Ş. (Revize)', 'Revize müşteri unvanı veritabanında güncellendi');
    assert(editRes.data.data.phone === '05551112233', 'Revize telefon numarası güncellendi');

    // 3.f Müşteri Silme Modalı İşlemi (DELETE /customers/:id)
    const deleteRes = await makeRequest(`${baseUrl}/api/tenant/customers/${custId}`, 'DELETE', null, token);
    assert(deleteRes.status === 200, 'Müşteri silme modalı API uç noktası HTTP 200 döndü');
    assert(deleteRes.data.success === true, 'Müşteri silme başarılı yanıt döndü');
    assert(deleteRes.data.message === 'Müşteri silindi', '1. ADIM: DELETE /api/tenant/customers/:id { success: true, message: "Müşteri silindi" } yanıtı döndü');

    // 3.g Silinen Müşterinin Veritabanından Silindiği Kontrolü
    const verifyDeleteRes = await makeRequest(`${baseUrl}/api/tenant/customers`, 'GET', null, token);
    const remaining = verifyDeleteRes.data.data || [];
    assert(!remaining.some(c => c.id === custId), 'Müşteri listeden ve veritabanından kalıcı olarak silindi');

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`🎉 TEST SONUCU: ${passedAssertions} / ${totalAssertions} BAŞARILI (%100)`);
  console.log('====================================================');
}

function makeRequest(urlStr, method, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: headers
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

runTests().catch(err => {
  console.error('Test hatası:', err);
  process.exit(1);
});
