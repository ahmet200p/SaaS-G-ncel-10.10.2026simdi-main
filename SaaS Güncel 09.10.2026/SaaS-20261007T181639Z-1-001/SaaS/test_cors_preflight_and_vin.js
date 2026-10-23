// ============================================================================
// Multi-Tenant B2B SaaS - CORS Preflight (OPTIONS) ve Şasi (VIN) Doğrulama Testi
// ============================================================================

const http = require('http');

function makeRequest({ method, path, headers }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 5000,
      path: path,
      method: method,
      headers: headers || {}
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json || data
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

async function runTests() {
  console.log('=================================================================');
  console.log('🚀 CORS PREFLIGHT (OPTIONS) VE ŞASİ (VIN) DÜZELTME TESTLERİ');
  console.log('=================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // --------------------------------------------------------------------------
    // TEST 1: Şasi (VIN) Arama Uç Noktası Preflight (OPTIONS) Testi
    // --------------------------------------------------------------------------
    console.log('--- [1. TEST: Şasi (VIN) OPTIONS Preflight İsteği] ---');
    const resVinPreflight = await makeRequest({
      method: 'OPTIONS',
      path: '/api/catalog/search-vin/VF15R040H52814321',
      headers: {
        'Origin': 'http://localhost:5500',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization, content-type, x-tenant-slug'
      }
    });

    assert(
      resVinPreflight.statusCode === 200 || resVinPreflight.statusCode === 204,
      `Preflight HTTP Durumu: ${resVinPreflight.statusCode} (403 OLMAMALI, 200 veya 204 bekleniyor)`
    );

    const allowOrigin1 = resVinPreflight.headers['access-control-allow-origin'];
    assert(
      allowOrigin1 === 'http://localhost:5500',
      `Access-Control-Allow-Origin: ${allowOrigin1}`
    );

    const allowHeaders1 = (resVinPreflight.headers['access-control-allow-headers'] || '').toLowerCase();
    assert(
      allowHeaders1.includes('x-tenant-slug') && allowHeaders1.includes('authorization') && allowHeaders1.includes('content-type'),
      `Access-Control-Allow-Headers başlıkları X-Tenant-Slug, Authorization, Content-Type içeriyor: "${allowHeaders1}"`
    );

    const allowMethods1 = resVinPreflight.headers['access-control-allow-methods'] || '';
    assert(
      allowMethods1.includes('GET') && allowMethods1.includes('OPTIONS'),
      `Access-Control-Allow-Methods izin verilen metodlar: ${allowMethods1}`
    );

    // --------------------------------------------------------------------------
    // TEST 2: Bayi Rotaları (Tenant / Approval Middleware) Preflight Testi
    // --------------------------------------------------------------------------
    console.log('\n--- [2. TEST: Bayi (Tenant / Approval) Rotaları OPTIONS Preflight İsteği] ---');
    const resTenantPreflight = await makeRequest({
      method: 'OPTIONS',
      path: '/api/tenant/products',
      headers: {
        'Origin': 'http://localhost:5500',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type, x-tenant-slug'
      }
    });

    assert(
      resTenantPreflight.statusCode === 200 || resTenantPreflight.statusCode === 204,
      `Bayi Preflight HTTP Durumu: ${resTenantPreflight.statusCode} (verifyToken/checkTenantAdmin takılmadan geçmeli)`
    );
    assert(
      resTenantPreflight.headers['access-control-allow-origin'] === 'http://localhost:5500',
      `Bayi Preflight Origin Doğrulandı: ${resTenantPreflight.headers['access-control-allow-origin']}`
    );

    // --------------------------------------------------------------------------
    // TEST 3: Vitrin Rotaları (Store / ResolveTenant Middleware) Preflight Testi
    // --------------------------------------------------------------------------
    console.log('\n--- [3. TEST: Vitrin (Store / ResolveTenant) OPTIONS Preflight İsteği] ---');
    const resStorePreflight = await makeRequest({
      method: 'OPTIONS',
      path: '/api/store/products',
      headers: {
        'Origin': 'http://localhost:5500',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-tenant-slug, content-type'
      }
    });

    assert(
      resStorePreflight.statusCode === 200 || resStorePreflight.statusCode === 204,
      `Vitrin Preflight HTTP Durumu: ${resStorePreflight.statusCode} (resolveTenant takılmadan geçmeli)`
    );

    // --------------------------------------------------------------------------
    // TEST 4: Canlı Şasi (VIN) GET Sorgusu ve CORS Yanıt Başlıkları Testi
    // --------------------------------------------------------------------------
    console.log('\n--- [4. TEST: Canlı Şasi (VIN) GET Sorgusu & CORS Başlıkları] ---');
    const resVinGet = await makeRequest({
      method: 'GET',
      path: '/api/catalog/search-vin/VF15R040H52814321',
      headers: {
        'Origin': 'http://localhost:5500',
        'X-Tenant-Slug': 'ahmetoto',
        'Accept': 'application/json'
      }
    });

    assert(
      resVinGet.statusCode === 200,
      `Şasi GET Sorgusu HTTP 200 OK döndü: ${resVinGet.statusCode}`
    );
    assert(
      resVinGet.headers['access-control-allow-origin'] === 'http://localhost:5500',
      `Şasi GET CORS Origin onaylandı: ${resVinGet.headers['access-control-allow-origin']}`
    );
    assert(
      resVinGet.headers['access-control-allow-credentials'] === 'true',
      `CORS Credentials (Cookie/Auth) İzni: ${resVinGet.headers['access-control-allow-credentials']}`
    );
    assert(
      resVinGet.data && resVinGet.data.success === true && resVinGet.data.data?.vehicleBrand,
      `Araç bilgileri başarıyla çözümlendi: ${resVinGet.data?.data?.vehicleBrand} (${resVinGet.data?.data?.compatibleModels || 'Modeller'})`
    );

    // --------------------------------------------------------------------------
    // TEST 5: Yetkisiz Origin Engelleme (Hacker Koruması) Testi
    // --------------------------------------------------------------------------
    console.log('\n--- [5. TEST: Zararlı / Bilinmeyen Origin Engelleme (Hacker Koruması)] ---');
    const resMalicious = await makeRequest({
      method: 'GET',
      path: '/api/catalog/search-vin/VF1BZ0G0H46123456',
      headers: {
        'Origin': 'http://malicious-hacker-site.ru',
        'X-Tenant-Slug': 'ahmetoto'
      }
    });

    assert(
      resMalicious.statusCode === 403,
      `Yetkisiz Origin HTTP 403 ile başarıyla engellendi: ${resMalicious.statusCode}`
    );
    assert(
      !resMalicious.headers['access-control-allow-origin'],
      `Yetkisiz Origin'e Access-Control-Allow-Origin başlığı VERİLMEDİ`
    );

    console.log('\n=================================================================');
    console.log(`TEST SONUCU: ${passed} BAŞARILI, ${failed} HATALI`);
    console.log('=================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test çalıştırma hatası:', err);
    process.exit(1);
  }
}

runTests();
