// ============================================================================
// 3-KATMALI HEADLESS MİMARİ & UÇTAN UCA GÜVENLİK DOĞRULAMA TESTİ
// (backend-api / saas-panel-ui / storefront-ui)
// ============================================================================

const fs = require('fs');
const path = require('path');
const http = require('http');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS]: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL]: ${message}`);
    failedTests++;
  }
}

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json: json
        });
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
  console.log('================================================================');
  console.log('🏛️ 3-KATMALI HEADLESS MİMARİ & UÇTAN UCA GÜVENLİK TESTİ BAŞLATILIYOR');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // BÖLÜM 1: 3 FİZİKSEL DİZİN & HEADLESS REST API İZOLASYONU
  // --------------------------------------------------------------------------
  console.log('--- 1. BÖLÜM: 3 Katmanlı Mimari ve Dosya Bütünlüğü ---');
  
  const rootDir = __dirname;
  const backendDir = path.join(rootDir, 'backend-api');
  const panelDir = path.join(rootDir, 'saas-panel-ui');
  const storeDir = path.join(rootDir, 'storefront-ui');

  assert(fs.existsSync(backendDir) && fs.statSync(backendDir).isDirectory(), 'backend-api klasörü mevcut');
  assert(fs.existsSync(panelDir) && fs.statSync(panelDir).isDirectory(), 'saas-panel-ui klasörü mevcut');
  assert(fs.existsSync(storeDir) && fs.statSync(storeDir).isDirectory(), 'storefront-ui klasörü mevcut');

  // backend-api içinde ASLA .html dosyası bulunmamalıdır!
  function findHtmlFiles(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(findHtmlFiles(fullPath));
      } else if (entry.name.endsWith('.html')) {
        results.push(fullPath);
      }
    }
    return results;
  }
  const backendHtmls = findHtmlFiles(backendDir);
  assert(backendHtmls.length === 0, `backend-api klasöründe kesinlikle hiçbir .html dosyası bulunmamalıdır (Tespit edilen: ${backendHtmls.length})`);

  // saas-panel-ui dosya kontrolleri
  assert(fs.existsSync(path.join(panelDir, 'admin.html')), 'saas-panel-ui/admin.html mevcut');
  assert(fs.existsSync(path.join(panelDir, 'bayi.html')), 'saas-panel-ui/bayi.html mevcut');
  assert(fs.existsSync(path.join(panelDir, 'login.html')), 'saas-panel-ui/login.html mevcut');
  assert(fs.existsSync(path.join(panelDir, 'index.html')), 'saas-panel-ui/index.html mevcut');
  assert(fs.existsSync(path.join(panelDir, 'assets', 'js', 'api.js')), 'saas-panel-ui/assets/js/api.js mevcut');

  // storefront-ui dosya kontrolleri
  assert(fs.existsSync(path.join(storeDir, 'store.html')), 'storefront-ui/store.html mevcut');
  assert(fs.existsSync(path.join(storeDir, 'store.css')), 'storefront-ui/store.css mevcut');
  assert(fs.existsSync(path.join(storeDir, 'assets', 'js', 'api.js')), 'storefront-ui/assets/js/api.js mevcut');

  // --------------------------------------------------------------------------
  // BÖLÜM 2: HEADLESS REST API SAF JSON & HTML BLOKAJI
  // --------------------------------------------------------------------------
  console.log('\n--- 2. BÖLÜM: Headless REST API Saf JSON & HTML Blokajı ---');

  const rootRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/',
    method: 'GET'
  });
  assert(rootRes.statusCode === 200, 'GET / isteği HTTP 200 OK döner');
  assert(rootRes.json && rootRes.json.success === true, 'GET / saf JSON API metadata döner');
  assert(!rootRes.body.includes('<!DOCTYPE html>'), 'GET / yanıtı HTML içermez');

  const htmlBlockRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/admin.html',
    method: 'GET'
  });
  assert(htmlBlockRes.statusCode === 404, 'backend-api üzerinden .html istekleri 404 döner');
  assert(htmlBlockRes.json && htmlBlockRes.json.message && htmlBlockRes.json.message.includes('Headless REST API'), 'Açıklayıcı Headless REST API JSON yanıtı döner');

  // --------------------------------------------------------------------------
  // BÖLÜM 3: PROMPT.MD 3 GÜVENLİK KURALI DOĞRULAMASI
  // --------------------------------------------------------------------------
  console.log('\n--- 3. BÖLÜM: prompt.md 3 Güvenlik Kuralı ---');

  // Kural 1: Yetki Kısıtlaması (Read-Only)
  // X-Tenant-API-Key ile vitrin ürünleri çekilebilir
  const storeApiKeyRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/store/products',
    method: 'GET',
    headers: {
      'X-Tenant-API-Key': 'tk_live_ahmetoto_test_api_key_2026',
      'Origin': 'http://ahmetoto.com'
    }
  });
  assert(storeApiKeyRes.statusCode === 200, 'Kural 1: Vitrin API Key ile /api/store/products erişimi 200 OK');

  // X-Tenant-API-Key ile /api/admin rotasına erişim 403 API_KEY_SCOPE_FORBIDDEN ile engellenmeli
  const adminScopeRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/tenants',
    method: 'GET',
    headers: {
      'X-Tenant-API-Key': 'tk_live_ahmetoto_test_api_key_2026',
      'Origin': 'http://ahmetoto.com'
    }
  });
  assert(adminScopeRes.statusCode === 403, 'Kural 1: Vitrin API Key ile /api/admin rotası 403 ile engellendi');
  assert(adminScopeRes.json && adminScopeRes.json.error === 'API_KEY_SCOPE_FORBIDDEN', 'Kural 1: Hata kodu API_KEY_SCOPE_FORBIDDEN');

  // X-Tenant-API-Key ile /api/tenant rotasına erişim 403 API_KEY_SCOPE_FORBIDDEN ile engellenmeli
  const tenantScopeRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/tenant/catalog',
    method: 'GET',
    headers: {
      'X-Tenant-API-Key': 'tk_live_ahmetoto_test_api_key_2026',
      'Origin': 'http://ahmetoto.com'
    }
  });
  assert(tenantScopeRes.statusCode === 403, 'Kural 1: Vitrin API Key ile /api/tenant rotası 403 ile engellendi');
  assert(tenantScopeRes.json && tenantScopeRes.json.error === 'API_KEY_SCOPE_FORBIDDEN', 'Kural 1: Hata kodu API_KEY_SCOPE_FORBIDDEN');

  // Kural 2: Sıkı CORS Kontrolü (Origin vs customDomain)
  const evilCorsRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/store/products',
    method: 'GET',
    headers: {
      'X-Tenant-API-Key': 'tk_live_ahmetoto_test_api_key_2026',
      'Origin': 'http://hacker-site.org'
    }
  });
  assert(evilCorsRes.statusCode === 403, 'Kural 2: customDomain ile uyuşmayan Origin 403 ile engellendi');

  // Kural 3: SHA-256 Hash Doğrulaması
  const badKeyRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/store/products',
    method: 'GET',
    headers: {
      'X-Tenant-API-Key': 'sahte_ve_gecersiz_key_12345'
    }
  });
  assert(badKeyRes.statusCode === 401, 'Kural 3: Geçersiz API key 401 Unauthorized ile reddedildi');
  assert(badKeyRes.json && badKeyRes.json.error === 'INVALID_API_KEY', 'Kural 3: Hata kodu INVALID_API_KEY');

  // --------------------------------------------------------------------------
  // BÖLÜM 4: CORS BEYAZ LİSTE (PANEL & STOREFRONT UYUMLULUĞU)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. BÖLÜM: CORS İzinleri (Panel & Storefront) ---');

  const originsToTest = [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://localhost:3001',
    'http://panel.saas.com',
    'http://ahmetoto.com'
  ];

  for (const origin of originsToTest) {
    const corsRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/health',
      method: 'GET',
      headers: {
        'Origin': origin
      }
    });
    assert(corsRes.statusCode === 200, `CORS Origin izni geçerli: ${origin}`);
    assert(
      corsRes.headers['access-control-allow-origin'] === origin ||
      corsRes.headers['access-control-allow-origin'] === '*',
      `Access-Control-Allow-Origin başlığı doğru ayarlandı (${origin})`
    );
  }

  // --------------------------------------------------------------------------
  // BÖLÜM 5: KİMLİK DOĞRULAMA & ROL AKIŞI
  // --------------------------------------------------------------------------
  console.log('\n--- 5. BÖLÜM: Kimlik Doğrulama & Oturum Yönetimi ---');

  // Süper Admin Girişi
  const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || 'SaaS_Super_Admin_2026!#Secure';
  let adminLoginRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'admin@sistem.com', password: adminPass });

  if (adminLoginRes.statusCode !== 200) {
    adminLoginRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'admin@sistem.com', password: '123456' });
  }

  let adminToken = null;
  if (adminLoginRes.statusCode === 200 && adminLoginRes.json && adminLoginRes.json.token) {
    adminToken = adminLoginRes.json.token;
  }
  assert(adminLoginRes.statusCode === 200, 'Süper Admin girişi başarılı (HTTP 200)');
  assert(adminLoginRes.json && adminLoginRes.json.user && adminLoginRes.json.user.role === 'SUPER_ADMIN', 'Süper Admin rolü SUPER_ADMIN');

  // Bayi Yöneticisi Girişi
  const dealerPass = process.env.DEFAULT_DEALER_PASSWORD || 'SaaS_Dealer_Admin_2026!#Secure';
  let tenantLoginRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'ahmet@ahmetoto.com', password: dealerPass });

  if (tenantLoginRes.statusCode !== 200) {
    tenantLoginRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'ahmet@ahmetoto.com', password: '123456' });
  }

  let tenantToken = null;
  if (tenantLoginRes.statusCode === 200 && tenantLoginRes.json && tenantLoginRes.json.token) {
    tenantToken = tenantLoginRes.json.token;
  }
  assert(tenantLoginRes.statusCode === 200, 'Bayi Yöneticisi girişi başarılı (HTTP 200)');
  assert(tenantLoginRes.json && tenantLoginRes.json.user && tenantLoginRes.json.user.role === 'TENANT_ADMIN', 'Bayi Yöneticisi rolü TENANT_ADMIN');

  // --------------------------------------------------------------------------
  // BÖLÜM 6: TÜM FETCH ÇAĞRILARININ VE APİ_BASE'İN ABSOLUTE URL UYUMU
  // --------------------------------------------------------------------------
  console.log('\n--- 6. BÖLÜM: Frontend Absolute URL & api.js Uyumu ---');

  const panelApiContent = fs.readFileSync(path.join(panelDir, 'assets', 'js', 'api.js'), 'utf8');
  assert(panelApiContent.includes('http://localhost:5000/api'), 'saas-panel-ui api.js http://localhost:5000/api adresini içerir');

  const storeApiContent = fs.readFileSync(path.join(storeDir, 'assets', 'js', 'api.js'), 'utf8');
  assert(storeApiContent.includes('http://localhost:5000/api'), 'storefront-ui api.js http://localhost:5000/api adresini içerir');

  const loginHtmlContent = fs.readFileSync(path.join(panelDir, 'login.html'), 'utf8');
  assert(loginHtmlContent.includes('assets/js/api.js'), 'saas-panel-ui/login.html assets/js/api.js dosyasını import eder');

  // --------------------------------------------------------------------------
  // TEST SONUCU
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 TEST SONUÇLARI: ${passedTests}/${totalTests} BAŞARILI, ${failedTests} HATALI`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 3 KATMALI HEADLESS MİMARİ VE GÜVENLİK GEREKSİNİMLERİ %100 BAŞARIYLA DOĞRULANDI!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Beklenmeyen test hatası:', err);
  process.exit(1);
});
