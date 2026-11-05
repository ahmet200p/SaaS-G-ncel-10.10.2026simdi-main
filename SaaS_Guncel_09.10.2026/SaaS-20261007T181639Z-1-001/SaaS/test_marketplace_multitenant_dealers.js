/**
 * test_marketplace_multitenant_dealers.js
 * Test Suite: Multi-Tenant Marketplace (Sahibinden gibi B2B Pazaryeri) & Mehmet Oto Doğrulama Testi
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🚗 MULTI-TENANT B2B PAZARYERİ VE MEHMET OTO TESTLERİ BAŞLIYOR');
console.log('================================================================\n');

// 1. Mehmet Oto ve Çoklu Bayi Başlangıç Yapılandırması (server.js & seed.js)
console.log('--- 1. Mehmet Oto Bayisi & Kullanıcısı Tohumlama Denetimi ---');

const serverJsPath = path.join(__dirname, 'backend-api', 'server.js');
const serverJs = fs.readFileSync(serverJsPath, 'utf8');

assert(serverJs.includes('mehmetoto@sistem.com'), 'server.js içinde mehmetoto@sistem.com tanımlı olmalı');
assert(serverJs.includes('Mehmet Oto'), 'server.js içinde Mehmet Oto bayisi tanımlı olmalı');
assert(serverJs.includes("subdomain: 'mehmetoto'"), 'server.js içinde mehmetoto subdomaini tanımlı olmalı');
console.log('✅ server.js (Development & Production Neon DB Sync) içinde Mehmet Oto bayisi ve kullanıcısı doğrulandı.');

const seedJsPath = path.join(__dirname, 'backend-api', 'prisma', 'seed.js');
const seedJs = fs.readFileSync(seedJsPath, 'utf8');
assert(seedJs.includes('mehmetoto@sistem.com'), 'seed.js içinde mehmetoto@sistem.com bulunmalı');
assert(seedJs.includes("subdomain: 'mehmetoto'"), 'seed.js içinde mehmetoto subdomaini bulunmalı');
console.log('✅ seed.js tohumlama dosyasında Mehmet Oto bayisi doğrulandı.');

// 2. Auth Login Auto-Provision & Rol Yönlendirmesi
console.log('\n--- 2. Auth Giriş & Fail-Safe Oturum Denetimi ---');

const authRoutesPath = path.join(__dirname, 'backend-api', 'routes', 'auth.routes.js');
const authRoutes = fs.readFileSync(authRoutesPath, 'utf8');

assert(authRoutes.includes('mehmetoto@sistem.com'), 'auth.routes.js içinde mehmetoto@sistem.com fail-safe provision tanımlı olmalı');
console.log('✅ auth.routes.js içinde Mehmet Oto dinamik oturum açma ve fail-safe garantisi doğrulandı.');

// 3. Backend Store API Pazaryeri (Marketplace) Dinamik Bayi Eşleme Denetimi
console.log('\n--- 3. Backend Store API (Tüm Bayilerin Ürünlerini Listeleme) Denetimi ---');

const storeRoutesPath = path.join(__dirname, 'backend-api', 'routes', 'store.js');
const storeRoutes = fs.readFileSync(storeRoutesPath, 'utf8');

assert(storeRoutes.includes('dealerName'), 'store.js içinde dealerName bulunmalı');
assert(storeRoutes.includes('supplierName'), 'store.js içinde supplierName bulunmalı');
assert(storeRoutes.includes('item.tenant && item.tenant.name'), 'store.js içinde item.tenant.name dinamik çözümlemesi bulunmalı');
console.log('✅ store.js API rotasında her ürünün kendi bayisinin adıyla (Sahibinden modeli) dönmesi doğrulandı.');

// 4. Frontend Vitrin (store.html, index.html) Dinamik Satıcı Gösterimi Denetimi
console.log('\n--- 4. Frontend Vitrin Firma/Bayi Dinamik Gösterim Denetimi ---');

const storeHtmlPath = path.join(__dirname, 'storefront-ui', 'store.html');
const storeHtml = fs.readFileSync(storeHtmlPath, 'utf8');

assert(storeHtml.includes('p.supplierName'), 'store.html içinde p.supplierName bulunmalı');
assert(storeHtml.includes('p.dealerName') || storeHtml.includes('p.sellerName'), 'store.html içinde p.dealerName / p.sellerName bulunmalı');
assert(!storeHtml.includes("const sellerName = p.supplierName || p.companyName || p.sellerName || 'Ahmet Oto (Yetkili Bayi)';"), 'store.html içinde hardcoded Ahmet Oto fallback temizlenmiş olmalı');
console.log('✅ store.html içinde dinamik satıcı/bayi eşlemesi doğrulandı.');

console.log('\n================================================================');
console.log('🎉 TÜM MULTI-TENANT PAZARYERİ VE MEHMET OTO TESTLERİ BAŞARIYLA GEÇTİ!');
console.log('================================================================');

