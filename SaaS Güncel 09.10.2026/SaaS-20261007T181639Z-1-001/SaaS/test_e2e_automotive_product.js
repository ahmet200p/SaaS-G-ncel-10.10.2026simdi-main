// ============================================================================
// B2B Multi-Tenant SaaS - Otomotiv Yedek Parça Ürün Ekleme/Düzenleme E2E Testi
// Test Dosyası: test_e2e_automotive_product.js
// ============================================================================

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('./app');
const prisma = require('./lib/prisma');

let server;
let port;
let baseUrl;

function runHttp(options, postData = null, isMultipart = false, boundary = '') {
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
      if (Buffer.isBuffer(postData)) {
        req.write(postData);
      } else if (typeof postData === 'string') {
        req.write(postData);
      } else {
        req.write(JSON.stringify(postData));
      }
    }
    req.end();
  });
}

// Multipart FormData Builder (Buffer)
function buildMultipartFormData(fields, files) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
  }

  for (const file of files) {
    const fileContent = file.content || Buffer.from('FAKE_IMAGE_DATA_' + Math.random());
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.type || 'image/png'}\r\n\r\n`));
    chunks.push(fileContent);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const buffer = Buffer.concat(chunks);
  return { buffer, boundary };
}

async function runTests() {
  console.log('====================================================');
  console.log('🚗 OTOMOTİV YEDEK PARÇA MODÜLÜ E2E DOĞRULAMA TESTİ');
  console.log('====================================================');

  // Test sunucusunu başlat
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`[TEST_SERVER] Geçici test sunucusu port:${port} üzerinde dinliyor.`);
      resolve();
    });
  });

  try {
    // ------------------------------------------------------------------------
    // 1. Prisma & DB Şema Alanları Doğrulaması
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Prisma Schema ve SQLite Veritabanı Alan Denetimi ---');
    const schemaContent = fs.readFileSync(path.join(__dirname, 'prisma/schema.prisma'), 'utf8');
    assert(schemaContent.includes('vehicleBrand'), 'Product modelinde vehicleBrand alanı tanımlı');
    assert(schemaContent.includes('compatibleModels'), 'Product modelinde compatibleModels alanı tanımlı');
    assert(schemaContent.includes('partGroup'), 'Product modelinde partGroup alanı tanımlı');
    console.log('  ✅ [PASS] prisma/schema.prisma: vehicleBrand, compatibleModels, partGroup alanları mevcut.');

    // Veritabanındaki ürünleri sorgula
    let sampleProducts = await prisma.product.findMany({ take: 5 });
    if (sampleProducts.length === 0) {
      await prisma.product.create({
        data: {
          oeNumber: 'TEST-SCHEMA-OE-001',
          name: 'Doğrulama Numunesi Parça',
          category: 'Genel',
          defaultPrice: 100,
          vehicleBrand: 'Volkswagen',
          compatibleModels: 'Golf 7',
          partGroup: 'Motor & Mekanik'
        }
      });
      sampleProducts = await prisma.product.findMany({ take: 5 });
    }
    assert(sampleProducts.length > 0, 'Veritabanında ürün mevcut');
    assert('vehicleBrand' in sampleProducts[0], 'Product objesinde vehicleBrand özelliği mevcut');
    assert('compatibleModels' in sampleProducts[0], 'Product objesinde compatibleModels özelliği mevcut');
    assert('partGroup' in sampleProducts[0], 'Product objesinde partGroup özelliği mevcut');
    console.log(`  ✅ [PASS] SQLite dev.db Product tablosunda yeni alanlar doğrulandı (Örnek parça: ${sampleProducts[0].name} | ${sampleProducts[0].vehicleBrand || 'Evrensel'}).`);

    // ------------------------------------------------------------------------
    // 2. Bayi Yöneticisi Girişi (Login)
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Bayi Kimlik Doğrulaması (Login) ---');
    const loginRes = await runHttp({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'ahmet@ahmetoto.com', password: process.env.DEFAULT_DEALER_PASSWORD || 'SaaS_Dealer_Admin_2026!#Secure' });

    assert(loginRes.status === 200, 'Login HTTP 200 dönmeli');
    const token = loginRes.body.token || loginRes.body.data?.token;
    assert(token, 'JWT Token başarıyla alındı');
    console.log('  ✅ [PASS] Bayi oturumu açıldı (ahmet@ahmetoto.com).');

    const authHeaders = {
      'Authorization': `Bearer ${token}`
    };

    // ------------------------------------------------------------------------
    // 3. POST /api/tenant/products (Otomotiv Alanlarıyla Yeni Parça Ekleme)
    // ------------------------------------------------------------------------
    console.log('\n--- 3. POST /api/tenant/products (3 Yeni Alan + 3 Görsel) ---');
    const testOe = 'VAG-' + Math.floor(100000 + Math.random() * 900000);
    const { buffer: multipartBody, boundary } = buildMultipartFormData(
      {
        name: 'Orijinal Triger Seti ve Devirdaim',
        oeNumber: testOe,
        category: 'Motor',
        vehicleBrand: 'Volkswagen',
        compatibleModels: 'Golf 7, Passat B8, Tiguan 2.0 TDI',
        partGroup: 'Motor',
        price: '4850.50',
        stock: '35'
      },
      [
        { name: 'images', filename: 'triger1.png', content: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex') },
        { name: 'images', filename: 'triger2.png', content: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex') },
        { name: 'images', filename: 'triger3.png', content: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex') }
      ]
    );

    const createRes = await runHttp({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/tenant/products',
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': multipartBody.length
      }
    }, multipartBody, true, boundary);

    assert(createRes.status === 201, `Ürün kaydı HTTP 201 dönmeli, dönen: ${createRes.status}`);
    assert(createRes.body.success === true, 'success: true dönmeli');
    const createdTp = createRes.body.data;
    assert(createdTp, 'Oluşturulan TenantProduct dönmeli');
    assert(createdTp.product, 'İlişkili Product dönmeli');
    assert(createdTp.product.oeNumber === testOe, 'OE numarası eşleşmeli');
    assert(createdTp.product.vehicleBrand === 'Volkswagen', 'vehicleBrand "Volkswagen" olarak kaydedilmiş olmalı');
    assert(createdTp.product.compatibleModels === 'Golf 7, Passat B8, Tiguan 2.0 TDI', 'compatibleModels doğru kaydedilmiş olmalı');
    assert(createdTp.product.partGroup === 'Motor', 'partGroup "Motor" olarak kaydedilmiş olmalı');
    console.log(`  ✅ [PASS] Yeni parça başarıyla tanımlandı: [${createdTp.product.oeNumber}] ${createdTp.product.name}`);
    console.log(`         🚗 Marka: ${createdTp.product.vehicleBrand} | Model: ${createdTp.product.compatibleModels} | Grup: ${createdTp.product.partGroup}`);

    // ------------------------------------------------------------------------
    // 4. GET /api/tenant/products (Listeleme & Otomotiv Alanlarının Gelmesi)
    // ------------------------------------------------------------------------
    console.log('\n--- 4. GET /api/tenant/products Listeleme ve Otomotiv Alanları ---');
    const getRes = await runHttp({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/tenant/products',
      method: 'GET',
      headers: authHeaders
    });

    assert(getRes.status === 200, 'GET /api/tenant/products HTTP 200 dönmeli');
    assert(Array.isArray(getRes.body.data), 'data dizi olmalı');
    const foundCreated = getRes.body.data.find(tp => tp.product?.oeNumber === testOe);
    assert(foundCreated, 'Yeni eklenen ürün katalog listesinde yer almalı');
    assert(foundCreated.product.vehicleBrand === 'Volkswagen', 'vehicleBrand doğrulanmalı');
    assert(foundCreated.product.compatibleModels.includes('Golf 7'), 'Golf 7 modeli listede görünmeli');
    console.log(`  ✅ [PASS] Bayi kataloğundaki ${getRes.body.count} ürün başarıyla listelendi ve otomotiv verileri doğrulandı.`);

    // ------------------------------------------------------------------------
    // 5. GET /api/tenant/products?brand=Volkswagen Filtreleme
    // ------------------------------------------------------------------------
    console.log('\n--- 5. GET /api/tenant/products?brand=Volkswagen Filtre Testi ---');
    const filterBrandRes = await runHttp({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/tenant/products?brand=Volkswagen',
      method: 'GET',
      headers: authHeaders
    });

    assert(filterBrandRes.status === 200, 'Filtre sorgusu HTTP 200 dönmeli');
    assert(filterBrandRes.body.data.length > 0, 'Volkswagen markalı parçalar gelmeli');
    filterBrandRes.body.data.forEach(item => {
      assert(item.product.vehicleBrand?.toLowerCase().includes('volkswagen'), 'Tüm filtrelenmiş ürünler Volkswagen olmalı');
    });
    console.log(`  ✅ [PASS] Marka filtrelemesi çalışıyor: ${filterBrandRes.body.data.length} adet Volkswagen parçası bulundu.`);

    // ------------------------------------------------------------------------
    // 6. PATCH & PUT /api/tenant/products/:id (Otomotiv Alanlarını Güncelleme)
    // ------------------------------------------------------------------------
    console.log('\n--- 6. PATCH /api/tenant/products/:id Detaylı Düzenleme Testi ---');
    const patchRes = await runHttp({
      hostname: '127.0.0.1',
      port: port,
      path: `/api/tenant/products/${createdTp.id}`,
      method: 'PATCH',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      }
    }, {
      name: 'Revize Triger Kiti & Su Pompası',
      vehicleBrand: 'Volkswagen AG',
      compatibleModels: 'Golf 7, Passat B8, Arteon, Leon 3, Octavia 3',
      partGroup: 'Motor',
      customPrice: 5200.00,
      stock: 40
    });

    assert(patchRes.status === 200, 'PATCH HTTP 200 dönmeli');
    assert(patchRes.body.success === true, 'PATCH success true dönmeli');
    assert(patchRes.body.data.customPrice === 5200.00, 'Özel fiyat güncellenmiş olmalı');
    assert(patchRes.body.data.stock === 40, 'Stok adedi güncellenmiş olmalı');
    assert(patchRes.body.data.product.name === 'Revize Triger Kiti & Su Pompası', 'Ürün adı güncellenmiş olmalı');
    assert(patchRes.body.data.product.vehicleBrand === 'Volkswagen AG', 'vehicleBrand güncellenmiş olmalı');
    assert(patchRes.body.data.product.compatibleModels.includes('Arteon'), 'compatibleModels güncellenmiş olmalı');
    console.log(`  ✅ [PASS] Ürün bilgileri ve araç uyumu başarıyla güncellendi: ${patchRes.body.data.product.name} (Fiyat: ${patchRes.body.data.customPrice} ₺, Stok: ${patchRes.body.data.stock})`);

    // ------------------------------------------------------------------------
    // 7. Store API Uç Noktasında Arama ve Otomotiv Alanlarının Dönmesi
    // ------------------------------------------------------------------------
    console.log('\n--- 7. GET /api/store/products Müşteri Arama & Otomotiv Alanları ---');
    let custCheck = await prisma.user.findUnique({ where: { email: 'kemal@kemaloto.com' } });
    if (!custCheck) {
      require('child_process').execSync('node prisma/seed.js', { stdio: 'ignore', env: { ...process.env, NODE_ENV: 'development' } });
    }
    const custLoginRes = await runHttp({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'kemal@kemaloto.com', password: '123456' });
    const custToken = custLoginRes.body.token || custLoginRes.body.data?.token;

    const storeSearchRes = await runHttp({
      hostname: '127.0.0.1',
      port: port,
      path: `/api/store/products?search=${encodeURIComponent(testOe)}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${custToken}` }
    });

    assert(storeSearchRes.status === 200, 'Store arama HTTP 200 dönmeli');
    assert(storeSearchRes.body.data.length >= 1, 'Mağaza aramasında ürün bulunmalı');
    const storeItem = storeSearchRes.body.data.find(p => p.oeNumber === testOe);
    assert(storeItem, 'Oluşturulan ürün mağazada mevcut');
    assert(storeItem.vehicleBrand === 'Volkswagen AG', 'Mağazada vehicleBrand mevcut');
    assert(storeItem.compatibleModels.includes('Golf 7'), 'Mağazada compatibleModels mevcut');
    assert(storeItem.partGroup === 'Motor', 'Mağazada partGroup mevcut');
    console.log(`  ✅ [PASS] Müşteri mağaza API'sinde otomotiv alanları listelendi: [${storeItem.oeNumber}] ${storeItem.name} (Marka: ${storeItem.vehicleBrand}, Grup: ${storeItem.partGroup})`);

    // ------------------------------------------------------------------------
    // 8. Frontend bayi.html Arayüz Elemanları Denetimi
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Frontend bayi.html UI/UX Form ve Çekmece Denetimi ---');
    const bayiHtml = fs.readFileSync(path.join(__dirname, 'bayi.html'), 'utf8');

    assert(bayiHtml.includes('id="prod-brand"'), 'bayi.html içinde #prod-brand (Araç Markası) selecti mevcut');
    assert(bayiHtml.includes('id="prod-models"'), 'bayi.html içinde #prod-models (Uyumlu Modeller) inputu mevcut');
    assert(bayiHtml.includes('id="prod-group"'), 'bayi.html içinde #prod-group (Parça Grubu) selecti mevcut');
    assert(!bayiHtml.includes('id="prod-category"'), 'bayi.html içinde eski #prod-category kaldırılmış olmalı');
    assert(bayiHtml.includes('id="filter-products-brand"'), 'bayi.html içinde #filter-products-brand (Marka Filtresi) mevcut');
    assert(bayiHtml.includes('openEditProductDrawer'), 'bayi.html içinde openEditProductDrawer fonksiyonu mevcut');
    assert(bayiHtml.includes('id="prod-edit-id"'), 'bayi.html formunda #prod-edit-id gizli inputu mevcut');

    // 4. ADIM: Frontend JS - Veri Gönderimi ve Tablo Görünümü Denetimi
    assert(bayiHtml.includes('MARKA &amp; GRUP') || bayiHtml.includes('MARKA & GRUP'), 'bayi.html tablosunda MARKA & GRUP sütun başlığı mevcut');
    assert(bayiHtml.includes('loadProducts'), 'bayi.html içinde loadProducts fonksiyonu tanımlı');
    assert(bayiHtml.includes("formData.append('vehicleBrand'") /* ) */, 'FormData içine vehicleBrand eklenmeli');
    assert(bayiHtml.includes("formData.append('compatibleModels'") /* ) */, 'FormData içine compatibleModels eklenmeli');
    assert(bayiHtml.includes("formData.append('partGroup'") /* ) */, 'FormData içine partGroup eklenmeli');
    assert(bayiHtml.includes('id="btn-add-product"') && bayiHtml.includes('>Yeni Ürün Ekle</button>'), 'bayi.html içinde temiz Yeni Ürün Ekle butonu mevcut');
    console.log('  ✅ [PASS] bayi.html 4. ADIM: "MARKA & GRUP" sütunu, loadProducts fonksiyonu, FormData alanları ve "Yeni Ürün Ekle" butonu doğrulandı.');

    // ------------------------------------------------------------------------
    // 9. Temizlik (Test Parçasını Katalogdan Silme)
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Test Parçasının Silinmesi ---');
    const delRes = await runHttp({
      hostname: '127.0.0.1',
      port: port,
      path: `/api/tenant/products/${createdTp.id}`,
      method: 'DELETE',
      headers: authHeaders
    });
    assert(delRes.status === 200, 'DELETE /api/tenant/products/:id HTTP 200 dönmeli');
    console.log('  ✅ [PASS] Test parçası temizlendi.');

    console.log('\n====================================================');
    console.log('🎉 TÜM OTOMOTİV YEDEK PARÇA TESTLERİ %100 BAŞARILI!');
    console.log('====================================================');

  } catch (err) {
    console.error('\n❌ TEST BAŞARISIZ OLDU:', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
      console.log('[TEST_SERVER] Test sunucusu kapatıldı.');
    }
  }
}

runTests();
