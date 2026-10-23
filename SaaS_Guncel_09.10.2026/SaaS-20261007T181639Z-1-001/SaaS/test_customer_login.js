// ============================================================================
// B2B Multi-Tenant SaaS - Müşteri (CUSTOMER) Giriş ve Token Doğrulama Testi
// Test Dosyası: test_customer_login.js
// ============================================================================

const http = require('http');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const app = require('./app');
const prisma = require('./lib/prisma');
const config = require('./config');

let server;
let port;

function runHttp(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: json, rawBody: body });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 1. ADIM: MÜŞTERİ (CUSTOMER) GİRİŞ & JWT TOKEN TESTİ');
  console.log('====================================================');

  server = http.createServer(app);
  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      console.log(`[TEST_SERVER] Geçici test sunucusu port:${port} üzerinde dinliyor.`);
      resolve();
    });
  });

  try {
    let custCheck = await prisma.user.findUnique({ where: { email: 'kemal@kemaloto.com' } });
    if (!custCheck) {
      require('child_process').execSync('node prisma/seed.js', { stdio: 'ignore' });
    }

    // 1. Müşteri (CUSTOMER) Giriş Denemesi
    console.log('\n--- 1. POST /api/auth/login ile Müşteri Girişi ---');
    const loginRes = await runHttp({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'kemal@kemaloto.com',
      password: '123456'
    });

    assert.strictEqual(loginRes.status, 200, 'Giriş HTTP 200 dönmelidir');
    assert.strictEqual(loginRes.body.success, true, 'Giriş success: true olmalıdır');
    assert(loginRes.body.token, 'JWT token üretilmiş olmalıdır');
    assert.strictEqual(loginRes.body.role, 'CUSTOMER', 'Rol CUSTOMER olmalıdır');
    console.log('  ✅ [PASS] Müşteri girişi başarılı (HTTP 200).');

    // 2. JWT Payload Çözümleme ve Alan Denetimi
    console.log('\n--- 2. JWT Payload İçerik Denetimi ---');
    const decoded = jwt.verify(loginRes.body.token, config.JWT_SECRET);
    assert(decoded.id, 'Token içinde kullanıcı id bulunmalıdır');
    assert.strictEqual(decoded.role, 'CUSTOMER', 'Token içindeki role CUSTOMER olmalıdır');
    assert(decoded.tenantId, 'Token içinde tenantId eksiksiz bulunmalıdır');
    console.log(`  ✅ [PASS] JWT Token doğrulandı: ID=${decoded.id}, Role=${decoded.role}, TenantID=${decoded.tenantId}`);

    // 3. User Nesnesinde CustomerProfile ve Tenant İlişkisi Denetimi
    console.log('\n--- 3. Yanıtta CustomerProfile ve Tenant İlişkileri ---');
    const userObj = loginRes.body.user;
    assert(userObj, 'Yanıt user objesi içermelidir');
    assert(userObj.customerProfile, 'User objesi müşteri profili (customerProfile) içermelidir');
    assert(userObj.customerProfile.companyName, 'Müşteri firma unvanı mevcut olmalıdır');
    assert(userObj.tenant, 'User objesi bağlı olunan bayi (tenant) bilgisini içermelidir');
    assert.strictEqual(userObj.tenantId, decoded.tenantId, 'User tenantId ile token tenantId eşleşmelidir');
    console.log(`  ✅ [PASS] Profil bilgileri doğrulandı: Firma="${userObj.customerProfile.companyName}", Bayi="${userObj.tenant.name}"`);

    // 4. Hatalı Şifre Kontrolü
    console.log('\n--- 4. Hatalı Şifre Güvenlik Denetimi ---');
    const wrongPassRes = await runHttp({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'kemal@kemaloto.com',
      password: 'yanlis_sifre_123'
    });
    assert.strictEqual(wrongPassRes.status, 401, 'Hatalı şifrede HTTP 401 dönmelidir');
    assert.strictEqual(wrongPassRes.body.success, false, 'Hatalı şifrede success: false olmalıdır');
    console.log('  ✅ [PASS] Hatalı şifrede güvenli şekilde HTTP 401 döndü.');

    // 5. Müşteri Tokenı ile B2B Vitrin API Erişimi (GET /api/store/products)
    console.log('\n--- 5. CUSTOMER Tokenı ile Vitrin Erişimi (/api/store/products) ---');
    const storeRes = await runHttp({
      hostname: '127.0.0.1',
      port,
      path: '/api/store/products',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${loginRes.body.token}` }
    });
    assert.strictEqual(storeRes.status, 200, 'Vitrin ürünleri HTTP 200 dönmelidir');
    assert(storeRes.body.success, 'Vitrin çağrısı başarılı olmalıdır');
    console.log(`  ✅ [PASS] Vitrin erişimi doğrulandı. Müşteriye özel ${storeRes.body.count || (storeRes.body.data && storeRes.body.data.length)} adet ürün listelendi.`);

    // 6. ADIM 3: Yeni Müşteri Kaydı (User + CustomerProfile) ve Otomatik Giriş Doğrulaması
    console.log('\n--- 6. 3. ADIM: POST /api/tenant/customers ile User (Bcrypt) + CustomerProfile Entegrasyonu ---');
    // 6.a Bayi Girişi (Tenant Admin Token Alma)
    const dealerLoginRes = await runHttp({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'ahmet@ahmetoto.com',
      password: '123456'
    });
    assert.strictEqual(dealerLoginRes.status, 200, 'Bayi girişi başarılı olmalıdır');
    const dealerToken = dealerLoginRes.body.token;

    // 6.b Bayi tarafından yeni müşteri kaydı oluşturma
    const testEmail = `servis_test_${Date.now()}@b2boto.com`;
    const testPassword = 'GizliSifre2026!';
    const createCustomerRes = await runHttp({
      hostname: '127.0.0.1',
      port,
      path: '/api/tenant/customers',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dealerToken}`
      }
    }, {
      companyName: 'Akdeniz Turbo Otoservis',
      phone: '05449998877',
      address: 'Antalya Akdeniz Sanayi Sitesi No:12',
      email: testEmail,
      password: testPassword,
      discountRate: 22.5,
      balance: 1500
    });

    assert.strictEqual(createCustomerRes.status, 201, 'Müşteri kaydı HTTP 201 dönmelidir');
    assert.strictEqual(createCustomerRes.body.success, true, 'Müşteri kaydı başarılı olmalıdır');
    const createdCustomerId = createCustomerRes.body.data.id;
    const createdUserId = createCustomerRes.body.data.userId;
    console.log(`  ✅ [PASS] Yeni müşteri kaydedildi: CustomerID=${createdCustomerId}, UserID=${createdUserId}`);

    // 6.c Veritabanında User tablosu, rolü ve Bcrypt hash kontrolü
    const dbUser = await prisma.user.findUnique({
      where: { id: createdUserId },
      include: { customerProfile: { include: { tenant: true } } }
    });
    assert(dbUser, 'User tablosunda kayıt bulunmalıdır');
    assert.strictEqual(dbUser.role, 'CUSTOMER', 'User rolü CUSTOMER olmalıdır');
    assert.strictEqual(dbUser.email, testEmail, 'User e-posta adresi eşleşmelidir');
    assert(dbUser.password.startsWith('$2a$') || dbUser.password.startsWith('$2b$'), 'Şifre bcrypt ile hashlenmiş olmalıdır');
    assert(dbUser.customerProfile, 'User ile CustomerProfile ilişkisi kurulmuş olmalıdır');
    assert.strictEqual(dbUser.customerProfile.id, createdCustomerId, 'Profil ID eşleşmelidir');
    assert(dbUser.customerProfile.tenantId, 'tenantId ilişkisi kurulmuş olmalıdır');
    console.log('  ✅ [PASS] User tablosunda CUSTOMER rolü, Bcrypt şifre hash ve CustomerProfile bağlantısı doğrulandı.');

    // 6.d Yeni oluşturulan müşteri ile POST /auth/login ve POST /api/auth/login üzerinden giriş
    console.log('\n--- 7. Yeni Müşteri ile /auth/login ve /api/auth/login Doğrulaması ---');
    for (const loginPath of ['/api/auth/login', '/auth/login']) {
      const newCustLoginRes = await runHttp({
        hostname: '127.0.0.1',
        port,
        path: loginPath,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        email: testEmail,
        password: testPassword
      });

      assert.strictEqual(newCustLoginRes.status, 200, `${loginPath} üzerinden müşteri girişi HTTP 200 dönmelidir`);
      assert(newCustLoginRes.body.token, 'JWT token üretilmiş olmalıdır');
      assert.strictEqual(newCustLoginRes.body.role, 'CUSTOMER', 'Rol CUSTOMER olmalıdır');
      assert(newCustLoginRes.body.user.customerProfile, 'Yanıtta customerProfile nesnesi bulunmalıdır');
      assert(newCustLoginRes.body.user.customerProfile.tenant, 'Müşteri profilinde bağlı olunan tenant bilgisi bulunmalıdır');

      const tokenDecoded = jwt.verify(newCustLoginRes.body.token, config.JWT_SECRET);
      assert.strictEqual(tokenDecoded.id, createdUserId, 'Token içindeki kullanıcı ID doğru olmalıdır');
      assert.strictEqual(tokenDecoded.role, 'CUSTOMER', 'Token içindeki rol CUSTOMER olmalıdır');
      assert.strictEqual(tokenDecoded.tenantId, dbUser.customerProfile.tenantId, 'Token içindeki tenantId eşleşmelidir');
      console.log(`  ✅ [PASS] ${loginPath} üzerinden yeni müşteri başarıyla giriş yaptı, JWT ve CustomerProfile doğrulandı.`);
    }

    // 6.e Test verisinin temizlenmesi
    await prisma.customerProfile.deleteMany({ where: { id: createdCustomerId } });
    await prisma.user.deleteMany({ where: { id: createdUserId } });
    console.log('  ✅ [PASS] Test müşterisi veritabanından temizlendi.');

    console.log('\n====================================================');
    console.log('🎉 TÜM MÜŞTERİ GİRİŞ, USER VE TOKEN TESTLERİ BAŞARIYLA TAMAMLANDI!');
    console.log('====================================================');

  } finally {
    if (server) server.close();
  }
}

runTests().catch(err => {
  console.error('❌ TEST BAŞARISIZ:', err);
  process.exit(1);
});
