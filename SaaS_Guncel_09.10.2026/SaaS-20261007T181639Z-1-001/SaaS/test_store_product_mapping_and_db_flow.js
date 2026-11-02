/**
 * Test: Boş Ürün Listesi ve Veri Eşleştirme Doğrulama Testi
 * prompt.md ADIM 1, ADIM 2 ve ADIM 3 Kriterlerinin Doğrulanması
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🛒 VITRIN ÜRÜN LISTELEME & MAPPING KONTROL TESTLERI BAŞLIYOR');
console.log('================================================================\n');

// 1. ADIM: FRONTEND VERİ EŞLEŞTİRMESİ (MAPPING KONTROLÜ)
console.log('--- 1. Frontend store.html fetchProducts & console.log Denetimi ---');

const storeHtmlPath = path.join(__dirname, 'storefront-ui', 'store.html');
assert(fs.existsSync(storeHtmlPath), 'storefront-ui/store.html mevcut olmalı');

const storeHtml = fs.readFileSync(storeHtmlPath, 'utf8');

// fetchProducts fonksiyonu
assert(storeHtml.includes('fetchProducts'), 'store.html içinde fetchProducts fonksiyonu tanımlı olmalı');

// console.log("Gelen Veri:", data)
assert(storeHtml.includes('console.log("Gelen Veri:", data);'), 'store.html içinde console.log("Gelen Veri:", data); bulunmalı');

// data.data mapping
assert(
  storeHtml.includes('Array.isArray(data.data)') || storeHtml.includes('data.data'),
  'store.html içinde data.data array kontrolü/döngüsü bulunmalı'
);

// Prisma model değişkenleri (product.name, product.price vb.)
assert(storeHtml.includes('product.name'), 'store.html şablonunda product.name bulunmalı');
assert(storeHtml.includes('product.price'), 'store.html şablonunda product.price desteği bulunmalı');
assert(storeHtml.includes('product.oeNumber'), 'store.html şablonunda product.oeNumber bulunmalı');
assert(storeHtml.includes('product.stock'), 'store.html şablonunda product.stock bulunmalı');

console.log('✅ ADIM 1: fetchProducts, console.log("Gelen Veri:", data) ve Prisma sütun eşleştirmeleri doğrulandı.');

// 2. ADIM: BACKEND PRISMA FİLTRELERİNİ ESNETME
console.log('\n--- 2. Backend routes/store.js Filtre Esnetme Denetimi ---');

const backendStorePath = path.join(__dirname, 'backend-api', 'routes', 'store.js');
const rootStorePath = path.join(__dirname, 'routes', 'store.js');

[backendStorePath, rootStorePath].forEach((filePath, idx) => {
  const label = idx === 0 ? 'backend-api/routes/store.js' : 'routes/store.js';
  assert(fs.existsSync(filePath), `${label} dosyası mevcut olmalı`);
  const content = fs.readFileSync(filePath, 'utf8');

  // isActive filtresinin yoruma alınmış/esnetilmiş olması
  assert(
    content.includes('// andConditions.push({ tenant: { isActive: true } });') ||
    content.includes('// ADIM 2: where: { isActive: true }'),
    `${label} içinde isActive: true filtresi esnetilmiş olmalı`
  );

  // findMany sorgusunun sadeleştirilmesi
  assert(content.includes('prisma.tenantProduct.findMany'), `${label} içinde findMany sorgusu bulunmalı`);
  console.log(`✅ ADIM 2: ${label} Prisma filtre esnetmesi ve koşulsuz ürün listelemesi doğrulandı.`);
});

// 3. ADIM: BAYİ PANELİ VERİTABANI KONTROLÜ (DB URL)
console.log('\n--- 3. Bayi Paneli ve Vitrin Canlı Render API Eşitleme Denetimi ---');

const bayiHtmlPath = path.join(__dirname, 'saas-panel-ui', 'bayi.html');
assert(fs.existsSync(bayiHtmlPath), 'saas-panel-ui/bayi.html mevcut olmalı');
const bayiHtml = fs.readFileSync(bayiHtmlPath, 'utf8');

const liveApiUrl = 'https://saas-g-ncel-10-10-2026simdi-main.onrender.com/api';

// Bayi panelinin getPanelApiBase fonksiyonu
assert(bayiHtml.includes(liveApiUrl), 'bayi.html içinde Render canlı API adresi bulunmalı');
assert(bayiHtml.includes('getPanelApiBase'), 'bayi.html içinde getPanelApiBase fonksiyonu bulunmalı');

// Tüm api.js dosyalarının canlı adresi doğrulaması
const apiJsFiles = [
  path.join(__dirname, 'saas-panel-ui', 'assets', 'js', 'api.js'),
  path.join(__dirname, 'storefront-ui', 'assets', 'js', 'api.js'),
  path.join(__dirname, 'assets', 'js', 'api.js')
];

apiJsFiles.forEach(apiPath => {
  assert(fs.existsSync(apiPath), `${apiPath} mevcut olmalı`);
  const apiCode = fs.readFileSync(apiPath, 'utf8');
  assert(apiCode.includes(liveApiUrl), `${apiPath} içinde canlı Render URL'si tanımlı olmalı`);
  console.log(`✅ ADIM 3: ${path.basename(path.dirname(apiPath))}/${path.basename(apiPath)} canlı Render API URL'sine eşitlendi.`);
});

console.log('\n================================================================');
console.log('🎉 TÜM BOŞ ÜRÜN LİSTESİ VE MAPPING DOĞRULAMA TESTLERİ BAŞARIYLA GEÇTİ!');
console.log('================================================================');

