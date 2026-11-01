// ============================================================================
// Multi-Tenant B2B SaaS - Headless Mimari Doğrulama Testi
// Kapsam:
// 1. Dizin Ayrıştırması: backend-api ve storefront-ui klasör yapıları
// 2. storefront-ui Bağımsızlığı: store.html, store.css, assets/js/api.js ve görseller
// 3. backend-api Bütünlüğü: server.js, app.js, routes, prisma, middleware, config, lib
// 4. API & Statik İletişim: REST API üzerinden veri çekme ve başlık enjeksiyonu
// ============================================================================

const fs = require('fs');
const path = require('path');
const http = require('http');

let passed = 0;
let total = 0;

function check(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

function request(method, pathUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathUrl, 'http://localhost:5000');
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = { raw: data };
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🏗️ HEADLESS MİMARİ & DİZİN AYRIŞTIRMASI DOĞRULAMA TESTİ');
  console.log('================================================================\n');

  const baseDir = __dirname;
  const backendDir = path.join(baseDir, 'backend-api');
  const storefrontDir = path.join(baseDir, 'storefront-ui');

  // 1. Dizin Varlık Kontrolleri
  console.log('--- 1. Klasör Yapısı ve Ayrıştırma Kontrolleri ---');
  check(fs.existsSync(backendDir) && fs.statSync(backendDir).isDirectory(), 'backend-api ana klasörü mevcut.');
  check(fs.existsSync(storefrontDir) && fs.statSync(storefrontDir).isDirectory(), 'storefront-ui ana klasörü mevcut.');

  // 2. storefront-ui Dosya Kontrolleri
  console.log('\n--- 2. storefront-ui (Müşteri Vitrini) Dosya Bütünlüğü ---');
  check(fs.existsSync(path.join(storefrontDir, 'store.html')), 'storefront-ui/store.html başarıyla taşındı.');
  check(fs.existsSync(path.join(storefrontDir, 'store.css')), 'storefront-ui/store.css başarıyla taşındı.');
  check(fs.existsSync(path.join(storefrontDir, 'assets', 'js', 'api.js')), 'storefront-ui/assets/js/api.js istemci motoru mevcut.');
  check(fs.existsSync(path.join(storefrontDir, 'assets', 'logos')), 'storefront-ui/assets/logos araç marka logoları mevcut.');
  check(fs.existsSync(path.join(storefrontDir, 'image.png')), 'storefront-ui/image.png vitrin görseli mevcut.');

  // Storefront İzolasyon Denetimi (Sunucu kodu içermemeli)
  check(!fs.existsSync(path.join(storefrontDir, 'server.js')), 'storefront-ui içinde sunucu (server.js) kodu bulunmuyor (Tam Decoupled).');
  check(!fs.existsSync(path.join(storefrontDir, 'prisma')), 'storefront-ui içinde veritabanı (prisma) katmanı bulunmuyor.');
  check(!fs.existsSync(path.join(storefrontDir, 'routes')), 'storefront-ui içinde backend route katmanı bulunmuyor.');

  // 3. backend-api Dosya Kontrolleri
  console.log('\n--- 3. backend-api (Sunucu & API Motoru) Dosya Bütünlüğü ---');
  check(fs.existsSync(path.join(backendDir, 'server.js')), 'backend-api/server.js sunucu başlatıcı mevcut.');
  check(fs.existsSync(path.join(backendDir, 'app.js')), 'backend-api/app.js Express uygulama katmanı mevcut.');
  check(fs.existsSync(path.join(backendDir, 'dev_pg_server.js')), 'backend-api/dev_pg_server.js veritabanı sürücüsü mevcut.');
  check(fs.existsSync(path.join(backendDir, 'routes', 'auth.routes.js')), 'backend-api/routes/auth.routes.js kimlik doğrulama rotası mevcut.');
  check(fs.existsSync(path.join(backendDir, 'routes', 'store.js')), 'backend-api/routes/store.js B2B vitrin API rotası mevcut.');
  check(fs.existsSync(path.join(backendDir, 'routes', 'tenant.js')), 'backend-api/routes/tenant.js bayi API rotası mevcut.');
  check(fs.existsSync(path.join(backendDir, 'routes', 'superAdmin.js')), 'backend-api/routes/superAdmin.js süper admin rotası mevcut.');
  check(fs.existsSync(path.join(backendDir, 'middleware', 'auth.js')), 'backend-api/middleware/auth.js yetkilendirme katmanı mevcut.');
  check(fs.existsSync(path.join(backendDir, 'middleware', 'rateLimiter.js')), 'backend-api/middleware/rateLimiter.js hız sınırlayıcı mevcut.');
  check(fs.existsSync(path.join(backendDir, 'config', 'index.js')), 'backend-api/config/index.js yapılandırma modülü mevcut.');
  check(fs.existsSync(path.join(backendDir, 'lib', 'prisma.js')), 'backend-api/lib/prisma.js veritabanı istemcisi mevcut.');
  check(fs.existsSync(path.join(backendDir, 'prisma', 'schema.prisma')), 'backend-api/prisma/schema.prisma veritabanı şeması mevcut.');

  // 4. Canlı Sunucu & Headless İletişim Doğrulaması
  console.log('\n--- 4. Canlı Headless API & Storefront İletişim Testi ---');
  const healthRes = await request('GET', '/api/health');
  check(healthRes.statusCode === 200 && healthRes.data.status === 'UP', 'backend-api canlı sağlık kontrolü başarılı (HTTP 200 UP).');

  const productsRes = await request('GET', '/api/store/products?limit=5', {
    'X-Tenant-Slug': 'ahmetoto'
  });
  check(
    productsRes.statusCode === 200 && productsRes.data.success && productsRes.data.isGuest === true,
    'Headless API: storefront-ui için unauthenticated GET /api/store/products (X-Tenant-Slug ile) 200 OK döner.'
  );

  const tenantInfoRes = await request('GET', '/api/store/tenant-info', {
    'X-Tenant-Slug': 'ahmetoto'
  });
  check(
    tenantInfoRes.statusCode === 200 && tenantInfoRes.data.data.subdomain === 'ahmetoto',
    'Headless API: storefront-ui marka ve tema çözümleme rotası (GET /api/store/tenant-info) 200 OK döner.'
  );

  console.log('\n================================================================');
  console.log(`🎉 TEST SONUCU: ${passed}/${total} (%${Math.round((passed / total) * 100)}) BAŞARILI`);
  console.log('================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[HEADLESS_TEST_FATAL_ERROR]:', err);
  process.exit(1);
});
