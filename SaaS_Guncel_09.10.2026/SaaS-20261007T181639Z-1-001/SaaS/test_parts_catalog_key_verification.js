const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data || '{}'), raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runVerification() {
  console.log('====================================================');
  console.log('🧪 PARTS CATALOGS API ANAHTARI VE GÜVENLİK TESTİ');
  console.log('====================================================\n');

  let passed = 0;

  // 1. backend-api/.env Dosya Kontrolü
  console.log('--- 1. .env Dosyasında PARTS_CATALOG_API_KEY Kontrolü ---');
  const envPath = path.join(__dirname, 'backend-api', '.env');
  assert(fs.existsSync(envPath), 'backend-api/.env dosyası mevcut olmalıdır.');
  const envContent = fs.readFileSync(envPath, 'utf8');
  assert(
    envContent.includes('PARTS_CATALOG_API_KEY="OEM-API-BD39DFA8-9AE9-4E7F-8B6D-3D1011BF973F"'),
    'backend-api/.env içinde PARTS_CATALOG_API_KEY doğru değerle tanımlanmış olmalıdır.'
  );
  console.log('  ✅ [PASS] backend-api/.env dosyasına PARTS_CATALOG_API_KEY başarıyla eklendi.');
  passed++;

  // 2. Backend Çalışma Zamanı (Runtime / process.env) Okuma Kontrolü
  console.log('--- 2. Backend Config / process.env Okuma Kontrolü ---');
  require('dotenv').config({ path: envPath });
  assert.strictEqual(
    process.env.PARTS_CATALOG_API_KEY,
    'OEM-API-BD39DFA8-9AE9-4E7F-8B6D-3D1011BF973F',
    'process.env.PARTS_CATALOG_API_KEY backend ortamında başarıyla okunmalıdır.'
  );
  const config = require('./backend-api/config');
  assert.strictEqual(
    config.PARTS_CATALOG_API_KEY,
    'OEM-API-BD39DFA8-9AE9-4E7F-8B6D-3D1011BF973F',
    'config.PARTS_CATALOG_API_KEY export edilmiş olmalıdır.'
  );
  console.log('  ✅ [PASS] Backend, .env dosyasındaki anahtarı ("OEM-API-BD39DFA8-...") başarıyla okudu.');
  passed++;

  // 3. Frontend (admin.html) Başlık ve Hardcode Güvenlik Kontrolü
  console.log('--- 3. Frontend admin.html Başlık ve Güvenlik Denetimi ---');
  const adminHtmlPath = path.join(__dirname, 'saas-panel-ui', 'admin.html');
  assert(fs.existsSync(adminHtmlPath), 'saas-panel-ui/admin.html dosyası mevcut olmalıdır.');
  const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');

  // Başlık kontrolü
  assert(
    adminHtml.includes('Parts Catalogs API Anahtarı'),
    'admin.html içinde "Parts Catalogs API Anahtarı" başlığı yer almalıdır.'
  );

  // KESİNLİKLE hardcode yazılmama kuralı kontrolü
  assert(
    !adminHtml.includes('OEM-API-BD39DFA8-9AE9-4E7F-8B6D-3D1011BF973F'),
    'GÜVENLİK İHLALİ: PARTS_CATALOG_API_KEY frontend dosyasına hardcoded olarak ASLA yazılmamalıdır!'
  );
  assert(
    !adminHtml.includes('value="tc_live_demo_984182938472"'),
    'Eski hardcoded demo API anahtarı HTML içinden temizlenmiş olmalıdır.'
  );
  console.log('  ✅ [PASS] "Parts Catalogs API Anahtarı" başlığı güncellendi ve frontend dosyasına şifre hardcoded yazılmadı.');
  passed++;

  // 4. Canlı REST API Üzerinden Super Admin Settings Doğrulaması
  console.log('--- 4. Canlı REST API (GET /api/admin/settings) Entegrasyon Testi ---');
  const jwt = require('jsonwebtoken');
  let token;
  try {
    const loginRes = await httpRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'admin@sistem.com',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'SaaS_Super_Admin_2026!#Secure'
    });
    if (loginRes.status === 200) {
      token = loginRes.body.token || (loginRes.body.data && loginRes.body.data.token);
    }
  } catch (e) {}

  if (!token) {
    try {
      const loginRes2 = await httpRequest({
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        email: 'admin@sistem.com',
        password: '123456'
      });
      if (loginRes2.status === 200) {
        token = loginRes2.body.token || (loginRes2.body.data && loginRes2.body.data.token);
      }
    } catch (e) {}
  }

  if (!token) {
    token = jwt.sign(
      { id: '3fc39b13-01a9-4a7d-a834-5f583982533a', email: 'admin@sistem.com', role: 'SUPER_ADMIN' },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }
  assert(token, 'Geçerli bir Süper Admin JWT token temin edilmelidir.');

  const settingsRes = await httpRequest({
    hostname: 'localhost',
    port: 5000,
    path: '/api/admin/settings',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  assert.strictEqual(settingsRes.status, 200, 'GET /api/admin/settings 200 dönmelidir.');
  assert(settingsRes.body.success, 'Ayarlar çağrısı success: true dönmelidir.');
  const sData = settingsRes.body.data;
  assert(sData, 'Settings verisi bulunmalıdır.');

  assert.strictEqual(
    sData.partsCatalogApiKey,
    'OEM-API-BD39DFA8-9AE9-4E7F-8B6D-3D1011BF973F',
    'API yanıtında partsCatalogApiKey değeri .env dosyasından dinamik olarak okunup dönmelidir.'
  );
  console.log(`  ✅ [PASS] Canlı API, .env'deki Parts Catalogs API Anahtarını başarıyla döndürdü (${sData.partsCatalogApiKey.slice(0, 12)}...).`);
  passed++;

  console.log('\n====================================================');
  console.log(`🎉 TOPLAM ${passed}/4 ADIMDA TÜM DOĞRULAMA VE GÜVENLİK TESTLERİ BAŞARIYLA TAMAMLANDI!`);
  console.log('====================================================');
}

runVerification().catch(err => {
  console.error('❌ Test Hatası:', err);
  process.exit(1);
});
