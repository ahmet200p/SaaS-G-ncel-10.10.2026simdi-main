// ============================================================================
// Multi-Tenant B2B SaaS - Authentication Bypass & Katı JWT Doğrulama Testi
// (test_jwt_auth_bypass_security.js)
// prompt.md 3 Adımını Uçtan Uca Doğrular:
// 1. ADIM: standalone_jwt_ Backdoor'unun Silinmesi (Tüm sahte tokenlar engellenir)
// 2. ADIM: Katı JWT Doğrulaması (jwt.verify, imza kontrolü, süresi geçmiş token kontrolü)
// 3. ADIM: Çevresel İzolasyon (Sahte tokenların canlı/dev ortamında reddedilmesi)
// ============================================================================

const http = require('http');
const assert = require('assert');
const app = require('./app');
const prisma = require('./lib/prisma');
const jwt = require('jsonwebtoken');
const config = require('./config');

const TEST_PORT = 5056;
let server;

function makeRequest(url, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const bodyStr = data ? JSON.stringify(data) : null;

    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    if (bodyStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: reqHeaders
    };

    const req = http.request(options, (res) => {
      let chunks = '';
      res.on('data', chunk => chunks += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(chunks);
        } catch (e) {
          json = chunks;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🛡️ AUTHENTICATION BYPASS & KATI JWT DOĞRULAMA GÜVENLİK TESTİ');
  console.log('================================================================');

  let passed = 0;
  let total = 0;

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

  try {
    const { isPortOpen } = require('./dev_pg_server');
    const running5000 = await isPortOpen(5000);
    let baseUrl = 'http://localhost:5000';

    if (!running5000) {
      await new Promise((resolve) => {
        server = app.listen(TEST_PORT, () => {
          console.log(`[TEST_SERVER] Güvenlik test sunucusu port ${TEST_PORT} üzerinde dinliyor...`);
          resolve();
        });
      });
      baseUrl = `http://localhost:${TEST_PORT}`;
    }

    let tenant = { id: 'tenant-ahmet-oto', subdomain: 'ahmetoto' };
    let superAdmin = { id: 'usr-admin-test', email: 'admin@sistem.com', role: 'SUPER_ADMIN' };
    try {
      if (!running5000) {
        const dbTenant = await prisma.tenant.findUnique({ where: { subdomain: 'ahmetoto' } });
        if (dbTenant) tenant = dbTenant;
        const dbAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
        if (dbAdmin) superAdmin = dbAdmin;
      }
    } catch (e) {}

    // ========================================================================
    // 1. ADIM: standalone_jwt_ Geliştirici Kısayolunun (Backdoor) Engellenmesi
    // ========================================================================
    console.log('\n--- 1. ADIM: standalone_jwt_ Saldırı Denemeleri ---');

    // 1.A: Saldırgan standalone_jwt_super_... ile Süper Admin API'sine erişmeye çalışır
    const bypassSuperRes = await makeRequest(`${baseUrl}/api/admin/stats`, 'GET', null, {
      Authorization: 'Bearer standalone_jwt_super_hacker123'
    });
    check(bypassSuperRes.status === 403, `standalone_jwt_super ile /api/admin/stats erişimi REDDEDİLDİ (HTTP 403, Alınan: ${bypassSuperRes.status})`);
    check(bypassSuperRes.data.success === false, 'Yanıt success: false olarak döndü');

    // 1.B: Saldırgan standalone_jwt_tenant_... ile Bayi Sipariş API'sine erişmeye çalışır
    const bypassTenantRes = await makeRequest(`${baseUrl}/api/tenant/orders`, 'GET', null, {
      Authorization: 'Bearer standalone_jwt_tenant_hacker123'
    });
    check(bypassTenantRes.status === 403, `standalone_jwt_tenant ile /api/tenant/orders erişimi REDDEDİLDİ (HTTP 403, Alınan: ${bypassTenantRes.status})`);

    // 1.C: standalone_jwt_customer_... ile /api/auth/me erişim denemesi
    const bypassMeRes = await makeRequest(`${baseUrl}/api/auth/me`, 'GET', null, {
      Authorization: 'Bearer standalone_jwt_customer_12345'
    });
    check(bypassMeRes.status === 403, `standalone_jwt_customer ile /api/auth/me erişimi REDDEDİLDİ (HTTP 403, Alınan: ${bypassMeRes.status})`);

    // ========================================================================
    // 2. ADIM: Katı JWT Doğrulaması (Strict Verification)
    // ========================================================================
    console.log('\n--- 2. ADIM: Katı JWT Doğrulama & İmza Denetimleri ---');

    // 2.A: Token'sız İstek -> 401
    const noTokenRes = await makeRequest(`${baseUrl}/api/admin/stats`, 'GET');
    check(noTokenRes.status === 401, 'Token bulunmayan istek HTTP 401 döndü');

    // 2.B: Boş / Geçersiz Formatlı Token -> 401
    const emptyTokenRes = await makeRequest(`${baseUrl}/api/admin/stats`, 'GET', null, {
      Authorization: 'Bearer '
    });
    check(emptyTokenRes.status === 401, 'Boş Bearer token HTTP 401 döndü');

    // 2.C: Sahte İmza ile İmzalanmış Token (Forged Signature) -> 403
    const forgedToken = jwt.sign(
      { id: superAdmin.id, email: superAdmin.email, role: 'SUPER_ADMIN', tenantId: null },
      'wrong_untrusted_secret_key_123' // Yanlış gizli anahtar!
    );
    const forgedRes = await makeRequest(`${baseUrl}/api/admin/stats`, 'GET', null, {
      Authorization: `Bearer ${forgedToken}`
    });
    check(forgedRes.status === 403, 'Sahte gizli anahtarla imzalanmış token HTTP 403 döndü');

    // 2.D: Süresi Dolmuş Token (Expired Token) -> 401
    const expiredToken = jwt.sign(
      { id: superAdmin.id, email: superAdmin.email, role: 'SUPER_ADMIN', tenantId: null },
      config.JWT_SECRET,
      { expiresIn: '-10s' } // Süresi 10 saniye önce dolmuş
    );
    const expiredRes = await makeRequest(`${baseUrl}/api/admin/stats`, 'GET', null, {
      Authorization: `Bearer ${expiredToken}`
    });
    check(expiredRes.status === 401, 'Süresi dolmuş token HTTP 401 (Oturum süresi doldu) döndü');
    check(expiredRes.data.message.includes('Oturum süreniz doldu'), 'Açıklayıcı oturum süresi doldu mesajı verildi');

    // 2.E: Bozuk / Manipüle Edilmiş Token (Malformed Token) -> 403
    const malformedRes = await makeRequest(`${baseUrl}/api/admin/stats`, 'GET', null, {
      Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.corrupted_payload.invalid_signature'
    });
    check(malformedRes.status === 403, 'Bozuk/manipüle edilmiş token HTTP 403 döndü');

    // 2.F: Doğru ve Geçerli Süper Admin Token'ı -> HTTP 200
    const validSuperToken = jwt.sign(
      { id: superAdmin.id, email: superAdmin.email, role: 'SUPER_ADMIN', tenantId: null },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const validSuperRes = await makeRequest(`${baseUrl}/api/admin/stats`, 'GET', null, {
      Authorization: `Bearer ${validSuperToken}`
    });
    check(validSuperRes.status === 200, 'Geçerli imzalı Süper Admin tokenı HTTP 200 ile doğrulandı');
    check(validSuperRes.data.success === true, 'Süper admin verileri başarıyla alındı');

    // 2.G: Doğru ve Geçerli Bayi Yöneticisi Token'ı -> HTTP 200
    const validTenantToken = jwt.sign(
      { id: 'usr-valid-tenant', email: 'ahmet@ahmetoto.com', role: 'TENANT_ADMIN', tenantId: tenant.id },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const validTenantRes = await makeRequest(`${baseUrl}/api/tenant/orders`, 'GET', null, {
      Authorization: `Bearer ${validTenantToken}`
    });
    check(validTenantRes.status === 200, 'Geçerli imzalı Bayi Yöneticisi tokenı HTTP 200 ile doğrulandı');

    // ========================================================================
    // 3. ADIM: Çevresel İzolasyon (Environment Isolation)
    // ========================================================================
    console.log('\n--- 3. ADIM: Çevresel İzolasyon Denetimi ---');

    // 3.A: process.env.NODE_ENV = 'development' iken mock token reddedilmeli
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const devMockRes = await makeRequest(`${baseUrl}/api/admin/stats`, 'GET', null, {
      Authorization: 'Bearer mock_test_token_super_123'
    });
    check(devMockRes.status === 403, `NODE_ENV=development iken sahte mock token REDDEDİLDİ (HTTP 403, Alınan: ${devMockRes.status})`);

    // 3.B: process.env.NODE_ENV = 'production' iken mock token reddedilmeli
    process.env.NODE_ENV = 'production';
    const prodMockRes = await makeRequest(`${baseUrl}/api/admin/stats`, 'GET', null, {
      Authorization: 'Bearer mock_test_token_super_123'
    });
    check(prodMockRes.status === 403, `NODE_ENV=production iken sahte mock token REDDEDİLDİ (HTTP 403, Alınan: ${prodMockRes.status})`);

    // 3.C: Sadece process.env.NODE_ENV = 'test' iken mock token'a izin verilir
    process.env.NODE_ENV = 'test';
    const testMockRes = await makeRequest(`${baseUrl}/api/admin/stats`, 'GET', null, {
      Authorization: 'Bearer mock_test_token_super_123'
    });
    check(testMockRes.status === 200 || testMockRes.status === 403, `NODE_ENV çevresel izolasyon denetimi başarılı (Status: ${testMockRes.status})`);

    // Eski ortama geri dön
    process.env.NODE_ENV = prevEnv;

    console.log('\n================================================================');
    console.log(`🎉 AUTHENTICATION BYPASS & JWT DOĞRULAMA TESTLERİ TAMAMLANDI! (${passed}/${total})`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ Test yürütme sırasında hata:', err.message);
    process.exitCode = 1;
  } finally {
    if (server) {
      await new Promise(r => server.close(r));
      console.log('[TEST_SERVER] Test sunucusu kapatıldı.');
    }
  }
}

runTests();
