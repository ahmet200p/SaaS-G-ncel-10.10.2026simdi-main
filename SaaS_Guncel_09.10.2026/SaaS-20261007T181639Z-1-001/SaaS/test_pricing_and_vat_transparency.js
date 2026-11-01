const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const prisma = require('./lib/prisma');
const app = require('./app');

const JWT_SECRET = process.env.JWT_SECRET || 'b2b-super-secret-key-2026';

let server;
let serverPort;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      serverPort = server.address().port;
      console.log(`[TEST_SERVER] Port: ${serverPort}`);
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
      hostname: 'localhost',
      port: serverPort,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🔍 İSKONTO VE KDV ŞEFFAFLIĞI DOĞRULAMA TESTLERİ');
  console.log('====================================================\n');

  await startServer();

  try {
    // 1. STATİK DOSYA KONTROLLERİ (store.html & store.css)
    console.log('--- 1. store.html ve store.css Statik Kod ve DOM Denetimi ---');
    const storeHtml = fs.readFileSync(path.join(__dirname, 'store.html'), 'utf8');
    const storeCss = fs.readFileSync(path.join(__dirname, 'store.css'), 'utf8');

    // Step 1: Çift artı kontrolü
    assert(!storeHtml.includes('+ + Sepete Ekle'), 'Hatalı "+ + Sepete Ekle" metni bulunmamalı');
    assert(storeHtml.includes('<span>${inStock ? \'Sepete Ekle\' : \'Tükendi\'}</span>'), 
      'Sepete Ekle butonu metni temiz olmalı (SVG artı ile çift artı oluşturmamalı)');
    console.log('  ✅ [PASS] 1. ADIM: Çift artı (+ +) hatası temizlendi.');

    // Step 1 & 2: Dinamik iskonto rozeti ve formülü
    assert(storeHtml.includes('customerDiscountRate > 0'), 'İskonto rozeti SADECE iskonto oranı > 0 iken gösterilmeli');
    assert(storeHtml.includes('listPrice * (customerDiscountRate / 100)'), 
      'İndirimli Fiyat = Liste Fiyatı - (Liste Fiyatı * (Müşteri İskonto Oranı / 100)) formülü mevcut');
    console.log('  ✅ [PASS] 1. & 2. ADIM: Dinamik iskonto rozeti ve çıkarma formülü store.html içinde doğrulandı.');

    // Step 3: Sepet özeti KDV şeffaflığı ve hiyerarşi
    assert(storeHtml.includes('summary-list-total'), 'Liste Fiyatı Toplamı elementi mevcut');
    assert(storeHtml.includes('summary-discount-amount'), 'İskonto Kazancı elementi mevcut');
    assert(storeHtml.includes('summary-subtotal-amount'), 'Ara Toplam (KDV Hariç) elementi mevcut');
    assert(storeHtml.includes('summary-vat-amount'), 'KDV (%20) elementi mevcut');
    assert(storeHtml.includes('summary-grand-total'), 'Genel Toplam elementi mevcut');
    console.log('  ✅ [PASS] 3. ADIM: Sepet özeti KDV şeffaflığı ve 5 adımlı hiyerarşi DOM yapısı doğrulandı.');

    // CSS kontrolleri
    assert(storeCss.includes('.summary-row.subtotal-row'), 'store.css içinde subtotal-row stili mevcut');
    assert(storeCss.includes('.summary-row.vat-row'), 'store.css içinde vat-row stili mevcut');
    console.log('  ✅ [PASS] store.css: KDV ve Ara toplam satır stilleri doğrulandı.');

    // 2. BACKEND API KONTROLLERİ: TEST VERİSİ HAZIRLAMA
    console.log('\n--- 2. Backend Veritabanı ve API Fiyat / KDV Testi ---');
    let tenant = await prisma.tenant.findFirst({ where: { subdomain: 'ahmetoto' } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: 'Ahmet Oto', subdomain: 'ahmetoto', isActive: true }
      });
    }

    // %15 İskontolu Otoservis Müşterisi (B2B)
    const testCustEmail = `test_servis_${Date.now()}@b2b.com`;
    const customerUser = await prisma.user.create({
      data: {
        email: testCustEmail,
        password: 'hashed_password',
        role: 'CUSTOMER',
        tenantId: tenant.id
      }
    });

    const customerProfile = await prisma.customerProfile.create({
      data: {
        userId: customerUser.id,
        tenantId: tenant.id,
        companyName: 'Lider Oto Servis',
        phone: '0555 111 22 33',
        customerType: 'MECHANIC',
        discountRate: 15.00, // %15 İskonto
        balance: 0.00
      }
    });

    const authToken = jwt.sign(
      {
        id: customerUser.id,
        email: customerUser.email,
        role: 'CUSTOMER',
        tenantId: tenant.id
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Test Ürünü: Liste Fiyatı = 10.00 ₺, Stok = 50
    const testOe = `TEST-OE-MATH-${Date.now()}`;
    const product = await prisma.product.create({
      data: {
        oeNumber: testOe,
        name: 'Test Filtre Parçası',
        category: 'Filtre Grubu',
        defaultPrice: 10.00,
        vehicleBrand: 'Renault',
        compatibleModels: 'Megane 4',
        partGroup: 'Filtre'
      }
    });

    const tenantProduct = await prisma.tenantProduct.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        customPrice: 10.00,
        stock: 50
      }
    });

    // 3. GET /api/store/products üzerinden Fiyat Kontrolü
    const prodRes = await apiRequest({
      path: `/api/store/products?search=${testOe}`,
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    assert(prodRes.status === 200, 'GET /api/store/products HTTP 200 dönmeli');
    assert(prodRes.data.success, 'GET /api/store/products success dönmeli');
    const item = prodRes.data.data.find(p => p.oeNumber === testOe);
    assert(item, 'Eklenen test ürünü listede dönmeli');

    console.log(`Ürün Fiyatları: Liste=${item.pricing.listPrice} ₺, İskonto Oranı=%${item.pricing.discountRate}, Net İndirimli Fiyat=${item.pricing.finalPrice} ₺`);
    assert(item.pricing.listPrice === 10.00, 'Liste fiyatı 10.00 ₺ olmalı');
    assert(item.pricing.discountRate === 15.00, 'Müşteri iskonto oranı %15 olmalı');
    // Formül: 10 - (10 * 0.15) = 8.50 ₺
    assert(item.pricing.finalPrice === 8.50, 'Net indirimli fiyat 8.50 ₺ olmalı');
    assert(item.discountedPrice === 8.50, 'discountedPrice alanı 8.50 ₺ olmalı');
    console.log('  ✅ [PASS] 2. ADIM: Backend ve JS indirimli fiyat formülü (10 ₺ - %15 = 8.50 ₺) doğrulandı.');

    // 4. POST /api/store/orders ile Sepet & KDV Doğrulaması (Adet = 2)
    // 2 Adet x 10 ₺ Liste = 20.00 ₺
    // 2 Adet x 8.50 ₺ Net = 17.00 ₺ (Ara Toplam KDV Hariç)
    // İskonto Kazancı = 20.00 - 17.00 = 3.00 ₺
    // KDV (%20) = 17.00 * 0.20 = 3.40 ₺
    // Genel Toplam = 17.00 + 3.40 = 20.40 ₺
    console.log('\n--- 3. POST /api/store/orders Sepet Kırılımı ve KDV Teyidi ---');
    const orderRes = await apiRequest({
      path: '/api/store/orders',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    }, {
      items: [
        { tenantProductId: tenantProduct.id, quantity: 2 }
      ]
    });

    assert(orderRes.status === 201, 'POST /api/store/orders HTTP 201 dönmeli');
    assert(orderRes.data.success, 'Sipariş başarılı olmalı');
    const orderData = orderRes.data.data;
    console.log('Sipariş Yanıtı Kırılımı (Breakdown):', orderData.breakdown);

    assert(orderData.subtotal === 17.00, 'Sipariş subtotal (Ara Toplam KDV Hariç) 17.00 ₺ olmalı');
    assert(orderData.vatRate === 20.00, 'Sipariş vatRate %20 olmalı');
    assert(orderData.vatAmount === 3.40, 'Sipariş vatAmount 3.40 ₺ olmalı');
    assert(orderData.totalAmount === 20.40, 'Sipariş totalAmount 20.40 ₺ olmalı');

    if (orderData.breakdown) {
      assert(orderData.breakdown.listPriceTotal === 20.00, 'breakdown listPriceTotal 20.00 ₺ olmalı');
      assert(orderData.breakdown.discountAmount === 3.00, 'breakdown discountAmount 3.00 ₺ olmalı');
      assert(orderData.breakdown.subtotal === 17.00, 'breakdown subtotal 17.00 ₺ olmalı');
      assert(orderData.breakdown.vatAmount === 3.40, 'breakdown vatAmount 3.40 ₺ olmalı');
      assert(orderData.breakdown.totalAmount === 20.40, 'breakdown totalAmount 20.40 ₺ olmalı');
    }

    // 5. Veritabanındaki Order Kaydını Doğrula
    const dbOrder = await prisma.order.findUnique({
      where: { id: orderData.id },
      include: { items: true }
    });
    assert(dbOrder, 'Veritabanında Order kaydı mevcut olmalı');
    assert(dbOrder.subtotal === 17.00, 'DB subtotal 17.00 ₺ olmalı');
    assert(dbOrder.vatAmount === 3.40, 'DB vatAmount 3.40 ₺ olmalı');
    assert(dbOrder.totalAmount === 20.40, 'DB totalAmount 20.40 ₺ olmalı');
    assert(dbOrder.items.length === 1, '1 Kalem OrderItem olmalı');
    assert(dbOrder.items[0].unitPrice === 8.50, 'OrderItem unitPrice 8.50 ₺ olmalı');
    assert(dbOrder.items[0].totalPrice === 17.00, 'OrderItem totalPrice 17.00 ₺ olmalı');

    // Müşteri Cari Bakiyesi Teyidi
    const updatedCust = await prisma.customerProfile.findUnique({ where: { id: customerProfile.id } });
    assert(updatedCust.balance === 20.40, 'Müşteri cari bakiyesine KDV dahil toplam borç (20.40 ₺) eklenmeli');
    console.log('  ✅ [PASS] 4. ADIM: Backend sipariş kırılımları (subtotal, vatAmount, totalAmount) ve DB kaydı %100 doğrulandı.');

    // Temizlik
    await prisma.stockMovement.deleteMany({ where: { orderId: dbOrder.id } });
    await prisma.customerLedger.deleteMany({ where: { customerId: customerProfile.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: dbOrder.id } });
    await prisma.order.delete({ where: { id: dbOrder.id } });
    await prisma.tenantProduct.delete({ where: { id: tenantProduct.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.customerProfile.delete({ where: { id: customerProfile.id } });
    await prisma.user.delete({ where: { id: customerUser.id } });
    console.log('  ✅ [PASS] Test verileri temizlendi.');

    console.log('\n====================================================');
    console.log('🎉 TÜM 4 ADIM TESTİ EKSİKSİZ VE %100 BAŞARILI!');
    console.log('====================================================');

  } finally {
    await stopServer();
    await prisma.$disconnect();
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST HATASI:', err);
  process.exit(1);
});
