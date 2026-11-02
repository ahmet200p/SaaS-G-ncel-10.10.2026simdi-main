/**
 * Test: Login Yönlendirme (Routing) Hatası ve Rol Bazlı Erişim Doğrulama Testi
 * prompt.md ADIM 1 & ADIM 2 Kriterleri Doğrulama
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('?? LOGIN ROUTING & ROL BAZLI ERIŞIM KONTROL TESTLERI BAŞLIYOR');
console.log('================================================================\n');

// 1. ADIM: Backend auth.routes.js Kod Denetimi (ADIM 2 Uyumluluğu)
console.log('--- 1. Backend Login Yanıtı & redirectUrl Payload Denetimi ---');

const backendAuthRoutesPath = path.join(__dirname, 'backend-api', 'routes', 'auth.routes.js');
const rootAuthRoutesPath = path.join(__dirname, 'routes', 'auth.routes.js');

assert(fs.existsSync(backendAuthRoutesPath), 'backend-api/routes/auth.routes.js mevcut olmalı');
assert(fs.existsSync(rootAuthRoutesPath), 'routes/auth.routes.js mevcut olmalı');

const backendCode = fs.readFileSync(backendAuthRoutesPath, 'utf8');
const rootCode = fs.readFileSync(rootAuthRoutesPath, 'utf8');

// Backend'in redirectUrl dönmesi ve role dönmesi kontrolü
[backendCode, rootCode].forEach((code, idx) => {
  const fileLabel = idx === 0 ? 'backend-api/routes/auth.routes.js' : 'routes/auth.routes.js';
  
  assert(code.includes('redirectUrl'), `${fileLabel} içinde redirectUrl alanı tanımlı olmalı`);
  assert(code.includes("redirectUrl = '/admin.html'"), `${fileLabel} içinde admin yönlendirme URL'si olmalı`);
  assert(code.includes("redirectUrl = '/bayi.html'"), `${fileLabel} içinde bayi yönlendirme URL'si olmalı`);
  assert(code.includes("redirectUrl = '/store.html'"), `${fileLabel} içinde müşteri vitrin yönlendirme URL'si olmalı`);
  assert(code.includes('role: user.role'), `${fileLabel} login yanıtında role: user.role dönmeli`);
  
  console.log(`? ${fileLabel}: redirectUrl ve role payload entegrasyonu doğrulandı.`);
});

// 2. ADIM: Frontend login.js Dosyası ve Yönlendirme Mantığı Denetimi
console.log('\n--- 2. Frontend login.js ve Routing Fonksiyon Denetimi ---');

const saasLoginJsPath = path.join(__dirname, 'saas-panel-ui', 'assets', 'js', 'login.js');
assert(fs.existsSync(saasLoginJsPath), 'saas-panel-ui/assets/js/login.js mevcut olmalı');

const loginJsContent = fs.readFileSync(saasLoginJsPath, 'utf8');

assert(loginJsContent.includes('determineRedirectUrl'), 'login.js içinde determineRedirectUrl fonksiyonu olmalı');
assert(loginJsContent.includes('handleLoginSubmit'), 'login.js içinde handleLoginSubmit fonksiyonu olmalı');
assert(loginJsContent.includes('/admin.html'), 'login.js içinde /admin.html yönlendirmesi olmalı');
assert(loginJsContent.includes('/bayi.html'), 'login.js içinde /bayi.html yönlendirmesi olmalı');
assert(loginJsContent.includes('/store.html'), 'login.js içinde /store.html yönlendirmesi olmalı');

// evaluate determineRedirectUrl in a clean VM context
const vm = require('vm');
const sandbox = {
  window: {
    location: {
      pathname: '/',
      protocol: 'http:'
    }
  },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    addEventListener: () => {}
  },
  localStorage: {
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {}
  },
  console: console
};
vm.createContext(sandbox);
vm.runInContext(loginJsContent, sandbox);

assert(typeof sandbox.window.determineRedirectUrl === 'function', 'determineRedirectUrl fonksiyonu window nesnesine bağlı olmalı');

const adminUrl = sandbox.window.determineRedirectUrl('SUPER_ADMIN');
const bayiUrl = sandbox.window.determineRedirectUrl('BAYI');
const tenantAdminUrl = sandbox.window.determineRedirectUrl('TENANT_ADMIN');
const musteriUrl = sandbox.window.determineRedirectUrl('MUSTERI');
const customerUrl = sandbox.window.determineRedirectUrl('CUSTOMER');

assert.strictEqual(adminUrl, '/admin.html', 'SUPER_ADMIN -> /admin.html olmalı');
assert.strictEqual(bayiUrl, '/bayi.html', 'BAYI -> /bayi.html olmalı');
assert.strictEqual(tenantAdminUrl, '/bayi.html', 'TENANT_ADMIN -> /bayi.html olmalı');
assert.strictEqual(musteriUrl, '/store.html', 'MUSTERI -> /store.html olmalı');
assert.strictEqual(customerUrl, '/store.html', 'CUSTOMER -> /store.html olmalı');

console.log('? determineRedirectUrl testleri:');
console.log('   - SUPER_ADMIN   ->', adminUrl);
console.log('   - BAYI          ->', bayiUrl);
console.log('   - TENANT_ADMIN  ->', tenantAdminUrl);
console.log('   - MUSTERI       ->', musteriUrl);
console.log('   - CUSTOMER      ->', customerUrl);

// 3. ADIM: saas-panel-ui/index.html Form Submit ve Rol Koruması Denetimi
console.log('\n--- 3. saas-panel-ui/index.html Form Submit & Routing Denetimi ---');

const indexHtmlPath = path.join(__dirname, 'saas-panel-ui', 'index.html');
const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

assert(indexHtmlContent.includes('assets/js/login.js'), 'saas-panel-ui/index.html login.js dosyasını import etmeli');
assert(indexHtmlContent.includes('/admin.html'), 'saas-panel-ui/index.html /admin.html hedefini içermeli');
assert(indexHtmlContent.includes('/bayi.html'), 'saas-panel-ui/index.html /bayi.html hedefini içermeli');
assert(indexHtmlContent.includes('/store.html'), 'saas-panel-ui/index.html /store.html hedefini içermeli');

console.log('? saas-panel-ui/index.html dinamik routing blokları doğrulandı.');

// 4. ADIM: requireAuth Rol Koruması Denetimi (BAYI Erişim Hatasının Çözümü)
console.log('\n--- 4. requireAuth Rol Koruma & Normalizasyon Denetimi ---');

const apiJsPath = path.join(__dirname, 'saas-panel-ui', 'assets', 'js', 'api.js');
const apiJsContent = fs.readFileSync(apiJsPath, 'utf8');

assert(apiJsContent.includes("(expected === 'BAYI' || expected === 'TENANT_ADMIN') && (userRole === 'BAYI' || userRole === 'TENANT_ADMIN')"),
  'api.js içinde BAYI <-> TENANT_ADMIN çift yönlü rol eşleşmesi bulunmalı');

console.log('? requireAuth guard içinde BAYI ve TENANT_ADMIN çift yönlü uyumluluğu doğrulandı.');

console.log('\n================================================================');
console.log('?? TÜM LOGIN ROUTING VE YETKI KONTROL TESTLERI BAŞARIYLA GEÇTİ!');
console.log('================================================================');
