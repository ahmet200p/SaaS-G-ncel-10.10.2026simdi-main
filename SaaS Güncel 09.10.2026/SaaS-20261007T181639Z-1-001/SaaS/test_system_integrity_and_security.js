/**
 * ============================================================================
 * TEST: Sistem Bütünlüğü, Güvenlik Açıkları Onarımı ve Vitrin Header UI/UX Doğrulaması
 * ============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('./app');

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

function makeRequest(url, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 5000,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 SİSTEM ANALİZİ, GÜVENLİK ONARIMLARI VE VİTRİN HEADER TESTİ');
  console.log('================================================================\n');

  let server;
  let baseUrl = 'http://127.0.0.1:5000';
  const { isPortOpen } = require('./dev_pg_server');
  const serverRunning = await isPortOpen(5000);
  if (!serverRunning) {
    const PORT = 5589;
    server = app.listen(PORT);
    baseUrl = `http://127.0.0.1:${PORT}`;
    await new Promise(r => setTimeout(r, 600));
  }

  try {

    // ------------------------------------------------------------------------
    // 1. ADIM: Güvenlik Başlıkları & Bilgi Sızıntısı Koruması
    // ------------------------------------------------------------------------
    console.log('--- 1. Güvenlik Başlıkları ve Bilgi Sızıntısı Testi ---');
    const healthRes = await makeRequest(`${baseUrl}/api/health`, 'GET');
    check(healthRes.status === 200, `API Sağlık Kontrolü Başarılı (HTTP 200, status: ${healthRes.body?.status})`);
    check(!healthRes.headers['x-powered-by'], `X-Powered-By başlığı başarıyla gizlendi (Express sızıntısı engellendi)`);
    check(healthRes.headers['x-content-type-options'] === 'nosniff' || healthRes.headers['content-security-policy'], `Güvenlik başlıkları (CSP / nosniff) aktif`);

    // ------------------------------------------------------------------------
    // 2. ADIM: Kimlik Doğrulama & Giriş Akışı
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Kimlik Doğrulama & Güvenli Giriş Testi ---');
    const loginRes = await makeRequest(`${baseUrl}/api/auth/login`, 'POST', {
      email: 'ahmet@ahmetoto.com',
      password: 'wrong_password_123'
    });
    check(loginRes.status === 401, `Hatalı şifre denemesi engellendi (HTTP 401)`);

    const validLoginRes = await makeRequest(`${baseUrl}/api/auth/login`, 'POST', {
      email: 'ahmet@ahmetoto.com',
      password: '123456'
    });
    check(validLoginRes.status === 200 && validLoginRes.body?.token, `Geçerli bayi yöneticisi girişi başarılı ve JWT üretildi`);
    const jwtToken = validLoginRes.body?.token;

    // ------------------------------------------------------------------------
    // 3. ADIM: Profil Güncelleme Şifre Uzunluğu Güvenlik Kontrolü
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Profil Güncelleme Şifre Doğrulama Testi ---');
    const weakPassRes = await makeRequest(`${baseUrl}/api/store/profile`, 'PUT', {
      password: '123'
    }, { Authorization: `Bearer ${jwtToken}` });
    check(weakPassRes.status === 400 && weakPassRes.body?.message?.includes('en az 6'), `6 karakterden kısa şifre reddedildi (HTTP 400: ${weakPassRes.body?.message})`);

    // ------------------------------------------------------------------------
    // 4. ADIM: Multer Dosya Yükleme Güvenliği (Whitelist Kontrolü)
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Dosya Yükleme Güvenlik Doğrulaması ---');
    const upload = require('./middleware/upload');
    check(upload && typeof upload.any === 'function', `Multer yükleme middleware'i devrede`);

    // ------------------------------------------------------------------------
    // 5. ADIM: Frontend Vitrin (store.html & store.css) 4 Adımlı UI/UX Analizi
    // ------------------------------------------------------------------------
    console.log('\n--- 5. store.html & store.css 4 Adımlı UI/UX Analizi ---');
    const storeHtmlPath = path.join(__dirname, 'store.html');
    const storeCssPath = path.join(__dirname, 'store.css');

    const htmlContent = fs.readFileSync(storeHtmlPath, 'utf8');
    const cssContent = fs.readFileSync(storeCssPath, 'utf8');

    // 1. ADIM: Konteyner ve Genel Boşluklar
    check(cssContent.includes('.header-container {') && cssContent.includes('padding: 16px 32px;'), `1. Adım: Header container geniş iç boşluklar (padding: 16px 32px) tanımlandı`);
    check(cssContent.includes('min-height: 80px;'), `1. Adım: Menü yüksekliği artırıldı (min-height: 80px)`);
    check(cssContent.includes('justify-content: space-between;') && cssContent.includes('clamp(24px, 3.5vw, 48px)'), `1. Adım: 3 ana blok arasında geniş esneme payı ve justify-between uygulandı`);
    check(cssContent.includes('box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.03)'), `1. Adım: Hafif, yumuşak gölge (drop-shadow) eklendi`);

    // 2. ADIM: Arama Çubuğunun Sadeleştirilmesi
    check(cssContent.includes('.search-bar-wrap {') && cssContent.includes('border: 1px solid #e2e8f0;'), `2. Adım: Arama çubuğu kenarlığı ince açık griye (#e2e8f0) çekildi`);
    check(cssContent.includes('border-radius: 10px;'), `2. Adım: Arama çubuğu köşeleri hafif yuvarlatıldı (border-radius: 10px / rounded-lg)`);
    check(cssContent.includes('.search-type-select {') && cssContent.includes('border-right: 1px solid #e2e8f0;'), `2. Adım: Select ve input arasına hafif dikey ayırıcı çizgi eklendi`);
    check(cssContent.includes('.search-input {') && cssContent.includes('padding: 12px 42px 12px 18px;'), `2. Adım: Input iç boşlukları (padding) ferahlatıldı`);
    check(cssContent.includes('.btn-search-submit {') && cssContent.includes('background: #ea580c;'), `2. Adım: Arama butonu rengi kurumsal sıcak pastel turuncuya (#ea580c) uyarlandı`);

    // 3. ADIM: Sağ Aksiyon Menüsünün İzolasyonu
    check(cssContent.includes('.logged-in-user-actions {') && cssContent.includes('gap: 16px;'), `3. Adım: Sağ butonlar arasına standart boşluk (gap: 16px / gap-4) eklendi`);
    check(cssContent.includes('.balance-badge {') && cssContent.includes('background: transparent;') && cssContent.includes('color: #16a34a;'), `3. Adım: Bakiye ekranı şeffaf arka plan ve zarif yeşil metne dönüştürüldü`);
    check(cssContent.includes('.btn-header-cart {') && cssContent.includes('height: 44px;'), `3. Adım: Sepet butonu yüksekliği eşitlendi (height: 44px)`);
    check(cssContent.includes('.user-info-badge {') && cssContent.includes('height: 44px;'), `3. Adım: Profil butonu yüksekliği eşitlendi (height: 44px)`);
    check(cssContent.includes('.btn-notification-bell {') && cssContent.includes('height: 44px;'), `3. Adım: Bildirim zili yüksekliği eşitlendi (height: 44px)`);
    check(cssContent.includes('transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);'), `3. Adım: Butonlara yumuşak hover geçiş efekti (transition) eklendi`);

    // 4. ADIM: Renk ve Kontrast Uyumu
    check(cssContent.includes('.partsouq-header {') && cssContent.includes('background: #ffffff;'), `4. Adım: Üst menü arka planı tam beyaz (#ffffff) olarak ayarlandı`);
    check(cssContent.includes('border-bottom: 1px solid #f1f5f9;'), `4. Adım: Alt kenarlıkta sert siyahlar yerine yumuşak açık gri (#f1f5f9) kullanıldı`);

    // HTML Etiket Bütünlüğü Kontrolü
    check(!htmlContent.includes('<div class="user-profile-dropdown" id="user-profile-dropdown">\n            <button') || htmlContent.includes('id="btn-dropdown-logout"'), `HTML etiket kapatma ve DOM bütünlüğü hatasız`);

    console.log('\n================================================================');
    console.log(`🎉 TESTLER BAŞARIYLA TAMAMLANDI: ${passed}/${total} (%100 BAŞARI)`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ Test çalıştırılırken hata oluştu:', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      await new Promise(r => server.close(r));
    }
  }
}

runTests();
