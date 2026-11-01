/**
 * test_zero_discount_display.js
 * Doğrulama Senaryosu:
 * İskonto oranı 0 iken hiçbir rozet veya üstü çizili fiyat gösterilmemeli, sabit liste fiyatı kalmalı.
 * İskonto %20 uygulandığında ise üstü çizili liste fiyatı, indirimli fiyat ve %20 İskonto rozeti görünmeli.
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const prisma = fs.existsSync(path.join(__dirname, 'backend-api', 'lib', 'prisma.js'))
  ? require('./backend-api/lib/prisma')
  : require('./lib/prisma');
const app = fs.existsSync(path.join(__dirname, 'backend-api', 'app.js'))
  ? require('./backend-api/app')
  : require('./app');

const JWT_SECRET = process.env.JWT_SECRET || 'b2b-super-secret-key-2026';

let server;
let serverPort;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
}

function apiRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: serverPort,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (postData) {
      const dataStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(dataStr);
    }

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTest() {
  console.log('====================================================');
  console.log('🧪 Sıfır İskonto (%0) ve %20 İskonto Görsel & Matematik Doğrulaması');
  console.log('====================================================\n');

  await startServer();

  // 1. STATİK KOD KONTROLÜ
  console.log('1. store.html Dinamik Koşul Kontrolü...');
  const storeHtml = fs.readFileSync(path.join(__dirname, 'store.html'), 'utf8');

  // hasActiveDiscount tanımı
  assert(storeHtml.includes('const hasActiveDiscount = customerDiscountRate > 0 && discountAmount > 0.001 && discountedPrice < listPrice;'),
    'hasActiveDiscount kuralı tanımlı olmalı');
  assert(storeHtml.includes('${hasActiveDiscount ? `' /* } */),
    'İskonto rozeti ve üstü çizili fiyat SADECE hasActiveDiscount true iken basılmalı');
  console.log('  ✅ [PASS] store.html içindeki hasActiveDiscount mantığı doğrulandı.\n');

  // 2. SIMÜLASYON TESTLERİ: MÜŞTERİ %0 VE %20 İSKONTO
  console.log('2. Fiyat ve Rozet Simülasyonu:');

  function simulateProductRow(listPrice, customerDiscountRate, loggedIn = true) {
    let activeDiscountRate = 0;
    if (loggedIn) {
      activeDiscountRate = customerDiscountRate > 0 ? customerDiscountRate : 0;
    }
    const discountAmount = activeDiscountRate > 0
      ? parseFloat((listPrice * (activeDiscountRate / 100)).toFixed(2))
      : 0;
    const discountedPrice = (activeDiscountRate > 0 && discountAmount > 0.001)
      ? parseFloat((listPrice - discountAmount).toFixed(2))
      : listPrice;

    const hasActiveDiscount = activeDiscountRate > 0 && discountAmount > 0.001 && discountedPrice < listPrice;
    const listFormatted = listPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const discFormatted = discountedPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const html = hasActiveDiscount ? `
      <span class="price-list-strikethrough">${listFormatted} ₺</span>
      <span class="price-net-bold">${discFormatted} ₺</span>
      <span class="discount-percent-badge">%${activeDiscountRate} İskonto</span>
    ` : `
      <span class="price-net-bold">${listFormatted} ₺</span>
    `;

    return {
      activeDiscountRate,
      hasActiveDiscount,
      discountedPrice,
      html: html.trim()
    };
  }

  // Senaryo A: İskonto Oranı %0 (Kullanıcı Talebi: "0 ken bir şey yazmasın, sabit fiyat kalsın")
  const resZero = simulateProductRow(100.00, 0, true);
  console.log('  [Senaryo A: İskonto %0]');
  console.log('  Çıktı HTML:\n ', resZero.html);
  assert(!resZero.hasActiveDiscount, '%0 iken hasActiveDiscount false olmalı');
  assert(!resZero.html.includes('price-list-strikethrough'), '%0 iken üstü çizili fiyat OLMAMALI');
  assert(!resZero.html.includes('discount-percent-badge'), '%0 iken iskonto rozeti OLMAMALI');
  assert(resZero.html.includes('<span class="price-net-bold">100,00 ₺</span>'), '%0 iken sabit 100,00 ₺ net fiyat kalmalı');
  console.log('  ✅ [PASS] %0 iskonto uygulandığında hiçbir rozet/üstü çizili fiyat yazmıyor, sabit fiyat (100,00 ₺) kalıyor.\n');

  // Senaryo B: İskonto Oranı %20 (Kullanıcı Talebi: "%20 uygulandığında o zaman düşüşü göstersin")
  const resTwenty = simulateProductRow(100.00, 20, true);
  console.log('  [Senaryo B: İskonto %20]');
  console.log('  Çıktı HTML:\n ', resTwenty.html);
  assert(resTwenty.hasActiveDiscount, '%20 iken hasActiveDiscount true olmalı');
  assert(resTwenty.html.includes('<span class="price-list-strikethrough">100,00 ₺</span>'), '%20 iken üstü çizili liste fiyatı (100,00 ₺) olmalı');
  assert(resTwenty.html.includes('<span class="price-net-bold">80,00 ₺</span>'), '%20 iken indirimli fiyat (80,00 ₺) olmalı');
  assert(resTwenty.html.includes('<span class="discount-percent-badge">%20 İskonto</span>'), '%20 iken %20 İskonto rozeti olmalı');
  console.log('  ✅ [PASS] %20 iskonto uygulandığında düşüşü (100 ₺ -> 80 ₺) ve rozeti eksiksiz gösteriyor.\n');

  // Senaryo C: Ziyaretçi / Çıkış Yapmış Durum
  const resGuest = simulateProductRow(100.00, 20, false);
  console.log('  [Senaryo C: Ziyaretçi Modu]');
  assert(!resGuest.hasActiveDiscount, 'Ziyaretçi modunda iskonto uygulanmamalı');
  assert(!resGuest.html.includes('discount-percent-badge'), 'Ziyaretçiye iskonto rozeti gösterilmemeli');
  assert(resGuest.html.includes('<span class="price-net-bold">100,00 ₺</span>'), 'Ziyaretçiye yalın liste fiyatı gösterilmeli');
  console.log('  ✅ [PASS] Ziyaretçi modunda sabit fiyat gösterimi doğrulandı.\n');

  // 3. CANLI BACKEND API DOĞRULAMASI
  console.log('3. Canlı Express API & Prisma Veritabanı Testi...');
  const testTenant = await prisma.tenant.findFirst({
    where: { subdomain: 'ahmetoto', isActive: true }
  }) || await prisma.tenant.findFirst({ where: { isActive: true, status: 'APPROVED' } });
  assert(testTenant, 'Veritabanında onaylı en az 1 tenant olmalı');

  // Test kullanıcısı oluştur (%0 iskontolu)
  const testUserZero = await prisma.user.create({
    data: {
      email: `zero_disc_${Date.now()}@test.com`,
      password: 'password123',
      name: 'Sıfır İskontolu Tamirci',
      role: 'CUSTOMER',
      tenantId: testTenant.id,
      customerProfile: {
        create: {
          tenantId: testTenant.id,
          companyName: 'Sıfır İskonto Oto Servis',
          phone: '05551234567',
          discountRate: 0.0, // %0 İSKONTO
          balance: 0.0,
          customerType: 'MECHANIC',
          status: 'APPROVED'
        }
      }
    },
    include: { customerProfile: true }
  });

  const tokenZero = jwt.sign(
    { id: testUserZero.id, email: testUserZero.email, role: testUserZero.role, tenantId: testTenant.id },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Test ürünü ekle
  const testProduct = await prisma.product.create({
    data: {
      name: 'Ön Fren Balata Seti Test',
      oeNumber: `OE-ZERO-${Date.now()}`,
      category: 'Fren Sistemi',
      vehicleBrand: 'Fiat',
      defaultPrice: 100.00
    }
  });

  const testTenantProduct = await prisma.tenantProduct.create({
    data: {
      tenantId: testTenant.id,
      productId: testProduct.id,
      stock: 15,
      customPrice: 100.00
    }
  });

  // GET /api/store/products isteği yap (%0 iskontolu müşteri ile)
  const getZeroRes = await apiRequest({
    path: `/api/store/products?search=${encodeURIComponent(testProduct.oeNumber)}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenZero}`, 'X-Tenant-Slug': testTenant.subdomain }
  });

  assert(getZeroRes.status === 200, 'Ürünler 200 dönmeli');
  const prodZero = getZeroRes.data.data.find(p => p.tenantProductId === testTenantProduct.id);
  assert(prodZero, 'Eklenen ürün api yanıtında bulunmalı');
  assert(prodZero.appliedDiscountRate === 0, 'Uygulanan iskonto oranı 0 olmalı');
  assert(prodZero.pricing.discountRate === 0, 'Pricing discountRate 0 olmalı');
  assert(prodZero.pricing.finalPrice === 100.00, 'Pricing finalPrice sabit 100 ₺ kalmalı');
  assert(prodZero.pricing.savedAmount === 0, 'Pricing savedAmount 0 olmalı');
  console.log('  ✅ [PASS] Backend %0 iskonto durumunda finalPrice=100 ₺ ve savedAmount=0 ₺ döndü.');

  // Şimdi bayinin iskontoyu %20'ye çıkardığını simüle et (PATCH /api/tenant/customers/:id/discount)
  const adminUser = await prisma.user.findFirst({
    where: { tenantId: testTenant.id, role: 'TENANT_ADMIN' }
  });
  const adminToken = jwt.sign(
    { id: adminUser.id, email: adminUser.email, role: adminUser.role, tenantId: testTenant.id },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const patchDiscRes = await apiRequest({
    path: `/api/tenant/customers/${testUserZero.customerProfile.id}/discount`,
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` }
  }, { discountRate: 20 });

  assert(patchDiscRes.status === 200, 'İskonto güncellemesi 200 dönmeli');
  assert(patchDiscRes.data.data.discountRate === 20, 'İskonto %20 olarak güncellenmeli');
  console.log('  ✅ [PASS] Bayi panelinden iskonto %20 yapıldı.');

  // Tekrar GET /api/store/products isteği yap (Müşteri artık %20 iskontolu)
  const getTwentyRes = await apiRequest({
    path: `/api/store/products?search=${encodeURIComponent(testProduct.oeNumber)}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenZero}`, 'X-Tenant-Slug': testTenant.subdomain }
  });

  assert(getTwentyRes.status === 200);
  const prodTwenty = getTwentyRes.data.data.find(p => p.tenantProductId === testTenantProduct.id);
  assert(prodTwenty.appliedDiscountRate === 20, 'Uygulanan iskonto oranı %20 olmalı');
  assert(prodTwenty.pricing.discountRate === 20, 'Pricing discountRate %20 olmalı');
  assert(prodTwenty.pricing.finalPrice === 80.00, 'Pricing finalPrice 80 ₺ düşüş göstermeli');
  assert(prodTwenty.pricing.savedAmount === 20.00, 'Pricing savedAmount 20 ₺ kazanç göstermeli');
  console.log('  ✅ [PASS] Backend %20 iskonto durumunda düşüşü (100 ₺ -> 80 ₺) ve 20 ₺ indirimi döndü.');

  // Şimdi tekrar iskontoyu %0'a çek (Kullanıcı Talebi: "0 çekildiğinde sabit fiyat kalsın")
  const patchZeroAgain = await apiRequest({
    path: `/api/tenant/customers/${testUserZero.customerProfile.id}/discount`,
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` }
  }, { discountRate: 0 });

  assert(patchZeroAgain.status === 200);
  assert(patchZeroAgain.data.data.discountRate === 0, 'İskonto tekrar 0 oldu');

  const getZeroAgain = await apiRequest({
    path: `/api/store/products?search=${encodeURIComponent(testProduct.oeNumber)}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenZero}`, 'X-Tenant-Slug': testTenant.subdomain }
  });

  const prodZeroAgain = getZeroAgain.data.data.find(p => p.tenantProductId === testTenantProduct.id);
  assert(prodZeroAgain.appliedDiscountRate === 0, 'Tekrar 0 iskonto');
  assert(prodZeroAgain.pricing.finalPrice === 100.00, 'Tekrar sabit 100 ₺ fiyat kaldı');
  console.log('  ✅ [PASS] 0\'a çekildiğinde fiyatın sabit 100 ₺ kaldığı canlı API üzerinde de doğrulandı.');

  // Test Verilerini Temizle
  await prisma.tenantProduct.delete({ where: { id: testTenantProduct.id } });
  await prisma.product.delete({ where: { id: testProduct.id } });
  await prisma.customerProfile.delete({ where: { id: testUserZero.customerProfile.id } });
  await prisma.user.delete({ where: { id: testUserZero.id } });
  console.log('  ✅ [PASS] Test verileri başarıyla temizlendi.\n');

  console.log('====================================================');
  console.log('🎉 TÜM SIFIR İSKONTO VE DİNAMİK İNDİRİM TESTLERİ %100 BAŞARILI!');
  console.log('====================================================');
}

runTest()
  .catch(err => {
    console.error('❌ TEST HATASI:', err);
    process.exit(1);
  })
  .finally(async () => {
    await stopServer();
    await prisma.$disconnect();
    process.exit(0);
  });
