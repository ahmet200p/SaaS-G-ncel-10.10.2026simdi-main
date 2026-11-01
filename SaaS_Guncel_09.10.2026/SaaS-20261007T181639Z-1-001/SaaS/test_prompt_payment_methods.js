const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

async function makeRequest(url, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const { startServer } = require('./dev_pg_server');
  await startServer();
  console.log('================================================================');
  console.log('🧪 PROMPT.MD: ÖDEME YÖNTEMLERİ & SİPARİŞ DURUMU DOĞRULAMA TESTİ');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // 1. ADIM: store.html ve UI Bileşenleri Doğrulaması
  // --------------------------------------------------------------------------
  console.log('--- 1. ADIM: store.html Ödeme Yöntemi Modalı ve UI Kartları ---');
  const storeHtmlPath = path.join(__dirname, 'store.html');
  assert(fs.existsSync(storeHtmlPath), 'store.html dosyası mevcut olmalı');
  const storeHtml = fs.readFileSync(storeHtmlPath, 'utf8');

  // Modal Ana Taşıyıcısı
  assert(storeHtml.includes('id="modal-payment-method"'), '1. ADIM: #modal-payment-method modalı mevcut olmalı');
  assert(storeHtml.includes('id="payment-modal-grand-total"'), '1. ADIM: #payment-modal-grand-total toplam tutar alanı mevcut olmalı');

  // 1. Seçenek: Cari Hesaba Yaz (Veresiye)
  assert(storeHtml.includes('id="card-method-current"'), '1. ADIM: #card-method-current kartı mevcut olmalı');
  assert(storeHtml.includes('Cari Hesaba Yaz (Veresiye)'), '1. ADIM: "Cari Hesaba Yaz (Veresiye)" seçeneği bulunmalı');
  assert(storeHtml.includes('Sipariş tutarı cari hesabınıza borç olarak yansıtılacaktır.'), '1. ADIM: Cari açıklama metni eksiksiz olmalı');

  // 2. Seçenek: Havale / EFT ile Öde
  assert(storeHtml.includes('id="card-method-bank"'), '1. ADIM: #card-method-bank kartı mevcut olmalı');
  assert(storeHtml.includes('Havale / EFT ile Öde'), '1. ADIM: "Havale / EFT ile Öde" seçeneği bulunmalı');
  assert(storeHtml.includes('Ödemeyi banka hesabımıza gönderdiğinizde siparişiniz onaylanacaktır.'), '1. ADIM: Havale açıklama metni eksiksiz olmalı');
  assert(storeHtml.includes('id="bank-transfer-details"'), '1. ADIM: Dinamik IBAN bilgileri kutusu #bank-transfer-details mevcut olmalı');
  assert(storeHtml.includes('id="bank-info-iban"'), '1. ADIM: #bank-info-iban IBAN metin alanı mevcut olmalı');

  // 3. Seçenek: Kredi Kartı ile Öde (Pasif / Disabled + Çok Yakında)
  assert(storeHtml.includes('id="card-method-card"'), '1. ADIM: #card-method-card kartı mevcut olmalı');
  assert(storeHtml.includes('Kredi Kartı ile Öde'), '1. ADIM: "Kredi Kartı ile Öde" seçeneği bulunmalı');
  assert(storeHtml.includes('Çok Yakında'), '1. ADIM: "Çok Yakında" badge\'i mevcut olmalı');
  assert(storeHtml.includes('id="radio-method-card"'), '1. ADIM: #radio-method-card radio butonu mevcut olmalı');

  // Butonlar
  assert(storeHtml.includes('id="btn-complete-order"'), '1. ADIM: #btn-complete-order Siparişi Tamamla butonu mevcut olmalı');
  assert(storeHtml.includes('onclick="completeOrderWithPaymentMethod()"'), '1. ADIM: Siparişi Tamamla butonu completeOrderWithPaymentMethod tetiklemeli');

  console.log('  ✅ [PASS] 1. ADIM: Modal yapısı, 3 ödeme kartı ve IBAN alanı doğrulandı.');

  // --------------------------------------------------------------------------
  // 2. ADIM: JavaScript Fonksiyonları ve Akış Doğrulaması
  // --------------------------------------------------------------------------
  console.log('\n--- 2. ADIM: JavaScript Fonksiyonları ve Olay Yönetimi ---');
  assert(storeHtml.includes('function openPaymentMethodModal()'), '2. ADIM: openPaymentMethodModal fonksiyonu tanımlı olmalı');
  assert(storeHtml.includes('function closePaymentMethodModal()'), '2. ADIM: closePaymentMethodModal fonksiyonu tanımlı olmalı');
  assert(storeHtml.includes('function selectPaymentMethodOption(method)'), '2. ADIM: selectPaymentMethodOption fonksiyonu tanımlı olmalı');
  assert(storeHtml.includes('function copyIbanText(evt)'), '2. ADIM: copyIbanText fonksiyonu tanımlı olmalı');
  assert(storeHtml.includes('function completeOrderWithPaymentMethod()'), '2. ADIM: completeOrderWithPaymentMethod fonksiyonu tanımlı olmalı');
  assert(storeHtml.includes('paymentMethod: selectedPaymentMethod'), '2. ADIM: completeOrderWithPaymentMethod seçilen paymentMethod değerini API\'ye iletmeli');
  assert(storeHtml.includes('cart = [];'), '2. ADIM: Sipariş tamamlanınca sepet sıfırlanmalı (cart = [])');
  assert(storeHtml.includes('openMyOrdersModal()'), '2. ADIM: Sipariş tamamlanınca Profil > Siparişlerim modalı açılmalı');

  console.log('  ✅ [PASS] 2. ADIM: JS ödeme fonksiyonları ve sepet sıfırlama akışı doğrulandı.');

  // --------------------------------------------------------------------------
  // 3. ADIM: Bayi Paneli (bayi.html) ve Durum Gösterimi
  // --------------------------------------------------------------------------
  console.log('\n--- 3. ADIM: Bayi Paneli (bayi.html) Sipariş Durumu Rozetleri ---');
  const bayiHtmlPath = path.join(__dirname, 'bayi.html');
  const bayiHtml = fs.readFileSync(bayiHtmlPath, 'utf8');

  assert(bayiHtml.includes('Hazırlanıyor'), '3. ADIM: bayi.html içinde Hazırlanıyor durumu desteklenmeli');
  assert(bayiHtml.includes('Ödeme Bekliyor'), '3. ADIM: bayi.html içinde Ödeme Bekliyor durumu desteklenmeli');

  console.log('  ✅ [PASS] 3. ADIM: bayi.html üzerinde "Hazırlanıyor" ve "Ödeme Bekliyor" rozetleri doğrulandı.');

  // --------------------------------------------------------------------------
  // 4. ADIM: Canlı Express & Prisma API Entegrasyon Testleri
  // --------------------------------------------------------------------------
  console.log('\n--- 4. ADIM: Canlı Backend API (POST /orders & GET /bank-info) Testleri ---');
  const { isPortOpen } = require('./dev_pg_server');
  let baseUrl = 'http://127.0.0.1:5000';
  let server = null;
  const isServerRunning = await isPortOpen(5000);
  if (!isServerRunning) {
    const app = require('./app');
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }

  try {
    // 4.1. Banka Bilgisi API'si Testi (GET /api/store/bank-info)
    const bankRes = await makeRequest(`${baseUrl}/api/store/bank-info`, 'GET');
    assert(bankRes.status === 200, 'GET /api/store/bank-info HTTP 200 dönmeli');
    assert(bankRes.data.success === true, 'bank-info success true dönmeli');
    assert(bankRes.data.data.bankName, 'bankName mevcut olmalı');
    assert(bankRes.data.data.iban, 'iban mevcut olmalı');
    assert(bankRes.data.data.accountHolder, 'accountHolder mevcut olmalı');
    console.log(`  ✅ [PASS] 4.1: GET /api/store/bank-info doğrulandı (IBAN: ${bankRes.data.data.iban})`);

    // 4.2. Müşteri Girişi Yap
    const loginRes = await makeRequest(`${baseUrl}/api/auth/login`, 'POST', {
      email: 'ahmet@ahmetoto.com',
      password: '123456'
    });
    const token = loginRes.data.token || (loginRes.data.data && loginRes.data.data.token);
    assert(loginRes.status === 200 && token, 'Giriş başarılı olmalı ve token dönmeli');

    // Mevcut bir tenantProduct bul veya gerekirse oluştur (yeterli stok kontrolü)
    let sampleProduct = null;
    const prodsRes = await makeRequest(`${baseUrl}/api/tenant/products`, 'GET', null, token);
    if (prodsRes.status === 200 && prodsRes.data.data && prodsRes.data.data.length > 0) {
      sampleProduct = prodsRes.data.data.find(p => p.stock >= 5);
    }
    
    if (!sampleProduct) {
      const prisma = require('./lib/prisma');
      const tenant = await prisma.tenant.findUnique({ where: { subdomain: 'ahmetoto' } });
      const testProd = await prisma.product.create({
        data: {
          oeNumber: 'OE-PAY-TEST-' + Date.now(),
          name: 'Ödeme Entegrasyon Test Parçası',
          category: 'Fren Sistemi',
          defaultPrice: 300.00
        }
      });
      sampleProduct = await prisma.tenantProduct.create({
        data: {
          tenantId: tenant.id,
          productId: testProd.id,
          stock: 50,
          customPrice: 300.00
        }
      });
    }

    // Müşteri profilinin varlığını garanti altına al
    const prisma = require('./lib/prisma');
    const tenant = await prisma.tenant.findUnique({ where: { subdomain: 'ahmetoto' } });
    let existingCust = await prisma.customerProfile.findFirst({ where: { tenantId: tenant.id } });
    if (!existingCust) {
      let custUser = await prisma.user.findFirst({ where: { email: 'kemal@kemaloto.com' } });
      if (!custUser) {
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('123456', 10);
        custUser = await prisma.user.create({
          data: {
            email: 'kemal@kemaloto.com',
            password: hashedPassword,
            role: 'CUSTOMER',
            name: 'Kemal Usta',
            tenantId: tenant.id
          }
        });
      }
      existingCust = await prisma.customerProfile.create({
        data: {
          userId: custUser.id,
          tenantId: tenant.id,
          companyName: 'Kemal Usta Oto Servis',
          phone: '05551234567',
          customerType: 'MECHANIC',
          status: 'ACTIVE',
          discountRate: 15,
          balance: 0
        }
      });
    }

    // 4.3. Test: Cari Hesaba Yaz ile Sipariş (CURRENT_ACCOUNT) -> Durum: 'Hazırlanıyor'
    console.log('\n  -> 4.3: Cari Hesaba Yaz (CURRENT_ACCOUNT) ile Sipariş Oluşturuluyor...');
    const orderCurrentRes = await makeRequest(`${baseUrl}/api/store/orders`, 'POST', {
      paymentMethod: 'CURRENT_ACCOUNT',
      items: [
        {
          tenantProductId: sampleProduct.id,
          quantity: 1,
          unitPrice: sampleProduct.customPrice || 250,
          totalPrice: sampleProduct.customPrice || 250
        }
      ]
    }, token);

    assert(orderCurrentRes.status === 201, 'POST /api/store/orders HTTP 201 dönmeli');
    assert(orderCurrentRes.data.success === true, 'Sipariş başarılı olmalı');
    const orderCurrent = orderCurrentRes.data.data;
    assert.strictEqual(orderCurrent.paymentMethod, 'CURRENT_ACCOUNT', 'Sipariş paymentMethod CURRENT_ACCOUNT olmalı');
    assert.strictEqual(orderCurrent.status, 'PENDING_APPROVAL', 'Cari hesaba yazılan siparişin başlangıç durumu "PENDING_APPROVAL" olmalı');
    console.log(`  ✅ [PASS] 4.3: Cari Sipariş (#${orderCurrent.orderNumber}) Başlangıç Durumu: "${orderCurrent.status}", Yöntem: "${orderCurrent.paymentMethod}"`);

    // 4.4. Test: Havale / EFT ile Sipariş (BANK_TRANSFER) -> Başlangıç Durumu: 'PENDING_APPROVAL'
    console.log('\n  -> 4.4: Havale / EFT (BANK_TRANSFER) ile Sipariş Oluşturuluyor...');
    const orderBankRes = await makeRequest(`${baseUrl}/api/store/orders`, 'POST', {
      paymentMethod: 'BANK_TRANSFER',
      items: [
        {
          tenantProductId: sampleProduct.id,
          quantity: 1,
          unitPrice: sampleProduct.customPrice || 250,
          totalPrice: sampleProduct.customPrice || 250
        }
      ]
    }, token);

    assert(orderBankRes.status === 201, 'POST /api/store/orders HTTP 201 dönmeli');
    assert(orderBankRes.data.success === true, 'Sipariş başarılı olmalı');
    const orderBank = orderBankRes.data.data;
    assert.strictEqual(orderBank.paymentMethod, 'BANK_TRANSFER', 'Sipariş paymentMethod BANK_TRANSFER olmalı');
    assert.strictEqual(orderBank.status, 'PENDING_APPROVAL', 'Havale/EFT siparişinin başlangıç durumu "PENDING_APPROVAL" olmalı');
    console.log(`  ✅ [PASS] 4.4: Havale/EFT Sipariş (#${orderBank.orderNumber}) Başlangıç Durumu: "${orderBank.status}", Yöntem: "${orderBank.paymentMethod}"`);

    // 4.5. Test: Bayi Panelinden Sipariş Durum Güncelleme (PUT /orders/:id/status -> PROCESSING)
    const putRes = await makeRequest(`${baseUrl}/api/tenant/orders/${orderBank.id}/status`, 'PUT', {
      status: 'PROCESSING'
    }, token);
    assert(putRes.status === 200, 'PUT /api/tenant/orders/:id/status HTTP 200 dönmeli');
    assert.strictEqual(putRes.data.data.status, 'PROCESSING', 'Güncellenen durum PROCESSING olmalı');
    console.log('  ✅ [PASS] 4.5: Bayi panelinden durum güncellemesi (PENDING_APPROVAL -> PROCESSING) doğrulandı.');

  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
  }

  console.log('\n================================================================');
  console.log('🎉 TÜM ÖDEME YÖNTEMLERİ VE SİPARİŞ ENTEGRASYON TESTLERİ BAŞARIYLA GEÇTİ!');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST BAŞARISIZ OLDU:', err);
  process.exit(1);
});
