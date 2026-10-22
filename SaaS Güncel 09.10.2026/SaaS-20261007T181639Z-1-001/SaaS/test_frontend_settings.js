const fs = require('fs');
const path = require('path');

function runFrontendSettingsTests() {
  console.log('====================================================');
  console.log('🧪 3. ADIM: FRONTEND (admin.html) SÖZLEŞME VE İŞLEV TESTİ');
  console.log('====================================================');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  const adminHtmlPath = fs.existsSync(path.join(__dirname, 'admin.html'))
    ? path.join(__dirname, 'admin.html')
    : path.join(__dirname, 'saas-panel-ui', 'admin.html');
  const indexHtmlPath = fs.existsSync(path.join(__dirname, 'index.html'))
    ? path.join(__dirname, 'index.html')
    : path.join(__dirname, 'saas-panel-ui', 'index.html');

  assert(fs.existsSync(adminHtmlPath), 'admin.html dosyası mevcut.');
  assert(fs.existsSync(indexHtmlPath), 'index.html dosyası mevcut.');

  const adminContent = fs.readFileSync(adminHtmlPath, 'utf8');
  const indexContent = fs.readFileSync(indexHtmlPath, 'utf8');

  // 1. Form alanları ve id kontrolleri (setting-tecdoc-key, setting-tax-rate vb.)
  assert(adminContent.includes('id="setting-tecdoc-key"'), 'Parts Catalogs / TecDoc API Key için id="setting-tecdoc-key" mevcut.');
  assert(adminContent.includes('Parts Catalogs API Anahtarı'), 'Sistem Ayarları sekmesinde "Parts Catalogs API Anahtarı" başlığı mevcut.');
  assert(!adminContent.includes('OEM-API-BD39DFA8-9AE9-4E7F-8B6D-3D1011BF973F'), 'PARTS_CATALOG_API_KEY frontend dosyasına hardcoded olarak ASLA yazılmamalıdır (Güvenlik Kuralı).');
  assert(adminContent.includes('id="setting-tecdoc-endpoint"'), 'Sağlayıcı Endpoint için id="setting-tecdoc-endpoint" mevcut.');
  assert(adminContent.includes('id="setting-default-discount"'), 'B2B İskonto için id="setting-default-discount" mevcut.');
  assert(adminContent.includes('id="setting-tax-rate"'), 'KDV Oranı için id="setting-tax-rate" mevcut.');
  assert(adminContent.includes('id="setting-currency"'), 'Para Birimi için id="setting-currency" mevcut.');
  assert(adminContent.includes('id="setting-admin-email"'), 'Yönetici E-Postası için id="setting-admin-email" mevcut.');

  // 2. 'Ayarları Kaydet' butonu ve id="btn-save-settings"
  assert(adminContent.includes('id="btn-save-settings"'), '<button id="btn-save-settings"> butonu mevcut.');
  assert(adminContent.includes('Ayarları Kaydet'), 'Buton içinde "Ayarları Kaydet" metni mevcut.');

  // 3. loadSettings() fonksiyonu kontrolü
  assert(adminContent.includes('function loadSettings()') || adminContent.includes('async function loadSettings()'), 'loadSettings() fonksiyonu tanımlı.');
  assert(adminContent.includes('/admin/settings'), 'loadSettings() içinde /admin/settings API çağrısı mevcut.');

  // 4. Kaydetme olayı ve PUT çağrısı
  assert(adminContent.includes("method: 'PUT'") || adminContent.includes('method: "PUT"'), 'Form kaydetme işleminde method: PUT kullanılıyor.');
  assert(adminContent.includes('Ayarlar başarıyla kaydedildi'), "Başarılı kayıtta 'Ayarlar başarıyla kaydedildi' bildirimi mevcut.");

  // 5. admin.html ve index.html senkronizasyonu
  assert(adminContent === indexContent, 'admin.html ve index.html birebir senkronize.');

  console.log('\n====================================================');
  console.log(`📊 TEST SONUCU: ${passed}/${total} Başarılı (%${Math.round((passed / total) * 100)})`);
  console.log('====================================================');
}

runFrontendSettingsTests();
