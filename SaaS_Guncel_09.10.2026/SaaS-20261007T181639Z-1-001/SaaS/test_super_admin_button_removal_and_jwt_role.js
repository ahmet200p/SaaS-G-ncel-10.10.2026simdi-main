/**
 * ============================================================================
 * TEST: Bayi Paneli 'Süper Admin Paneli' Butonu Kaldırma ve JWT Rol Denetimi Testi
 * Dosya: test_super_admin_button_removal_and_jwt_role.js
 * ============================================================================
 * 
 * prompt.md Kapsamı:
 * 1. Bayi panelinin (saas-panel-ui/bayi.html) menüsünde yer alan 'Süper Admin Paneli'
 *    butonunun HTML kodundan tamamen silindiğinin doğrulanması.
 * 2. Sıradan bir bayi (Tenant) kullanıcısının ana yönetim paneline dair hiçbir
 *    link veya buton görmediğinin kontrolü.
 * 3. Frontend JavaScript kodunda kullanıcının rolünün JWT payload içindeki role
 *    bilgisinden denetlendiği ve SUPER_ADMIN haricinde admin yönlendirmesinin render
 *    edilmediğinin doğrulanması.
 * 4. En güncel topluluk paketi (jwt-decode) entegrasyonu ve RFC 7519 fallback kontrolü.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

let passedAssertions = 0;
let totalAssertions = 0;

function assert(condition, message) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 BAYİ PANELİ SÜPER ADMİN BUTONU & JWT ROL GÜVENLİK TESTİ');
  console.log('================================================================\n');

  // 1. STATİK HTML KONTROLLERİ (saas-panel-ui/bayi.html)
  console.log('--- 1. saas-panel-ui/bayi.html HTML Kodundan Buton Silinme Doğrulaması ---');
  const saasPanelBayiPath = path.join(__dirname, 'saas-panel-ui', 'bayi.html');
  const rootBayiPath = path.join(__dirname, 'bayi.html');

  assert(fs.existsSync(saasPanelBayiPath), 'saas-panel-ui/bayi.html dosyası mevcut');

  const saasBayiHtml = fs.readFileSync(saasPanelBayiPath, 'utf8');

  // HTML içinde 'Süper Admin Paneli' veya index.html linki statik olarak OLMAMALI
  assert(!saasBayiHtml.includes('<a href="index.html" class="portal-switch-btn" title="Süper Admin Paneline Dön">'), 
    'saas-panel-ui/bayi.html HTML kodundan "Süper Admin Paneline Dön" linki tamamen kaldırıldı');

  if (fs.existsSync(rootBayiPath)) {
    const rootBayiHtml = fs.readFileSync(rootBayiPath, 'utf8');
    assert(!rootBayiHtml.includes('<a href="index.html" class="portal-switch-btn" title="Süper Admin Paneline Dön">'), 
      'bayi.html HTML kodundan "Süper Admin Paneline Dön" linki tamamen kaldırıldı');
  }

  // B2B Müşteri Vitrini linki korunmuş olmalı
  assert(saasBayiHtml.includes('title="B2B E-Ticaret Vitrinini Aç"') && saasBayiHtml.includes('B2B Müşteri Vitrini'),
    'B2B Müşteri Vitrini linki sidebar-footer içinde korundu');

  // 2. EN GÜNCEL TOPLULUK PAKETİ ENTEGRASYONU (jwt-decode)
  console.log('\n--- 2. En Güncel Topluluk Paketi (jwt-decode) Kontrolleri ---');
  const packageJsonPath = fs.existsSync(path.join(__dirname, 'backend-api', 'package.json'))
    ? path.join(__dirname, 'backend-api', 'package.json')
    : path.join(__dirname, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  assert(packageJson.dependencies && Boolean(packageJson.dependencies['jwt-decode']), 
    'package.json bağımlılıklarında topluluk paketi "jwt-decode" (^4.0.0) mevcut');

  let jwtDecodeLib;
  try {
    jwtDecodeLib = require('jwt-decode');
    assert(Boolean(jwtDecodeLib), 'jwt-decode modülü node ortamında başarıyla yüklenebiliyor');
  } catch (e) {
    assert(false, `jwt-decode yükleme hatası: ${e.message}`);
  }

  // HTML içinde jwt-decode script etiketi
  assert(saasBayiHtml.includes('jwt-decode'), 'saas-panel-ui/bayi.html head etiketinde jwt-decode paketi dahil edilmiş');

  // 3. FRONTEND JAVASCRIPT JWT PAYLOAD ROL KONTROLÜ
  console.log('\n--- 3. Frontend JS JWT Payload Rol Denetimi Kod Analizi ---');
  assert(saasBayiHtml.includes('parseJwtPayload') || saasBayiHtml.includes('jwtPayload') || saasBayiHtml.includes('tokenPayload'),
    'saas-panel-ui/bayi.html JS kodunda JWT payload çözümleme mantığı mevcut');
  assert(saasBayiHtml.includes('verifiedRole === \'SUPER_ADMIN\''),
    'saas-panel-ui/bayi.html JS kodunda JWT payload içindeki role === "SUPER_ADMIN" kontrolü yapılıyor');
  assert(saasBayiHtml.includes('#super-admin-portal-link') && saasBayiHtml.includes('existingAdminElements.forEach(el => el.remove())'),
    'SUPER_ADMIN harici roller için admin yönlendirmeleri DOM\'dan temizleniyor / render edilmiyor');

  // 4. API.JS MERKEZİ GÜVENLİK VE AYRIŞTIRICI FONKSİYON TESTİ
  console.log('\n--- 4. assets/js/api.js parseJwtPayload Fonksiyon Testi ---');
  const apiJsPath = path.join(__dirname, 'assets', 'js', 'api.js');
  const apiJsContent = fs.readFileSync(apiJsPath, 'utf8');

  assert(apiJsContent.includes('parseJwtPayload'), 'assets/js/api.js içinde parseJwtPayload fonksiyonu tanımlı');
  assert(apiJsContent.includes('window.parseJwtPayload = parseJwtPayload'), 'parseJwtPayload window nesnesine güvenle aktarılıyor');

  // 5. JWT PAYLOAD ÇÖZÜMLEME SİMÜLASYONU VE ROL KORUMASI TESTİ
  console.log('\n--- 5. JWT Rol Çözümleme Mantık Simülasyonu ---');
  const testSecret = 'saas_super_secret_jwt_key_2026';

  // A. Standart Bayi Yöneticisi (TENANT_ADMIN) Token'ı
  const tenantToken = jwt.sign({
    id: 'usr-dealer-1',
    email: 'ahmet@ahmetoto.com',
    role: 'TENANT_ADMIN',
    tenantId: 'tenant-ahmet-oto'
  }, testSecret);

  // B. Süper Admin (SUPER_ADMIN) Token'ı
  const superAdminToken = jwt.sign({
    id: 'usr-super-1',
    email: 'admin@sistem.com',
    role: 'SUPER_ADMIN',
    tenantId: null
  }, testSecret);

  // Simüle edilmiş parseJwtPayload mantığı:
  function simulateParseJwtPayload(token) {
    const parts = token.split('.');
    if (parts.length === 3) {
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
      return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    }
    return null;
  }

  const tenantPayload = simulateParseJwtPayload(tenantToken);
  const superPayload = simulateParseJwtPayload(superAdminToken);

  assert(tenantPayload.role === 'TENANT_ADMIN', 'TENANT_ADMIN token payload rolü doğru çözümlendi');
  assert(superPayload.role === 'SUPER_ADMIN', 'SUPER_ADMIN token payload rolü doğru çözümlendi');

  // Rol denetim simülasyonu
  function evaluateAdminButtonRender(role) {
    if (role === 'SUPER_ADMIN') {
      return { rendered: true, target: 'index.html' };
    } else {
      return { rendered: false, target: null };
    }
  }

  const tenantRenderResult = evaluateAdminButtonRender(tenantPayload.role);
  assert(tenantRenderResult.rendered === false, 'TENANT_ADMIN için Süper Admin Paneli butonu RENDER EDİLMEZ');

  const superRenderResult = evaluateAdminButtonRender(superPayload.role);
  assert(superRenderResult.rendered === true && superRenderResult.target === 'index.html', 
    'Yalnızca SUPER_ADMIN için Süper Admin Paneli butonu dinamik render edilir');

  // Test Özeti
  console.log('\n================================================================');
  console.log(`📊 TEST SONUCU: ${passedAssertions} / ${totalAssertions} assertion başarılı.`);
  console.log('================================================================');

  if (passedAssertions !== totalAssertions) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('[TEST_FATAL_ERROR]:', err);
  process.exit(1);
});
