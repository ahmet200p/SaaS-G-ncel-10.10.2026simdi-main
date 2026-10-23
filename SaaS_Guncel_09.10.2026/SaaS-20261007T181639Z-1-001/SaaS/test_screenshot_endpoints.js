const http = require('http');
const assert = require('assert');

const endpoints = [
  '/api/tenant/customers',
  '/api/tenant/products',
  '/api/products',
  '/api/tenant/dashboard-stats?_t=' + Date.now(),
  '/api/tenant/orders',
  '/api/tenant/discounts',
  '/api/tenant/returns?status=PENDING',
  '/api/tenant/returns'
];

const origins = [
  { origin: 'null', shouldPass: true, label: 'file:// (Desktop/Windows doğrudan açılış)' },
  { origin: 'http://localhost:5500', shouldPass: true, label: 'Localhost port 5500' },
  { origin: 'http://127.0.0.1:5500', shouldPass: true, label: '127.0.0.1 port 5500' },
  { origin: 'http://192.168.1.100:5500', shouldPass: true, label: 'LAN IP (Yerel Ağ / Wi-Fi)' },
  { origin: 'http://localhost:5502', shouldPass: true, label: 'Farklı Localhost Portu' },
  { origin: 'http://evil-competitor.com', shouldPass: false, label: 'Zararlı Dış Saldırgan Origin' }
];

function testRequest(method, path, origin) {
  return new Promise((resolve) => {
    const headers = {
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,content-type,x-tenant-slug'
    };
    if (origin !== undefined) {
      headers['Origin'] = origin;
    }

    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });
    req.on('error', (err) => resolve({ error: err }));
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🧪 EKRAN GÖRÜNTÜSÜNDEKİ TÜM ENDPOINT\'LER İÇİN PREFLIGHT (OPTIONS) TESTİ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  for (const ep of endpoints) {
    console.log(`\n🔍 Endpoint: ${ep}`);
    for (const item of origins) {
      const res = await testRequest('OPTIONS', ep, item.origin);
      if (item.shouldPass) {
        if (res.statusCode === 200 || res.statusCode === 204) {
          console.log(`  ✅ [PASS] ${item.label} -> HTTP ${res.statusCode}`);
          passed++;
        } else {
          console.error(`  ❌ [FAIL] ${item.label} -> Beklenen: 200/204, Alınan: ${res.statusCode}`);
          failed++;
        }
      } else {
        if (res.statusCode === 403) {
          console.log(`  🛡️ [BLOCKED] ${item.label} -> Başarıyla HTTP ${res.statusCode} ile engellendi`);
          passed++;
        } else {
          console.error(`  ❌ [FAIL] ${item.label} -> Beklenen: 403, Alınan: ${res.statusCode}`);
          failed++;
        }
      }
    }
  }

  console.log('\n================================================================');
  console.log(`TEST SONUCU: ${passed} BAŞARILI, ${failed} HATALI (${endpoints.length * origins.length} TOPLAM KONTROL)`);
  console.log('================================================================');
  if (failed > 0) process.exit(1);
}

run();
