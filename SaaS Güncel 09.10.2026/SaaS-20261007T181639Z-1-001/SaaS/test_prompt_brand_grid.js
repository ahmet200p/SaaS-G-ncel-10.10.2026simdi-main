// ============================================================================
// PROMPT.MD ARAÇ MARKALARI (BRAND GRID) 4 ADIM DOĞRULAMA TESTİ
// test_prompt_brand_grid.js
// ============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log('🚗 PROMPT.MD ARAÇ MARKALARI (BRAND GRID) 4 ADIM TESTİ');
console.log('====================================================\n');

const storeHtmlPath = path.join(__dirname, 'store.html');
const storeCssPath = path.join(__dirname, 'store.css');
const logosDir = path.join(__dirname, 'assets', 'logos');

assert(fs.existsSync(storeHtmlPath), 'store.html dosyası mevcut olmalıdır');
assert(fs.existsSync(storeCssPath), 'store.css dosyası mevcut olmalıdır');

const htmlContent = fs.readFileSync(storeHtmlPath, 'utf8');
const cssContent = fs.readFileSync(storeCssPath, 'utf8');

// ----------------------------------------------------------------------------
// 1. ADIM: GERÇEK LOGOLARIN ENTEGRASYONU
// ----------------------------------------------------------------------------
console.log('--- 1. ADIM: Gerçek Logoların Entegrasyonu Testi ---');
assert(htmlContent.includes('<img') && htmlContent.includes('class="brand-logo-img"'), 'Marka kutularında gerçek görseller için <img> etiketi kullanılmalıdır');
assert(htmlContent.includes('cdn.worldvectorlogo.com'), 'Public CDN olan cdn.worldvectorlogo.com bağlantıları entegre edilmiş olmalıdır');
assert(fs.existsSync(logosDir), 'assets/logos yerel fallback dizini mevcut olmalıdır');

console.log('  ✅ [PASS] 1. Adım: Sahte jenerik çizgi/ikonlar temizlendi, orijinal logolar ve fallback CDN/SVG entegre edildi.');

// ----------------------------------------------------------------------------
// 2. ADIM: MARKA ÇEŞİTLİLİĞİNİ ARTIRMA (20 MARKA)
// ----------------------------------------------------------------------------
console.log('--- 2. ADIM: 20 Popüler Marka ve Tüm Markalar Testi ---');
const requiredBrands = [
  'Volkswagen', 'Renault', 'Fiat', 'Ford', 'BMW',
  'Mercedes-Benz', 'Toyota', 'Hyundai', 'Audi', 'Opel',
  'Peugeot', 'Honda', 'Nissan', 'Kia', 'Skoda',
  'Seat', 'Citroen', 'Dacia', 'Volvo', 'Chery'
];

requiredBrands.forEach(brand => {
  assert(
    htmlContent.includes(`data-brand="${brand}"`),
    `Marka listesinde ${brand} bulunmalıdır (data-brand="${brand}")`
  );
  assert(
    htmlContent.includes(`>${brand}</span>`),
    `Marka etiketinde ${brand} görünür metin olmalıdır`
  );
});

assert(htmlContent.includes('data-brand="ALL"'), 'Tüm Markalar sıfırlama butonu bulunmalıdır');
console.log(`  ✅ [PASS] 2. Adım: 20 popüler otomotiv markası ve 'Tüm Markalar' eksiksiz mevcut.`);

// ----------------------------------------------------------------------------
// 3. ADIM: RESPONSIVE IZGARA (GRID) TASARIMI
// ----------------------------------------------------------------------------
console.log('--- 3. ADIM: Responsive CSS Grid ve UX Efektleri Testi ---');
assert(cssContent.includes('.brands-grid-wrap'), 'CSS içinde .brands-grid-wrap stili bulunmalıdır');
assert(cssContent.includes('display: grid'), 'Tasarım CSS Grid olmalıdır');
assert(
  (cssContent.includes('repeat(8,') /* ) */ || cssContent.includes('repeat(7,') /* ) */),
  'Masaüstünde yan yana 7 veya 8 kutu yer almalıdır'
);
assert(
  (cssContent.includes('repeat(4,') /* ) */ || cssContent.includes('repeat(3,') /* ) */),
  'Mobilde yan yana 3 veya 4 kutu yer almalıdır'
);
assert(cssContent.includes('translateY(-2px)'), ':hover durumunda hafif yukarı kalkma (translateY(-2px)) UX efekti olmalıdır');
assert(
  cssContent.includes('#f97316') || cssContent.includes('orange') || cssContent.includes('#ea580c'),
  'Kutularda turuncu UX vurgu rengi bulunmalıdır'
);

console.log('  ✅ [PASS] 3. Adım: Masaüstünde 7-8, mobilde 3-4 kutu ve turuncu hover/yukarı kalkma UX efektleri tamamlandı.');

// ----------------------------------------------------------------------------
// 4. ADIM: JAVASCRIPT FİLTRELEME BAĞLANTISI
// ----------------------------------------------------------------------------
console.log('--- 4. ADIM: JavaScript allProductsData Filtreleme Bağlantısı Testi ---');
assert(htmlContent.includes('allProductsData'), 'store.html içinde allProductsData değişkeni tanımlı olmalıdır');
assert(htmlContent.includes('vehicleBrand'), 'vehicleBrand eşleşmesine göre filtreleme mantığı mevcut olmalıdır');
assert(htmlContent.includes('addEventListener'), 'Marka kutularına click olay dinleyicisi eklenmiş olmalıdır');
assert(htmlContent.includes('handleBrandClick'), 'handleBrandClick fonksiyonu mevcut olmalıdır');
assert(htmlContent.includes('clearFilters'), 'Tüm markalar / filtre sıfırlama fonksiyonu olmalıdır');

console.log('  ✅ [PASS] 4. Adım: JavaScript allProductsData filtreleme, click dinleyicisi ve Tüm Markalar sıfırlama eksiksiz.');

// ----------------------------------------------------------------------------
// 5. ADIM: BAYİ PANELİ (bayi.html) ARAÇ MARKASI DROPDOWN GÜNCELLEMESİ
// ----------------------------------------------------------------------------
console.log('--- 5. ADIM: bayi.html Araç Markası Dropdown Listesi Testi ---');
const bayiHtmlPath = path.join(__dirname, 'bayi.html');
assert(fs.existsSync(bayiHtmlPath), 'bayi.html dosyası mevcut olmalıdır');
const bayiHtmlContent = fs.readFileSync(bayiHtmlPath, 'utf8');

assert(bayiHtmlContent.includes('id="prod-brand"') && bayiHtmlContent.includes('name="vehicleBrand"'), 'bayi.html içinde Araç Markası (<select name="vehicleBrand"> / id="prod-brand") bulunmalıdır');
assert(bayiHtmlContent.includes('modal-add-product'), 'bayi.html ürün ekleme modalı/formu modal-add-product referansı içermelidir');
assert(bayiHtmlContent.includes('Seçiniz') && bayiHtmlContent.includes('disabled'), 'Dropdown içinde varsayılan/disabled Seçiniz seçeneği olmalıdır');
assert(bayiHtmlContent.includes('Universal (Tüm Markalara Uyumlu / Ortak Parça)'), 'Dropdown içinde Universal seçeneği olmalıdır');

requiredBrands.forEach(b => {
  assert(
    bayiHtmlContent.includes(`<option value="${b}">${b}</option>`),
    `bayi.html dropdown listesinde <option value="${b}">${b}</option> bulunmalıdır`
  );
});

console.log('  ✅ [PASS] 5. Adım: bayi.html Araç Markası dropdown seçenekleri (Seçiniz, Universal ve 20 marka) eksiksiz güncellendi.');

console.log('\n====================================================');
console.log('🎉 PROMPT.MD ARAÇ MARKALARI TÜM GEREKSİNİMLERİ 100% BAŞARILI!');
console.log('====================================================\n');
