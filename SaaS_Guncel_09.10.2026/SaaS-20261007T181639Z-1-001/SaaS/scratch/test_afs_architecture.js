/**
 * test_afs_architecture.js
 * AFS Systems Merkezi Backend Mimarisi (Çoklu Rol, Route İzolasyonu ve CORS) Kapsamlı Doğrulama Testi
 */

const http = require('http');
const path = require('path');

async function runTestSuite() {
  console.log('====================================================================');
  console.log('🚀 AFS SYSTEMS MERKEZİ BACKEND MİMARİSİ DOĞRULAMA TESTİ BAŞLATILIYOR');
  console.log('====================================================================\n');

  // 1. Veritabanını (PGlite) başlat
  const devPg = require('../backend-api/dev_pg_server');
  await devPg.startServer();

  const app = require('../backend-api/app');
  const prisma = require('../backend-api/lib/prisma');
  const config = require('../backend-api/config');
  const { verifyBayi, verifyMusteri } = require('../backend-api/middleware/auth');
  const jwt = require('jsonwebtoken');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName, details = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [TEST ${totalTests}] GEÇTİ: ${testName}`);
    } else {
      console.error(`❌ [TEST ${totalTests}] BAŞARISIZ: ${testName} - Detay: ${details}`);
    }
  }

  // HTTP Helper
  function request(server, reqPath, method = 'GET', headers = {}, body = null) {
    return new Promise((resolve) => {
      const port = server.address().port;
      const reqHeaders = { ...headers };
      let postData = null;

      if (body) {
        postData = JSON.stringify(body);
        reqHeaders['Content-Type'] = 'application/json';
        reqHeaders['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = http.request({
        hostname: '127.0.0.1',
        port: port,
        path: reqPath,
        method: method,
        headers: reqHeaders
      }, (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (_) {
            json = { text: raw };
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json
          });
        });
      });

      req.on('error', (e) => {
        resolve({ status: 500, headers: {}, body: { error: e.message } });
      });

      if (postData) req.write(postData);
      req.end();
    });
  }

  const server = http.createServer(app);
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const testPort = server.address().port;
  console.log(`📡 Test sunucusu http://127.0.0.1:${testPort} üzerinde dinlemede.\n`);

  try {
    // ------------------------------------------------------------------------
    // BÖLÜM 1: PRISMA SCHEMA & ROLLER DOĞRULAMASI
    // ------------------------------------------------------------------------
    console.log('--- 1. BÖLÜM: Prisma Schema & Roller Doğrulaması ---');
    
    // Test 1: User tablosu role Enum desteği
    const bcrypt = require('bcryptjs');
    const pwdHash = await bcrypt.hash('Test1234!', 10);
    const timestamp = Date.now();

    // Test Tenant (Bayi)
    let testTenant = await prisma.tenant.findUnique({ where: { subdomain: 'ahmetoto' } });
    if (!testTenant) {
      testTenant = await prisma.tenant.create({
        data: {
          name: 'Ahmet Oto Test',
          subdomain: 'ahmetoto',
          status: 'APPROVED',
          isActive: true
        }
      });
    }

    // A. BAYI Rolünde Kullanıcı
    const bayiUser = await prisma.user.create({
      data: {
        email: `bayi_${timestamp}@afs-test.com`,
        password: pwdHash,
        role: 'BAYI',
        status: 'APPROVED',
        name: 'AFS Test Bayi',
        tenantId: testTenant.id
      }
    });
    assert(bayiUser && bayiUser.role === 'BAYI', 'User modelinde BAYI rolü ile kullanıcı kaydedildi');

    // B. MUSTERI Rolünde Kullanıcı ve Profil
    const musteriUser = await prisma.user.create({
      data: {
        email: `musteri_${timestamp}@afs-test.com`,
        password: pwdHash,
        role: 'MUSTERI',
        status: 'APPROVED',
        name: 'AFS Test Müşteri',
        tenantId: testTenant.id
      }
    });
    assert(musteriUser && musteriUser.role === 'MUSTERI', 'User modelinde MUSTERI rolü ile kullanıcı kaydedildi');

    const musteriProfile = await prisma.customerProfile.create({
      data: {
        userId: musteriUser.id,
        tenantId: testTenant.id,
        companyName: 'Test Tamirhane Ltd',
        phone: '05551112233',
        customerType: 'MECHANIC',
        status: 'APPROVED',
        discountRate: 20.0
      }
    });
    assert(musteriProfile && musteriProfile.id, 'Müşteri profili oluşturuldu');

    // C. Product ve Bayi İlişkisi
    const oeCode = `OE-AFS-${timestamp}`;
    const testProduct = await prisma.product.create({
      data: {
        oeNumber: oeCode,
        name: 'AFS Fren Diski Ön',
        category: 'Fren Sistemi',
        vehicleBrand: 'Renault',
        compatibleModels: 'Clio IV, Megane III',
        partGroup: 'Ön Aks',
        defaultPrice: 1250.0,
        bayiId: testTenant.id
      }
    });
    assert(testProduct && testProduct.bayiId === testTenant.id, 'Product modeli BAYI (Tenant) ile ilişkilendirildi (bayiId)');

    // Bayinin TenantProduct kataloğuna ekle
    const testTenantProduct = await prisma.tenantProduct.create({
      data: {
        tenantId: testTenant.id,
        productId: testProduct.id,
        stock: 45,
        customPrice: 1200.0
      }
    });
    assert(testTenantProduct && testTenantProduct.id, 'TenantProduct üzerinden parça Bayi kataloğuna bağlandı');

    // D. Order ve Müşteri İlişkisi
    const testOrder = await prisma.order.create({
      data: {
        orderNumber: `AFS-ORD-${timestamp}`,
        tenantId: testTenant.id,
        customerId: musteriProfile.id,
        musteriId: musteriUser.id,
        subtotal: 2400.0,
        vatRate: 20.0,
        vatAmount: 480.0,
        totalAmount: 2880.0,
        status: 'PENDING_APPROVAL'
      }
    });
    assert(testOrder && testOrder.musteriId === musteriUser.id, 'Order modeli MUSTERI (User) ile ilişkilendirildi (musteriId)');

    // ------------------------------------------------------------------------
    // BÖLÜM 2: GÜVENLİK (JWT) VE ROLE MIDDLEWARE DOĞRULAMASI
    // ------------------------------------------------------------------------
    console.log('\n--- 2. BÖLÜM: Güvenlik (JWT) ve verifyBayi / verifyMusteri Middleware Doğrulaması ---');

    // Test: POST /api/auth/login ile Bayi girişi
    const bayiLoginRes = await request(server, '/api/auth/login', 'POST', {}, {
      email: bayiUser.email,
      password: 'Test1234!'
    });
    assert(bayiLoginRes.status === 200, 'POST /api/auth/login Bayi girişi 200 OK döndü');
    assert(bayiLoginRes.body.token, 'Bayi girişinde JWT token üretildi');
    assert(bayiLoginRes.body.role === 'BAYI', 'Bayi yanıtında role: "BAYI" olarak döndü');

    const decodedBayiToken = jwt.verify(bayiLoginRes.body.token, config.JWT_SECRET);
    assert(decodedBayiToken.role === 'BAYI', 'Üretilen JWT token payload rolü kesinlikle "BAYI" içermektedir');

    // Test: POST /api/auth/login ile Müşteri girişi
    const musteriLoginRes = await request(server, '/api/auth/login', 'POST', {}, {
      email: musteriUser.email,
      password: 'Test1234!'
    });
    assert(musteriLoginRes.status === 200, 'POST /api/auth/login Müşteri girişi 200 OK döndü');
    assert(musteriLoginRes.body.token, 'Müşteri girişinde JWT token üretildi');
    assert(musteriLoginRes.body.role === 'MUSTERI', 'Müşteri yanıtında role: "MUSTERI" olarak döndü');

    const decodedMusteriToken = jwt.verify(musteriLoginRes.body.token, config.JWT_SECRET);
    assert(decodedMusteriToken.role === 'MUSTERI', 'Üretilen JWT token payload rolü kesinlikle "MUSTERI" içermektedir');

    // Test: verifyBayi ve verifyMusteri fonksiyonel denetimleri
    assert(typeof verifyBayi === 'function', 'verifyBayi middleware fonksiyonu mevcut ve dışa aktarılmış');
    assert(typeof verifyMusteri === 'function', 'verifyMusteri middleware fonksiyonu mevcut ve dışa aktarılmış');

    // ------------------------------------------------------------------------
    // BÖLÜM 3: ROUTE İZOLASYONU DOĞRULAMASI
    // ------------------------------------------------------------------------
    console.log('\n--- 3. BÖLÜM: Route İzolasyonu (/api/store/* & /api/bayi/*) Doğrulaması ---');

    // 3.1: GET /api/store/products (Müşteri vitrini için filtrelemeye uygun GET)
    const storeProductsRes = await request(server, `/api/store/products?brand=Renault&search=Fren`, 'GET', {
      'X-Tenant-Slug': 'ahmetoto'
    });
    assert(storeProductsRes.status === 200, 'GET /api/store/products müşteri vitrini 200 OK döndü');
    assert(Array.isArray(storeProductsRes.body.products || storeProductsRes.body.data), 'GET /api/store/products filtrelenebilir ürün listesi döndü');

    // 3.2: POST /api/store/orders (Müşteri sipariş alımı POST)
    const storeOrderRes = await request(server, '/api/store/orders', 'POST', {
      'Authorization': `Bearer ${musteriLoginRes.body.token}`,
      'X-Tenant-Slug': 'ahmetoto'
    }, {
      items: [
        { tenantProductId: testTenantProduct.id, quantity: 2 }
      ],
      paymentMethod: 'CURRENT_ACCOUNT'
    });
    assert(storeOrderRes.status === 201 || (storeOrderRes.status === 200 && storeOrderRes.body.success), `POST /api/store/orders sipariş alımı başarılı (Status: ${storeOrderRes.status})`);

    // 3.3: /api/bayi/products CRUD İşlemleri
    // A. GET /api/bayi/products (Yetkili bayinin kendi ürünlerini listelemesi)
    const bayiGetProductsRes = await request(server, '/api/bayi/products', 'GET', {
      'Authorization': `Bearer ${bayiLoginRes.body.token}`
    });
    assert(bayiGetProductsRes.status === 200, 'GET /api/bayi/products yetkili bayi ürün listeleme 200 OK döndü');
    assert(Array.isArray(bayiGetProductsRes.body.data), 'GET /api/bayi/products bayiye özel ürün kataloğu döndü');

    // B. Müşterinin /api/bayi/products'a erişimi engellenmeli (403 Forbidden)
    const musteriBlockedOnBayiRes = await request(server, '/api/bayi/products', 'GET', {
      'Authorization': `Bearer ${musteriLoginRes.body.token}`
    });
    assert(musteriBlockedOnBayiRes.status === 403, 'Müşteri tokenı ile /api/bayi/products erişimi 403 Forbidden ile engellendi');

    // C. POST /api/bayi/products (Bayinin yeni parça eklemesi)
    const newOeCode = `OE-BAYI-${timestamp}`;
    const bayiCreateProductRes = await request(server, '/api/bayi/products', 'POST', {
      'Authorization': `Bearer ${bayiLoginRes.body.token}`
    }, {
      oeNumber: newOeCode,
      name: 'AFS Hava Filtresi Performans',
      category: 'Filtreler',
      vehicleBrand: 'Renault',
      compatibleModels: 'Megane IV',
      partGroup: 'Motor',
      price: 450.0,
      stock: 100
    });
    assert(bayiCreateProductRes.status === 201 || (bayiCreateProductRes.body && bayiCreateProductRes.body.success), `POST /api/bayi/products bayi ürün ekleme işlemi başarılı (Status: ${bayiCreateProductRes.status})`);

    // D. PUT /api/bayi/products/:id (Bayi ürün güncelleme)
    const createdTpId = bayiCreateProductRes.body.data ? bayiCreateProductRes.body.data.id : null;
    if (createdTpId) {
      const bayiUpdateProductRes = await request(server, `/api/bayi/products/${createdTpId}`, 'PUT', {
        'Authorization': `Bearer ${bayiLoginRes.body.token}`
      }, {
        price: 520.0,
        stock: 120
      });
      assert(bayiUpdateProductRes.status === 200, 'PUT /api/bayi/products/:id bayi ürün güncelleme 200 OK döndü');

      // E. DELETE /api/bayi/products/:id (Bayi ürün silme)
      const bayiDeleteProductRes = await request(server, `/api/bayi/products/${createdTpId}`, 'DELETE', {
        'Authorization': `Bearer ${bayiLoginRes.body.token}`
      });
      assert(bayiDeleteProductRes.status === 200, 'DELETE /api/bayi/products/:id bayi parça silme 200 OK döndü');
    }

    // ------------------------------------------------------------------------
    // BÖLÜM 4: CORS AYARI DOĞRULAMASI
    // ------------------------------------------------------------------------
    console.log('\n--- 4. BÖLÜM: CORS Ayarı Doğrulaması ---');

    // Test: server.js cors middleware ve Preflight / Origin kontrolü
    const serverJsContent = require('fs').readFileSync(path.join(__dirname, '..', 'backend-api', 'server.js'), 'utf8');
    assert(serverJsContent.includes('cors('), 'server.js içerisinde cors middleware çağrılmıştır');
    assert(serverJsContent.includes("origin: '*'"), 'server.js cors konfigürasyonunda origin: \'*\' tanımlanmıştır');

    // HTTP CORS Preflight (OPTIONS)
    const corsPreflightRes = await request(server, '/api/store/products', 'OPTIONS', {
      'Origin': 'https://my-storefront.netlify.app',
      'Access-Control-Request-Method': 'GET'
    });
    const allowOrigin = corsPreflightRes.headers['access-control-allow-origin'];
    assert(allowOrigin === '*' || allowOrigin === 'https://my-storefront.netlify.app', `CORS Preflight Access-Control-Allow-Origin başlığı başarıyla döndü (${allowOrigin})`);

    // HTTP Gerçek İstek CORS Başlığı (Netlify Origin)
    const netlifyReqRes = await request(server, '/api/store/products', 'GET', {
      'Origin': 'https://afs-dealer-portal.netlify.app'
    });
    const netlifyOriginHeader = netlifyReqRes.headers['access-control-allow-origin'];
    assert(netlifyOriginHeader === '*' || netlifyOriginHeader === 'https://afs-dealer-portal.netlify.app', `Netlify frontend isteğinde Access-Control-Allow-Origin başlığı sağlandı (${netlifyOriginHeader})`);

    console.log('\n====================================================================');
    console.log(`🎉 TEST SONUÇLARI: ${passedTests}/${totalTests} Test Başarıyla Geçti!`);
    console.log('====================================================================\n');

  } catch (err) {
    console.error('Test yürütülürken hata oluştu:', err);
  } finally {
    server.close();
    process.exit(passedTests === totalTests ? 0 : 1);
  }
}

runTestSuite();

