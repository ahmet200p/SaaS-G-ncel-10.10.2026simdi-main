const fs = require('fs');
const assert = require('assert');

console.log('--- STARTING PROMPT.MD COMPLIANCE TEST ---');

// 1. BACKEND TEST
const tenantRoutes = fs.readFileSync('routes/tenant.js', 'utf8');
const apiJs = fs.readFileSync('assets/js/api.js', 'utf8');

assert(tenantRoutes.includes('items: {') /* } */, 'tenant.js items ilişkisi include edilmeli');
assert(tenantRoutes.includes('tenantProduct: {') /* } */, 'tenant.js tenantProduct ilişkisi include edilmeli');
assert(tenantRoutes.includes('product: item.tenantProduct?.product'), 'tenant.js item içine doğrudan product bağlanmalı');

assert(apiJs.includes('/tenant/orders') && apiJs.includes('product: prod'), 'api.js mock/fallback katmanında da product bağlanmalı');
console.log('✓ 1. ADIM (Backend Relations & Product Mapping) BAŞARILI');

// 2. FRONTEND TABLO RENDER TEST
const bayiHtml = fs.readFileSync('bayi.html', 'utf8');

assert(bayiHtml.includes('itemsCount > 0'), 'bayi.html içinde itemsCount kontrolü olmalı');
assert(bayiHtml.includes('Kalem (Toplam') /* ) */, 'bayi.html "X Kalem (Toplam Y Adet)" formatını içermeli');
assert(bayiHtml.includes('totalQty'), 'bayi.html toplam adet miktarını hesaplamalı');
console.log('✓ 2. ADIM (Frontend Tablo Render Kalem & Adet Sayısı) BAŞARILI');

// 3. DETAY MODALI TEST
assert(bayiHtml.includes('id="modal-order-detail"'), 'bayi.html içinde modal-order-detail idli modal olmalı');
assert(bayiHtml.includes('Görsel / OE No'), 'Modal tablosunda Görsel / OE No sütunu olmalı');
assert(bayiHtml.includes('Parça Adı'), 'Modal tablosunda Parça Adı sütunu olmalı');
assert(bayiHtml.includes('Adet'), 'Modal tablosunda Adet sütunu olmalı');
assert(bayiHtml.includes('Birim Fiyat'), 'Modal tablosunda Birim Fiyat sütunu olmalı');
assert(bayiHtml.includes('Ara Toplam'), 'Modal tablosunda Ara Toplam sütunu olmalı');

assert(bayiHtml.includes('Ara Toplam (KDV Hariç)'), 'Modal finansal kırılımında Ara Toplam olmalı');
assert(bayiHtml.includes('İskonto'), 'Modal finansal kırılımında İskonto olmalı');
assert(bayiHtml.includes('KDV (%20)'), 'Modal finansal kırılımında KDV olmalı');
assert(bayiHtml.includes('Genel Toplam'), 'Modal finansal kırılımında Genel Toplam olmalı');

assert(bayiHtml.includes('btn-close-order-modal'), 'Modal kapatma butonu olmalı');
assert(bayiHtml.includes('window.showOrderDetail'), 'window.showOrderDetail fonksiyonu tanımlı olmalı');
assert(bayiHtml.includes('modalOrderDetail'), 'modalOrderDetail backdrop ve tuş dinleyicilerine eklenmeli');
console.log('✓ 3. ADIM (Detay Modalı Tasarımı ve Veri Bağlama) BAŞARILI');

console.log('--- ALL PROMPT.MD CHECKS PASSED (100%) ---');
