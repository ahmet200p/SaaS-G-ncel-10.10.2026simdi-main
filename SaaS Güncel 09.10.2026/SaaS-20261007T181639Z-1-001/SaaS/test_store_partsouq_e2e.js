// ============================================================================
// PARTSOUQ B2B VITRIN E2E TEST VE DOĞRULAMA BETİĞİ
// test_store_partsouq_e2e.js
// ============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');
const app = fs.existsSync(path.join(__dirname, 'backend-api', 'app.js')) ? require('./backend-api/app') : require('./app');
const prisma = fs.existsSync(path.join(__dirname, 'backend-api', 'lib', 'prisma.js')) ? require('./backend-api/lib/prisma') : require('./lib/prisma');
const jwt = require('jsonwebtoken');
const config = fs.existsSync(path.join(__dirname, 'backend-api', 'config.js')) ? require('./backend-api/config') : require('./config');

let server;
let port;

function runHttp(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: json, rawBody: body });
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
  console.log('====================================================');
  console.log('🚗 PARTSOUQ B2B MÜŞTERİ VİTRİNİ (store.html) DOĞRULAMA TESTLERİ');
  console.log('====================================================\n');

  // 1. STATİK DOSYA VE DOM KONTROLLERİ
  console.log('--- 1. store.html ve store.css Statik Dosya Kontrolleri ---');
  const storeHtmlPath = path.join(__dirname, 'store.html');
  const storeCssPath = path.join(__dirname, 'store.css');

  assert(fs.existsSync(storeHtmlPath), 'store.html dosyası mevcut olmalıdır');
  assert(fs.existsSync(storeCssPath), 'store.css dosyası mevcut olmalıdır');

  const htmlContent = fs.readFileSync(storeHtmlPath, 'utf8');
  const cssContent = fs.readFileSync(storeCssPath, 'utf8');

  // 1. ADIM: Dinamik Header Kontrolleri
  assert(htmlContent.includes('dealer-name-text'), 'Header içinde bayi adı elementi (dealer-name-text) bulunmalıdır');
  assert(htmlContent.includes('search-type-select'), 'Header içinde Partsouq arama tipi dropdown bulunmalıdır');
  assert(htmlContent.includes('Parça Kodu (OE)'), 'Arama tipi dropdown Parça Kodu (OE) içermelidir');
  assert(htmlContent.includes('Şasi No (VIN)'), 'Arama tipi dropdown Şasi No (VIN) içermelidir');
  assert(htmlContent.includes('btn-store-search'), 'Büyük "Ara" butonu bulunmalıdır');
  assert(htmlContent.includes('user-display-name'), 'Kullanıcı adı elementi (Kemal Usta vb.) bulunmalıdır');
  assert(!htmlContent.includes('id="balance-badge-widget"'), 'Header içindeki bakiye kutusu kaldırılmış olmalıdır');
  assert(htmlContent.includes('btn-dropdown-current-account'), 'Cari hesap durum butonu profil dropdown içinde olmalıdır');
  assert(htmlContent.includes('modal-current-account'), 'Cari ekstre / hesap durumu modalı mevcut olmalıdır');
  assert(htmlContent.includes('cart-counter-badge'), 'Sepetim sayacı rozeti bulunmalıdır');

  console.log('  ✅ [PASS] 1. Adım: Dinamik Multi-tenant Header ve Arama Yapısı Eksiksiz.');

  // 2. ADIM: Brand Grid (Marka Izgarası) Kontrolleri
  assert(htmlContent.includes('brands-grid-wrap'), 'Marka kutuları ızgarası (brands-grid-wrap) bulunmalıdır');
  assert(htmlContent.includes('data-brand="Volkswagen"'), 'Volkswagen marka kutusu bulunmalıdır');
  assert(htmlContent.includes('data-brand="Renault"'), 'Renault marka kutusu bulunmalıdır');
  assert(htmlContent.includes('data-brand="Fiat"'), 'Fiat marka kutusu bulunmalıdır');
  assert(htmlContent.includes('data-brand="Ford"'), 'Ford marka kutusu bulunmalıdır');
  assert(htmlContent.includes('data-brand="BMW"'), 'BMW marka kutusu bulunmalıdır');
  assert(htmlContent.includes('handleBrandClick'), 'Marka kutusu tıklama fonksiyonu bulunmalıdır');

  console.log('  ✅ [PASS] 2. Adım: Partsouq Marka Izgarası (Brand Grid) Eksiksiz.');

  // 3. ADIM: Ürün Tablosu Kontrolleri
  assert(htmlContent.includes('partsouq-table'), 'Partsouq ürün tablosu bulunmalıdır');
  assert(htmlContent.includes('copyOeToClipboard'), 'OE Kodu tek tıkla kopyalama fonksiyonu bulunmalıdır');
  assert(htmlContent.includes('openImageModal'), 'Parça görseli lightbox modal fonksiyonu bulunmalıdır');
  assert(htmlContent.includes('btn-add-to-cart'), 'Geniş ergonomik "+ Sepete Ekle" butonu bulunmalıdır');

  console.log('  ✅ [PASS] 3. Adım: Partsouq Standartlarında Ürün Veri Tablosu Eksiksiz.');

  // 4. ADIM: Sepet Çekmecesi ve SweetAlert2 Kontrolleri
  assert(htmlContent.includes('cart-offcanvas-drawer'), 'Sağdan açılan sepet çekmecesi bulunmalıdır');
  assert(htmlContent.includes('btn-qty-step'), 'Adet artırma/azaltma (+ -) butonları bulunmalıdır');
  assert(htmlContent.includes('btn-submit-order'), 'Siparişi Onayla butonu bulunmalıdır');
  assert(htmlContent.includes('sweetalert2'), 'SweetAlert2 kütüphanesi entegre edilmiş olmalıdır');
  assert(htmlContent.includes('Siparişiniz bayiye başarıyla iletildi'), 'SweetAlert2 başarı mesajı bulunmalıdır');

  console.log('  ✅ [PASS] 4. Adım: Sepet Çekmecesi ve SweetAlert2 Sipariş Entegrasyonu Eksiksiz.');

  // CSS Dokunmatik Hedef ve Kontrast Kontrolleri
  assert(cssContent.includes('min-height: 48px') || cssContent.includes('min-height: 46px') || cssContent.includes('min-height: 52px'), 'Butonlar min 44-48px touch target standardında olmalıdır');
  assert(cssContent.includes('--color-success: #16a34a'), 'Yeşil renk standardı tanımlı olmalıdır');

  console.log('  ✅ [PASS] CSS Dokunmatik Ergonomi ve Partsouq Tasarım Sistemi Tamamlandı.');

  // 2. CANLI BACKEND API ENTEGRASYON TESTLERİ
  console.log('\n--- 2. Backend Sunucusu ve API Rotaları Testi ---');
  server = http.createServer(app);
  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      console.log(`[TEST_SERVER] Geçici API sunucusu port:${port} üzerinde dinliyor.`);
      resolve();
    });
  });

  try {
    // Bayi veya Admin ile test için JWT Token üret
    const testTenant = await prisma.tenant.findFirst({ where: { subdomain: 'ahmetoto' } });
    assert(testTenant, 'ahmetoto bayisi veritabanında mevcut olmalıdır');

    const adminUser = await prisma.user.findFirst({ where: { role: 'TENANT_ADMIN', tenantId: testTenant.id } });
    assert(adminUser, 'Bayi yöneticisi mevcut olmalıdır');

    const testToken = jwt.sign(
      {
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        tenantId: adminUser.tenantId
      },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Test A: GET /api/store/profile
    console.log('\n--- Test A: GET /api/store/profile ---');
    const profileRes = await runHttp({
      hostname: '127.0.0.1',
      port,
      path: '/api/store/profile',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testToken}`
      }
    });

    assert.strictEqual(profileRes.status, 200, 'GET /api/store/profile 200 dönmelidir');
    assert.strictEqual(profileRes.body.success, true, 'success: true olmalıdır');
    assert(profileRes.body.data.tenant, 'Bayi bilgisi (tenant) bulunmalıdır');
    console.log(`  ✅ [PASS] GET /api/store/profile başarılı: Bayi=${profileRes.body.data.tenant.name}, Bakiye=${profileRes.body.data.balance} ₺`);

    // Test B: GET /api/store/products
    console.log('\n--- Test B: GET /api/store/products ---');
    const productsRes = await runHttp({
      hostname: '127.0.0.1',
      port,
      path: '/api/store/products?limit=20',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testToken}`
      }
    });

    assert.strictEqual(productsRes.status, 200, 'GET /api/store/products 200 dönmelidir');
    assert.strictEqual(productsRes.body.success, true, 'success: true olmalıdır');
    assert(Array.isArray(productsRes.body.data), 'data dizi olmalıdır');
    console.log(`  ✅ [PASS] GET /api/store/products başarılı: ${productsRes.body.count} ürün listelendi.`);

    // Test C: GET /api/store/products?brand=Renault (Brand Grid Filtresi)
    console.log('\n--- Test C: GET /api/store/products?brand=Renault ---');
    const brandRes = await runHttp({
      hostname: '127.0.0.1',
      port,
      path: '/api/store/products?brand=Renault',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testToken}`
      }
    });

    assert.strictEqual(brandRes.status, 200, 'Marka filtreli GET /api/store/products 200 dönmelidir');
    assert.strictEqual(brandRes.body.success, true, 'success: true olmalıdır');
    console.log(`  ✅ [PASS] Marka filtreli ürün sorgusu başarılı (HTTP 200).`);

    console.log('\n====================================================');
    console.log('🎉 TÜM PARTSOUQ STOREFRONT TESTLERİ BAŞARIYLA GEÇTİ!');
    console.log('====================================================\n');

  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST HATASI:', err);
  if (server) server.close();
  process.exit(1);
});
