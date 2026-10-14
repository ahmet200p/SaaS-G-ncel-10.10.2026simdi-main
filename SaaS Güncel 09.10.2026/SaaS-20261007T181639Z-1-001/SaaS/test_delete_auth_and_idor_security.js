// ============================================================================
// Multi-Tenant B2B SaaS - DELETE Güvenliği & IDOR Önleme Testi
// (test_delete_auth_and_idor_security.js)
// prompt.md 3 Adımını Uçtan Uca Doğrular:
// 1. ADIM: Token Olmadan Yapay Kimlik Atamasının İptali
// 2. ADIM: Tavizsiz 401 Unauthorized Kuralı (Token'sız DELETE anında durdurulur)
// 3. ADIM: Controller Katmanında Sahiplik ve Tenant Doğrulaması (IDOR Önleme)
// ============================================================================

const http = require('http');
const assert = require('assert');
const app = require('./app');
const prisma = require('./lib/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');

const TEST_PORT = 5057;
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
  console.log('🛡️ DELETE GÜVENLİĞİ VE IDOR (TENANT İZOLASYON) TESTLERİ');
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
    await new Promise((resolve) => {
      server = app.listen(TEST_PORT, () => {
        console.log(`[TEST_SERVER] Test sunucusu port ${TEST_PORT} üzerinde dinliyor...`);
        resolve();
      });
    });

    const baseUrl = `http://localhost:${TEST_PORT}`;

    // ========================================================================
    // 1. & 2. ADIM: Token'sız DELETE İsteklerinin Tavizsiz 401 ile Reddedilmesi
    // ========================================================================
    console.log('\n--- 1. & 2. ADIM: Token Olmadan DELETE İsteklerinin Denetimi ---');

    // 1.A: Token'sız DELETE /api/tenant/customers/:id -> 401 Unauthorized
    const unauthDelCust = await makeRequest(`${baseUrl}/api/tenant/customers/random-uuid-123`, 'DELETE');
    check(unauthDelCust.status === 401, `Token'sız DELETE /api/tenant/customers/:id HTTP 401 döndü (Got ${unauthDelCust.status})`);
    check(unauthDelCust.data.success === false, 'Yanıtta success: false doğrulandı');

    // 1.B: Token'sız DELETE /api/tenant/products/:id -> 401 Unauthorized
    const unauthDelProd = await makeRequest(`${baseUrl}/api/tenant/products/random-uuid-456`, 'DELETE');
    check(unauthDelProd.status === 401, `Token'sız DELETE /api/tenant/products/:id HTTP 401 döndü (Got ${unauthDelProd.status})`);

    // 1.C: Token'sız DELETE /api/tenant/discounts/1 -> 401 Unauthorized
    const unauthDelDisc = await makeRequest(`${baseUrl}/api/tenant/discounts/1`, 'DELETE');
    check(unauthDelDisc.status === 401, `Token'sız DELETE /api/tenant/discounts/:id HTTP 401 döndü (Got ${unauthDelDisc.status})`);

    // ========================================================================
    // 3. ADIM: IDOR (Insecure Direct Object Reference) ve Sahiplik Doğrulaması
    // ========================================================================
    console.log('\n--- 3. ADIM: Farklı Bayiler Arası IDOR Silme Saldırısı Denetimi ---');

    // İki farklı bayi oluştur (Bayi A ve Bayi B)
    const subA = `bayi_a_${Date.now()}`;
    const tenantA = await prisma.tenant.create({
      data: {
        name: 'Bayi A Oto',
        subdomain: subA,
        themeColor: '#3b82f6',
        isActive: true
      }
    });

    const subB = `bayi_b_${Date.now()}`;
    const tenantB = await prisma.tenant.create({
      data: {
        name: 'Bayi B Oto',
        subdomain: subB,
        themeColor: '#10b981',
        isActive: true
      }
    });

    // Bayi A ve Bayi B için yöneticiler ve JWT üret
    const tokenA = jwt.sign(
      { id: `usr-${subA}`, email: `admin@${subA}.com`, role: 'TENANT_ADMIN', tenantId: tenantA.id },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const tokenB = jwt.sign(
      { id: `usr-${subB}`, email: `admin@${subB}.com`, role: 'TENANT_ADMIN', tenantId: tenantB.id },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Bayi B'ye ait bir müşteri oluştur
    const custBUser = await prisma.user.create({
      data: {
        email: `cust_b_${Date.now()}@service.com`,
        password: 'password123',
        role: 'CUSTOMER',
        tenantId: tenantB.id
      }
    });
    const customerB = await prisma.customerProfile.create({
      data: {
        userId: custBUser.id,
        tenantId: tenantB.id,
        companyName: 'Bayi B Sadık Servis',
        phone: '05559998877',
        customerType: 'MECHANIC',
        status: 'APPROVED'
      }
    });

    // Bayi B'ye ait bir katalog parçası oluştur
    const productItem = await prisma.product.create({
      data: {
        name: 'Özel B2B Fren Kaliperi',
        oeNumber: `OE-IDOR-${Date.now()}`,
        category: 'Fren Sistemi',
        defaultPrice: 1500
      }
    });
    const tenantProductB = await prisma.tenantProduct.create({
      data: {
        tenantId: tenantB.id,
        productId: productItem.id,
        stock: 10,
        customPrice: 1500
      }
    });

    // SALDIRI 1: Bayi A yöneticisi, Bayi B'nin müşterisini silmeye çalışır!
    console.log('  -> Saldırı 1: Bayi A, Bayi B müşterisini silmeye çalışıyor...');
    const idorDeleteCustRes = await makeRequest(`${baseUrl}/api/tenant/customers/${customerB.id}`, 'DELETE', null, {
      Authorization: `Bearer ${tokenA}`
    });

    check(idorDeleteCustRes.status === 404, `Bayi A, Bayi B'nin müşterisini SİLEMEDİ (HTTP 404 Not Found döndü, Got ${idorDeleteCustRes.status})`);
    check(idorDeleteCustRes.data.message.includes('bulunamadı veya bayinize ait değil'), 'Güvenli IDOR hata mesajı döndü');

    // Müşterinin veritabanında hala durduğunu doğrula
    const checkCustBStillExists = await prisma.customerProfile.findUnique({
      where: { id: customerB.id }
    });
    check(checkCustBStillExists !== null, 'Bayi B müşterisi veritabanında başarıyla korundu');

    // SALDIRI 2: Bayi A yöneticisi, Bayi B'nin ürününü ID tahmin ederek silmeye çalışır!
    console.log('  -> Saldırı 2: Bayi A, Bayi B ürününü silmeye çalışıyor...');
    const idorDeleteProdRes = await makeRequest(`${baseUrl}/api/tenant/products/${tenantProductB.id}`, 'DELETE', null, {
      Authorization: `Bearer ${tokenA}`
    });

    check(idorDeleteProdRes.status === 404, `Bayi A, Bayi B'nin ürününü SİLEMEDİ (HTTP 404 Not Found döndü, Got ${idorDeleteProdRes.status})`);

    // Ürünün veritabanında hala durduğunu doğrula
    const checkProdBStillExists = await prisma.tenantProduct.findUnique({
      where: { id: tenantProductB.id }
    });
    check(checkProdBStillExists !== null, 'Bayi B ürünü veritabanında başarıyla korundu');

    // MEŞRU İŞLEM: Bayi B kendi müşterisini silebilir
    console.log('  -> Meşru İşlem: Bayi B kendi müşterisini siliyor...');
    const legitDeleteCustRes = await makeRequest(`${baseUrl}/api/tenant/customers/${customerB.id}`, 'DELETE', null, {
      Authorization: `Bearer ${tokenB}`
    });
    check(legitDeleteCustRes.status === 200, `Bayi B kendi müşterisini başarıyla sildi (HTTP 200, Got ${legitDeleteCustRes.status})`);

    const finalCheckCustDeleted = await prisma.customerProfile.findUnique({
      where: { id: customerB.id }
    });
    check(finalCheckCustDeleted === null, 'Müşteri veritabanından başarıyla temizlendi');

    console.log('\n================================================================');
    console.log(`🎉 DELETE VE IDOR GÜVENLİK TESTLERİ TAMAMLANDI! (${passed}/${total})`);
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
