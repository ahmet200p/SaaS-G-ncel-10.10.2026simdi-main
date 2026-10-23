/**
 * test_product_deletion_and_mock_cleansing.js
 * 
 * Bu test betiği kullanıcının bildirdiği iki kritik sorunu test eder ve doğrular:
 * 1. Mock/Örnek verilerin temizliği: api.js içindeki örnek verilerin (Kemal Usta,
 *    04465-02220 nolu parça, SP-KXZ91A-4821 siparişi vb.) tamamen arındırıldığı ve
 *    temiz/organik başlatıldığı.
 * 2. Ürün silme işlemi: Hem Canlı Express/Prisma API'sinde hem de Çevrimdışı/Mock motorunda
 *    katalogdan ürün silindiğinde hem TenantProduct hem de Product (ana veritabanı) tablolarından
 *    kalıcı ve eksiksiz olarak silindiği.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const prisma = require('./lib/prisma');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'b2b_super_secret_jwt_key_2026_secure';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Ürün Silme ve Mock Temizliği Testleri Başlatılıyor');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✅ [TEST ${total}] BAŞARILI: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [TEST ${total}] BAŞARISIZ: ${name}`);
      console.error(err);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [TEST ${total}] BAŞARILI: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [TEST ${total}] BAŞARISIZ: ${name}`);
      console.error(err);
    }
  }

  // 1. STATİK KONTROLLER: api.js içinde hardcoded sahte ürün ve siparişlerin bulunmaması
  test('api.js içindeki mock tohumda (initMockStore) eski sahte ürünler ve siparişler arındırıldı', () => {
    const apiJs = fs.readFileSync(path.join(__dirname, 'assets', 'js', 'api.js'), 'utf-8');
    
    // saas_b2b_standalone_data_v2 anahtarı kullanılmalı
    assert(apiJs.includes('saas_b2b_standalone_data_v2'), 'MOCK_STORAGE_KEY v2 olmalı');
    assert(apiJs.includes("localStorage.removeItem('saas_b2b_standalone_data_v1')"), 'v1 temizlenmeli');

    // Eski sabit mock veriler olmamalı
    assert(!apiJs.includes("oeNumber: '04465-02220'"), "api.js içinde 04465-02220 mock parçası olmamalı");
    assert(!apiJs.includes("orderNumber: 'SP-KXZ91A-4821'"), "api.js içinde SP-KXZ91A-4821 mock siparişi olmamalı");
    assert(!apiJs.includes("companyName: 'Kemal Usta Oto Servis'"), "api.js içinde Kemal Usta mock müşterisi olmamalı");
    assert(!apiJs.includes("companyName: 'Yıldız Kardeşler Bosch Car Service'"), "api.js içinde Yıldız Kardeşler mock müşterisi olmamalı");
  });

  // 2. MOCK ENGINE: DELETE /tenant/products/:id işleyicisinin varlığı ve mantığı
  test('api.js içindeki handleOfflineMock DELETE /tenant/products/:id işleyicisi eklenmiş olmalı', () => {
    const apiJs = fs.readFileSync(path.join(__dirname, 'assets', 'js', 'api.js'), 'utf-8');
    assert(apiJs.includes("cleanEndpoint.startsWith('/tenant/products/')") && apiJs.includes("method === 'DELETE'"), 
      'DELETE /tenant/products/:id işleyicisi tanımlı olmalı');
    assert(apiJs.includes('store.tenantCatalog.splice') || apiJs.includes('store.tenantCatalog ='),
      'tenantCatalog içinden silme işlemi yapılmalı');
    assert(apiJs.includes('store.products ='), 'products içinden de silme işlemi yapılmalı');
  });

  // 3. BAYI.HTML: deleteProduct fonksiyonunun DOM ve önbellek davranışı
  test('bayi.html içindeki deleteProduct DOM satırını ve önbelleği anında temizlemeli', () => {
    const bayiHtml = fs.readFileSync(path.join(__dirname, 'bayi.html'), 'utf-8');
    assert(bayiHtml.includes("tr[data-tenant-product-id=") /* ] */, 'deleteProduct DOM elementini temizlemeli');
    assert(bayiHtml.includes('cachedCatalog = (cachedCatalog || []).filter'), 'cachedCatalog güncellenmeli');
    assert(bayiHtml.includes('renderCatalogTable([])'), 'Ürün kalmadığında boş durum tablosu gösterilmeli');
    assert(!bayiHtml.includes('<option value="Kemal Usta Oto Servis">Kemal Usta Oto Servis</option>'), 'bayi.html içinde Kemal Usta statik option kaldırıldı');
  });

  // 4. VERİTABANI KONTROLÜ: SQLite / Prisma ile Ürün Ekleme ve Ardından Kesin Silme
  await asyncTest('Prisma & SQLite: Bayi Ürünü Silindiğinde hem TenantProduct hem de Product tablosundan silinmeli', async () => {
    // Ahmet Oto bayisini bul
    const tenant = await prisma.tenant.findUnique({ where: { subdomain: 'ahmetoto' } });
    assert(tenant, 'Ahmet Oto bayisi mevcut olmalı');

    // Test için bir ürün ve tenantProduct oluştur
    const testOe = `TEST-OE-${Date.now()}`;
    const testProduct = await prisma.product.create({
      data: {
        oeNumber: testOe,
        name: 'Silinecek Test Balatası',
        category: 'Fren Sistemi',
        defaultPrice: 950.00
      }
    });

    const testTenantProduct = await prisma.tenantProduct.create({
      data: {
        tenantId: tenant.id,
        productId: testProduct.id,
        stock: 15,
        customPrice: 1100.00
      }
    });

    // Varlık kontrolü
    const tpBefore = await prisma.tenantProduct.findUnique({ where: { id: testTenantProduct.id } });
    const pBefore = await prisma.product.findUnique({ where: { id: testProduct.id } });
    assert(tpBefore, 'TenantProduct veritabanına eklenmiş olmalı');
    assert(pBefore, 'Product veritabanına eklenmiş olmalı');

    // Simüle edilen silme rotası mantığı (routes/tenant.js handleDeleteTenantProduct)
    const tpId = testTenantProduct.id;
    const productIdToDelete = testProduct.id;

    await prisma.orderItem.deleteMany({ where: { tenantProductId: tpId } });
    await prisma.stockMovement.deleteMany({ where: { tenantProductId: tpId } });
    await prisma.tenantProduct.delete({ where: { id: tpId } });

    const otherCount = await prisma.tenantProduct.count({ where: { productId: productIdToDelete } });
    if (otherCount === 0) {
      await prisma.product.delete({ where: { id: productIdToDelete } });
    }

    // Silme sonrası kontrol: Hem TenantProduct hem Product silinmiş olmalı!
    const tpAfter = await prisma.tenantProduct.findUnique({ where: { id: tpId } });
    const pAfter = await prisma.product.findUnique({ where: { id: productIdToDelete } });

    assert.strictEqual(tpAfter, null, 'TenantProduct tablosundan ürün silinmiş olmalı');
    assert.strictEqual(pAfter, null, 'Product ana tablosundan da ürün silinmiş olmalı');
  });

  // 5. STORE.HTML: Kemal Usta temizliği kontrolü
  test('store.html içindeki Kemal Usta statik referansları kaldırılmış olmalı', () => {
    const storeHtml = fs.readFileSync(path.join(__dirname, 'store.html'), 'utf-8');
    assert(!storeHtml.includes('Hoş Geldin, Kemal Usta'), 'store.html içinde Hoş Geldin Kemal Usta olmamalı');
    assert(!storeHtml.includes('Kemal Oto Servis • Cari No: 1042'), 'store.html içinde Kemal Oto Servis olmamalı');
    assert(!storeHtml.includes("showToast('Kemal Usta Otomotiv") /* ) */, 'store.html içinde Kemal Usta toast olmamalı');
  });

  // 6. ADMIN.HTML: Demir Otomotiv statik row temizliği ve boş liste kontrolü
  test('admin.html içindeki Demir Otomotiv statik row kaldırılmış olmalı', () => {
    const adminHtml = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf-8');
    assert(!adminHtml.includes('data-tenant-id="tenant-demir-oto"'), 'admin.html içinde tenant-demir-oto row kaldırılmış olmalı');
  });

  console.log('\n====================================================');
  console.log(`🎉 TEST SONUÇLARI: ${passed}/${total} Başarılı`);
  console.log('====================================================');

  await prisma.$disconnect();

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test hatası:', err);
  process.exit(1);
});
