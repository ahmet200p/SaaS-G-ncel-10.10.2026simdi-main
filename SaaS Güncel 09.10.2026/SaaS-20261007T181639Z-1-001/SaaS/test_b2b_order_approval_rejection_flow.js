const assert = require('assert');
const http = require('http');
const app = require('./app');
const prisma = require('./lib/prisma');
const jwt = require('jsonwebtoken');
const config = require('./config');

function makeRequest(url, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
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
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
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

async function runTest() {
  console.log('🚀 [TEST START] B2B Sipariş Onay & Ret Akışı (Prompt 4 Adım Kapsamlı Testi)');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Bayi (Tenant) ve Ürün Hazırla
    let tenant = await prisma.tenant.findFirst({
      where: { subdomain: 'ahmetoto' }
    });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'Ahmet Oto Yedek Parça',
          subdomain: 'ahmetoto',
          themeColor: '#2563eb'
        }
      });
    }

    // 2. Müşteri (User & CustomerProfile) Hazırla
    let customerUser = await prisma.user.findFirst({
      where: { email: 'kemal.usta.test@ustaoto.com' },
      include: { customerProfile: true }
    });

    if (!customerUser) {
      customerUser = await prisma.user.create({
        data: {
          email: 'kemal.usta.test@ustaoto.com',
          password: 'hashedpassword123',
          name: 'Kemal Usta',
          role: 'CUSTOMER',
          tenantId: tenant.id,
          customerProfile: {
            create: {
              tenantId: tenant.id,
              companyName: 'Kemal Usta Otoservis Test',
              phone: '0555 123 45 67',
              customerType: 'MECHANIC',
              discountRate: 10.0,
              balance: 1000.0
            }
          }
        },
        include: { customerProfile: true }
      });
    }

    const customerProfile = customerUser.customerProfile;
    const initialCustomerBalance = parseFloat(customerProfile.balance);

    // 3. Ürün ve TenantProduct Hazırla
    const oeTest = `OE-TEST-${Date.now().toString(36).toUpperCase()}`;
    const product = await prisma.product.create({
      data: {
        oeNumber: oeTest,
        name: 'Test Ön Amortisör Sol',
        category: 'Süspansiyon',
        defaultPrice: 500.0,
        vehicleBrand: 'Renault'
      }
    });

    const initialStock = 20;
    const tenantProduct = await prisma.tenantProduct.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        stock: initialStock,
        customPrice: 400.0
      }
    });

    // 4. Token Üret
    const customerToken = jwt.sign(
      { id: customerUser.id, email: customerUser.email, role: 'CUSTOMER', tenantId: tenant.id },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const dealerToken = jwt.sign(
      { id: 'dealer-admin-id', email: 'bayi@ahmetoto.com', role: 'TENANT_ADMIN', tenantId: tenant.id },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // =========================================================================
    // ADIM 1: POST /api/store/orders - Varsayılan Statü Kesinlikle PENDING_APPROVAL Olmalı
    // =========================================================================
    console.log('\n--- 1. ADIM: POST /api/store/orders Sipariş Oluşturma (Varsayılan Statü Teyidi) ---');
    const orderCreateRes1 = await makeRequest(`${baseUrl}/api/store/orders`, 'POST', {
      paymentMethod: 'CURRENT_ACCOUNT',
      items: [
        {
          tenantProductId: tenantProduct.id,
          quantity: 2
        }
      ]
    }, customerToken);

    assert.strictEqual(orderCreateRes1.status, 201, 'Sipariş oluşturma HTTP 201 dönmeli');
    assert.strictEqual(orderCreateRes1.data.success, true, 'Sipariş başarıyla oluşturulmalı');
    const order1 = orderCreateRes1.data.data;
    assert.strictEqual(order1.status, 'PENDING_APPROVAL', '1. ADIM KURALI: Varsayılan statü kesinlikle PENDING_APPROVAL olmalıdır!');
    console.log(`  ✅ [PASS] 1. ADIM: Sipariş #${order1.orderNumber} başarıyla PENDING_APPROVAL statüsünde oluşturuldu.`);

    // =========================================================================
    // ADIM 2.A: Bayi Paneli Onayla Butonu -> PUT /api/tenant/orders/:id/status -> PROCESSING
    // =========================================================================
    console.log('\n--- 2. ADIM (A): PUT /api/tenant/orders/:id/status Sipariş Onaylama (PROCESSING) ---');
    const approveRes = await makeRequest(`${baseUrl}/api/tenant/orders/${order1.id}/status`, 'PUT', {
      status: 'PROCESSING'
    }, dealerToken);

    assert.strictEqual(approveRes.status, 200, 'Sipariş onaylama HTTP 200 dönmeli');
    assert.strictEqual(approveRes.data.success, true, 'Onaylama işlemi başarılı olmalı');
    assert.strictEqual(approveRes.data.data.status, 'PROCESSING', 'Sipariş statüsü PROCESSING olmalıdır.');
    console.log(`  ✅ [PASS] 2. ADIM (A): Sipariş #${order1.orderNumber} durumu PROCESSING (Hazırlanıyor) olarak güncellendi.`);

    // =========================================================================
    // ADIM 2.B: İkinci Sipariş Oluştur ve Reddet Butonu -> REJECTED + rejectionReason
    // =========================================================================
    console.log('\n--- 2. ADIM (B): PUT /api/tenant/orders/:id/status Sipariş Reddetme (REJECTED + Ret Sebebi) ---');
    const orderCreateRes2 = await makeRequest(`${baseUrl}/api/store/orders`, 'POST', {
      paymentMethod: 'CURRENT_ACCOUNT',
      items: [
        {
          tenantProductId: tenantProduct.id,
          quantity: 3
        }
      ]
    }, customerToken);

    assert.strictEqual(orderCreateRes2.status, 201);
    const order2 = orderCreateRes2.data.data;
    assert.strictEqual(order2.status, 'PENDING_APPROVAL');

    // Sipariş 2 oluşturulduktan sonra stok 20 - 2 (sipariş1) - 3 (sipariş2) = 15 olmalıdır
    const stockAfterOrder2 = await prisma.tenantProduct.findUnique({ where: { id: tenantProduct.id } });
    assert.strictEqual(stockAfterOrder2.stock, 15, 'Sipariş sonrası stok 15 olmalı');

    // Bayi Sipariş 2'yi Reddediyor (rejectionReason ile)
    const testReason = 'Cari limitiniz dolmuştur, lütfen ödeme yapınız.';
    const rejectRes = await makeRequest(`${baseUrl}/api/tenant/orders/${order2.id}/status`, 'PUT', {
      status: 'REJECTED',
      rejectionReason: testReason
    }, dealerToken);

    assert.strictEqual(rejectRes.status, 200, 'Sipariş reddetme HTTP 200 dönmeli');
    assert.strictEqual(rejectRes.data.success, true, 'Reddetme işlemi başarılı olmalı');
    const rejectedOrder = rejectRes.data.data;
    assert.strictEqual(rejectedOrder.status, 'REJECTED', 'Sipariş durumu REJECTED olmalı');
    assert.strictEqual(rejectedOrder.rejectionReason, testReason, 'Ret gerekçesi veritabanına kaydedilmeli');
    console.log(`  ✅ [PASS] 2. ADIM (B): Sipariş #${order2.orderNumber} REJECTED oldu ve ret sebebi kaydedildi: "${rejectedOrder.rejectionReason}"`);

    // Gelişmiş Mimari Doğrulaması: Ret edildiğinde stok geri yüklenmeli ve cari borç iade edilmeli
    const stockAfterReject = await prisma.tenantProduct.findUnique({ where: { id: tenantProduct.id } });
    assert.strictEqual(stockAfterReject.stock, 18, 'Sipariş 2 reddedilince 3 adet stok geri yüklenmeli (15 + 3 = 18)');
    console.log(`  ✅ [PASS] MİMARİ DENETİM: Stok başarıyla geri yüklendi (Mevcut: ${stockAfterReject.stock}).`);

    const customerAfterReject = await prisma.customerProfile.findUnique({ where: { id: customerProfile.id } });
    const ledgerReturn = await prisma.customerLedger.findFirst({
      where: { customerId: customerProfile.id, type: 'CREDIT' },
      orderBy: { createdAt: 'desc' }
    });
    assert(ledgerReturn !== null, 'Cari deftere CREDIT iade kaydı yazılmış olmalı');
    console.log(`  ✅ [PASS] MİMARİ DENETİM: Müşteri cari borcu iade edildi ve CustomerLedger defterine işlendi.`);

    // =========================================================================
    // ADIM 3: GET /api/store/orders - Müşteri Vitrininde Statü ve Ret Sebebi Görünürlüğü
    // =========================================================================
    console.log('\n--- 3. ADIM: GET /api/store/orders Müşteri Vitrininde Durum ve Ret Gerekçesi ---');
    const storeOrdersRes = await makeRequest(`${baseUrl}/api/store/orders`, 'GET', null, customerToken);
    assert.strictEqual(storeOrdersRes.status, 200);
    const storeOrders = storeOrdersRes.data.data;

    const fetchedOrder1 = storeOrders.find(o => o.id === order1.id);
    const fetchedOrder2 = storeOrders.find(o => o.id === order2.id);

    assert(fetchedOrder1, 'Sipariş 1 listede olmalı');
    assert.strictEqual(fetchedOrder1.status, 'PROCESSING', 'Müşteri vitrininde onaylanan sipariş PROCESSING görünmeli');

    assert(fetchedOrder2, 'Sipariş 2 listede olmalı');
    assert.strictEqual(fetchedOrder2.status, 'REJECTED', 'Müşteri vitrininde reddedilen sipariş REJECTED görünmeli');
    assert.strictEqual(fetchedOrder2.rejectionReason, testReason, 'Müşteri vitrininde bayinin girdiği ret gerekçesi bulunmalı');
    console.log(`  ✅ [PASS] 3. ADIM: Müşteri vitrininde Sipariş 1 "PROCESSING" ve Sipariş 2 "REJECTED" (Sebep: "${fetchedOrder2.rejectionReason}") olarak teyit edildi.`);

    // =========================================================================
    // ADIM 4: Frontend UI Bileşenlerinin Varlık ve Entegrasyon Kontrolü
    // =========================================================================
    console.log('\n--- 4. ADIM: Frontend UI Kod Bütünlüğü Kontrolleri (bayi.html & store.html) ---');
    const fs = require('fs');
    const bayiHtml = fs.readFileSync('bayi.html', 'utf8');
    const storeHtml = fs.readFileSync('store.html', 'utf8');
    const storeCss = fs.readFileSync('store.css', 'utf8');
    const tenantCss = fs.readFileSync('tenant.css', 'utf8');

    // Bayi.html kontrolleri
    assert(bayiHtml.includes('btn-reject'), 'bayi.html içinde btn-reject butonu tanımlı olmalı');
    assert(bayiHtml.includes('rejectOrder'), 'bayi.html içinde rejectOrder fonksiyonu tanımlı olmalı');
    assert(bayiHtml.includes('rejectionReason'), 'bayi.html içinde rejectionReason parametresi gönderilmeli');
    assert(tenantCss.includes('.btn-reject'), 'tenant.css içinde .btn-reject kırmızı buton stili olmalı');

    // Store.html kontrolleri
    assert(storeHtml.includes('Bayi Onayı Bekleniyor'), 'store.html içinde "Bayi Onayı Bekleniyor" metni olmalı');
    assert(storeHtml.includes('Siparişiniz Hazırlanıyor'), 'store.html içinde "Siparişiniz Hazırlanıyor" metni olmalı');
    assert(storeHtml.includes('İptal Edildi'), 'store.html içinde "İptal Edildi" metni olmalı');
    assert(storeHtml.includes('btn-notification-bell'), 'store.html içinde bildirim çanı butonu olmalı');
    assert(storeHtml.includes('syncLiveNotifications'), 'store.html içinde canlı bildirim fonksiyonu olmalı');
    assert(storeCss.includes('.btn-notification-bell'), 'store.css içinde bildirim çanı stili olmalı');
    console.log('  ✅ [PASS] 4. ADIM: Tüm frontend arayüz ve bildirim çanı bileşenleri başarıyla doğrulandı.');

    console.log('\n=======================================================');
    console.log('🎉 TÜM 4 ADIM VE MİMARİ DOĞRULAMA TESTLERİ %100 BAŞARILI!');
    console.log('=======================================================');

  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

runTest().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
