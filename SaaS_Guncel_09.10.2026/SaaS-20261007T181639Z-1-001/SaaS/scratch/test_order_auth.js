/**
 * Test: Sipariş Tamamlama Auth (401) ve Başarılı Sipariş Doğrulaması
 */
const http = require('http');
const jwt = require('jsonwebtoken');

async function runTests() {
  console.log('--- TEST BAŞLANGICI: Sipariş Tamamlama (Checkout) Auth & 401 Doğrulaması ---');

  const devPg = require('../backend-api/dev_pg_server');
  await devPg.startServer();

  const app = require('../backend-api/app');
  const config = require('../backend-api/config');
  const prisma = require('../backend-api/lib/prisma');

  function makeRequest(server, path, method = 'GET', headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const port = server.address().port;
      const reqHeaders = { ...headers };
      let postData = null;

      if (body) {
        postData = JSON.stringify(body);
        reqHeaders['Content-Type'] = 'application/json';
        reqHeaders['Content-Length'] = Buffer.byteLength(postData);
      }

      const options = {
        hostname: '127.0.0.1',
        port: port,
        path: path,
        method: method,
        headers: reqHeaders
      };

      const req = http.request(options, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(rawData);
          } catch (_) {
            json = { text: rawData };
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json
          });
        });
      });

      req.on('error', (e) => reject(e));
      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
    }
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // 1. Token olmadan POST /api/store/orders çağrısı
    const res1 = await makeRequest(
      server,
      '/api/store/orders',
      'POST',
      { 'X-Tenant-Slug': 'ahmetoto' },
      { items: [{ tenantProductId: 'dummy-id', quantity: 1 }] }
    );

    assert(
      res1.status === 401,
      `Token olmadan POST /api/store/orders HTTP 401 dönmeli (Alınan: ${res1.status})`
    );
    assert(
      res1.body.error === 'Oturum süreniz dolmuş, lütfen tekrar giriş yapın.',
      `Token olmadan dönen hata mesajı beklenen formatta olmalı (Alınan error: "${res1.body.error}")`
    );

    // 2. Bozuk token ile POST /api/store/orders çağrısı
    const res2 = await makeRequest(
      server,
      '/api/store/orders',
      'POST',
      { 'Authorization': 'Bearer gecersiz_ve_bozuk_token', 'X-Tenant-Slug': 'ahmetoto' },
      { items: [{ tenantProductId: 'dummy-id', quantity: 1 }] }
    );

    assert(
      res2.status === 401 || res2.status === 403,
      `Bozuk token ile istek HTTP 401 veya 403 dönmeli (Alınan: ${res2.status})`
    );
    assert(
      res2.body.error === 'Oturum süreniz dolmuş, lütfen tekrar giriş yapın.',
      `Bozuk token ile dönen hata mesajı beklenen formatta olmalı (Alınan error: "${res2.body.error}")`
    );

    // 3. Süresi dolmuş token simülasyonu
    const expiredToken = jwt.sign(
      { id: 'usr-expired', email: 'exp@test.com', role: 'CUSTOMER', tenantId: 'tenant-test' },
      config.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const res3 = await makeRequest(
      server,
      '/api/store/orders',
      'POST',
      { 'Authorization': `Bearer ${expiredToken}`, 'X-Tenant-Slug': 'ahmetoto' },
      { items: [{ tenantProductId: 'dummy-id', quantity: 1 }] }
    );

    assert(
      res3.status === 401,
      `Süresi dolmuş token ile istek HTTP 401 dönmeli (Alınan: ${res3.status})`
    );
    assert(
      res3.body.error === 'Oturum süreniz dolmuş, lütfen tekrar giriş yapın.',
      `Süresi dolmuş token ile dönen hata mesajı beklenen formatta olmalı (Alınan error: "${res3.body.error}")`
    );

    // 4. Token olmadan POST /api/orders köprüsüne çağrı
    const res4 = await makeRequest(
      server,
      '/api/orders',
      'POST',
      { 'X-Tenant-Slug': 'ahmetoto' },
      { items: [{ tenantProductId: 'dummy-id', quantity: 1 }] }
    );

    assert(
      res4.status !== 500,
      `Token olmadan POST /api/orders köprüsüne istek 500 vermemeli (Alınan: ${res4.status})`
    );
    assert(
      res4.status === 401 || res4.status === 403,
      `Token olmadan POST /api/orders köprüsüne istek 401/403 dönmeli (Alınan: ${res4.status})`
    );

    // 5. Müşteri (CUSTOMER) token'ı oluştur ve doğrula
    const tenant = await prisma.tenant.findUnique({ where: { subdomain: 'ahmetoto' } });
    if (tenant) {
      // Test kullanıcısı ve profili bul veya oluştur
      let testUser = await prisma.user.findFirst({
        where: { email: 'test_checkout_musteri@b2b.com' }
      });
      if (!testUser) {
        testUser = await prisma.user.create({
          data: {
            email: 'test_checkout_musteri@b2b.com',
            password: 'hashed_password_123456',
            role: 'CUSTOMER',
            status: 'APPROVED',
            name: 'Test Müşteri Servisi',
            tenantId: tenant.id
          }
        });
        await prisma.customerProfile.create({
          data: {
            userId: testUser.id,
            tenantId: tenant.id,
            companyName: 'Test Müşteri Servisi',
            phone: '05551234567',
            balance: 0,
            discountRate: 20.0
          }
        });
      }

      const validToken = jwt.sign(
        { id: testUser.id, email: testUser.email, role: 'CUSTOMER', tenantId: tenant.id },
        config.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Boş sepet ile istek at: 400 Bad Request dönmeli (500 veya 401 değil)
      const res5 = await makeRequest(
        server,
        '/api/store/orders',
        'POST',
        { 'Authorization': `Bearer ${validToken}`, 'X-Tenant-Slug': 'ahmetoto' },
        { items: [] }
      );

      assert(
        res5.status === 400,
        `Geçerli token ve boş sepet ile HTTP 400 dönmeli (Alınan: ${res5.status})`
      );
      assert(
        res5.body.message === 'Lütfen sipariş edilecek en az bir ürün belirtiniz.',
        `Boş sepet Türkçe uyarı mesajı dönmeli`
      );
    }

    console.log(`\n==============================================`);
    console.log(`TEST SONUCU: ${passed} / ${total} test başarıyla geçti.`);
    console.log(`==============================================`);

  } finally {
    server.close();
  }

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test çalışma hatası:', err);
  process.exit(1);
});
