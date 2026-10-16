/**
 * ============================================================================
 * TEST SÜİTİ: REST API STANDARTLARI & SAF JSON DOĞRULAMA TESTİ
 * prompt.md:
 * - "backend-api klasöründeki rotalarımızı (routes) güncelleyeceğiz."
 * - "Artık backend'imiz hiçbir şekilde HTML dosyası sunmayacak (res.sendFile veya res.render kullanma)."
 * - "store.js ve ürün listeleme uç noktalarını tamamen REST API standartlarına çek."
 * - "Arama veya ürün listeleme istekleri geldiğinde sadece saf JSON verisi (res.json) döndürsün."
 * ============================================================================
 */

const http = require('http');

let passed = 0;
let total = 0;

function check(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Accept': 'application/json',
        ...headers
      }
    };

    if (body) {
      const dataStr = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(dataStr);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed,
          raw: data
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🛡️ REST API STANDARTLARI & SAF JSON DOĞRULAMA TESTİ (prompt.md)');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // BÖLÜM 1: BACKEND HTML SUNMAMA KONTROLLERİ (NO HTML SERVED)
  // --------------------------------------------------------------------------
  console.log('--- 1. Backend HTML Sunmama & Saf JSON Zorunluluğu ---');

  // 1.1 Kök Dizin (/) Kontrolü
  const rootRes = await request('GET', '/');
  check(rootRes.statusCode === 200, 'GET / isteği HTTP 200 OK döner.');
  check(typeof rootRes.data === 'object' && rootRes.data.success === true, 'GET / yanıtı HTML DEĞİL, saf JSON nesnesi döner.');
  check(rootRes.headers['content-type'] && rootRes.headers['content-type'].includes('application/json'), 'GET / Content-Type başlığı application/json içerir.');
  check(!rootRes.raw.includes('<!DOCTYPE html>') && !rootRes.raw.includes('<html'), 'GET / yanıtında HTML etiketleri bulunmaz.');

  // 1.2 /store.html İstek Blokajı
  const storeHtmlRes = await request('GET', '/store.html');
  check(storeHtmlRes.statusCode === 404 || storeHtmlRes.statusCode === 406, 'GET /store.html doğrudan HTML sunmaz (HTTP 404/406 döner).');
  check(typeof storeHtmlRes.data === 'object' && storeHtmlRes.data.success === false, 'GET /store.html saf JSON hata mesajı döner.');
  check(!storeHtmlRes.raw.includes('<!DOCTYPE html>'), 'GET /store.html yanıtında HTML markup bulunmaz.');

  // 1.3 /admin.html İstek Blokajı
  const adminHtmlRes = await request('GET', '/admin.html');
  check(adminHtmlRes.statusCode === 404 || adminHtmlRes.statusCode === 406, 'GET /admin.html doğrudan HTML sunmaz (HTTP 404/406 döner).');
  check(typeof adminHtmlRes.data === 'object' && adminHtmlRes.data.success === false, 'GET /admin.html saf JSON hata mesajı döner.');

  // 1.4 /bayi.html İstek Blokajı
  const bayiHtmlRes = await request('GET', '/bayi.html');
  check(bayiHtmlRes.statusCode === 404 || bayiHtmlRes.statusCode === 406, 'GET /bayi.html doğrudan HTML sunmaz (HTTP 404/406 döner).');

  // --------------------------------------------------------------------------
  // BÖLÜM 2: RESTful ÜRÜN LİSTELEME UÇ NOKTASI (GET /api/store/products)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. RESTful Ürün Listeleme & Saf JSON Standardı ---');

  const productsRes = await request('GET', '/api/store/products?limit=10', {
    'X-Tenant-Slug': 'ahmetoto'
  });
  check(productsRes.statusCode === 200, 'GET /api/store/products HTTP 200 OK döner.');
  check(typeof productsRes.data === 'object' && productsRes.data.success === true, 'Ürün listesi yanıtı saf JSON nesnesidir.');
  check(Array.isArray(productsRes.data.data), 'Ürünler dizi (array) formatında data alanı içinde döner.');
  check(productsRes.headers['content-type'].includes('application/json'), 'Content-Type kesinlikle application/json olarak ayarlanmıştır.');

  // REST Sayfalama (Pagination) Standardı
  check(
    productsRes.data.pagination &&
    typeof productsRes.data.pagination.page === 'number' &&
    typeof productsRes.data.pagination.totalCount === 'number' &&
    typeof productsRes.data.pagination.totalPages === 'number',
    'REST standart sayfalama meta verileri (page, totalCount, totalPages) eksiksiz mevcuttur.'
  );

  // --------------------------------------------------------------------------
  // BÖLÜM 3: ARAMA UÇ NOKTALARI & BÜYÜK/KÜÇÜK HARF DUYARSIZLIĞI (CASE-INSENSITIVE)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Arama Uç Noktaları & Büyük/Küçük Harf Duyarsızlığı (PostgreSQL) ---');

  // 3.1 Küçük harfle arama (?search=fren veya ?search=balata)
  const searchLowerRes = await request('GET', '/api/store/products?search=fren', {
    'X-Tenant-Slug': 'ahmetoto'
  });
  check(searchLowerRes.statusCode === 200 && searchLowerRes.data.success, 'Küçük harfli arama (?search=fren) HTTP 200 OK döner.');

  // 3.2 Büyük harfle arama (?search=FREN)
  const searchUpperRes = await request('GET', '/api/store/products?search=FREN', {
    'X-Tenant-Slug': 'ahmetoto'
  });
  check(searchUpperRes.statusCode === 200 && searchUpperRes.data.success, 'Büyük harfli arama (?search=FREN) HTTP 200 OK döner.');

  // mode: 'insensitive' Doğrulaması: Her iki arama da aynı sonuç sayısını bulmalıdır
  check(
    searchLowerRes.data.count === searchUpperRes.data.count,
    `Büyük/küçük harf duyarsızlığı doğrulandı: "fren" (${searchLowerRes.data.count}) ve "FREN" (${searchUpperRes.data.count}) sonuçları eşit.`
  );

  // 3.3 Çok Kriterli REST Filtreleme (Brand + Search çakışmasız çalışma)
  const multiFilterRes = await request('GET', '/api/store/products?brand=Renault&search=fren', {
    'X-Tenant-Slug': 'ahmetoto'
  });
  check(multiFilterRes.statusCode === 200 && multiFilterRes.data.success, 'Çok kriterli filtreleme (brand=Renault&search=fren) hatasız çalışır.');

  // 3.4 Özel REST Arama Uç Noktası (GET /api/store/search)
  const quickSearchRes = await request('GET', '/api/store/search?q=fren&limit=5', {
    'X-Tenant-Slug': 'ahmetoto'
  });
  check(quickSearchRes.statusCode === 200 && quickSearchRes.data.success, 'Özel REST arama uç noktası (GET /api/store/search) HTTP 200 OK döner.');
  check(Array.isArray(quickSearchRes.data.data), 'Arama sonuçları saf JSON dizisi formatındadır.');
  check(quickSearchRes.data.query === 'fren', 'Arama terimi query alanında doğrulanır.');

  // --------------------------------------------------------------------------
  // BÖLÜM 4: REST TEKİL ÜRÜN, KATEGORİ VE MARKA UÇ NOKTALARI
  // --------------------------------------------------------------------------
  console.log('\n--- 4. REST Tekil Ürün, Kategori ve Marka Uç Noktaları ---');

  // 4.1 Kategoriler REST Uç Noktası
  const categoriesRes = await request('GET', '/api/store/categories', {
    'X-Tenant-Slug': 'ahmetoto'
  });
  check(categoriesRes.statusCode === 200 && categoriesRes.data.success, 'GET /api/store/categories HTTP 200 OK döner.');
  check(Array.isArray(categoriesRes.data.data), 'Kategoriler listesi saf JSON dizisidir.');

  // 4.2 Araç Markaları REST Uç Noktası
  const brandsRes = await request('GET', '/api/store/brands', {
    'X-Tenant-Slug': 'ahmetoto'
  });
  check(brandsRes.statusCode === 200 && brandsRes.data.success, 'GET /api/store/brands HTTP 200 OK döner.');
  check(Array.isArray(brandsRes.data.data), 'Markalar listesi saf JSON dizisidir.');

  // 4.3 Tekil Ürün REST Uç Noktası (GET /api/store/products/:id)
  if (productsRes.data.data.length > 0) {
    const sampleProduct = productsRes.data.data[0];
    const singleProductRes = await request('GET', `/api/store/products/${sampleProduct.tenantProductId}`, {
      'X-Tenant-Slug': 'ahmetoto'
    });
    check(singleProductRes.statusCode === 200 && singleProductRes.data.success, 'GET /api/store/products/:id HTTP 200 OK döner.');
    check(singleProductRes.data.data.name === sampleProduct.name, 'Tekil ürün bilgisi doğru eşleşir.');
  } else {
    const singleProductNotFound = await request('GET', '/api/store/products/non-existent-id-999', {
      'X-Tenant-Slug': 'ahmetoto'
    });
    check(singleProductNotFound.statusCode === 404, 'Bulunamayan tekil ürün REST standartlarında HTTP 404 döner.');
  }

  // --------------------------------------------------------------------------
  // BÖLÜM 5: GÜVENLİK & VERİ SIZINTISI KONTROLÜ
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Ziyaretçi Modunda B2B Veri Sızıntısı Koruması (Saf JSON) ---');
  if (productsRes.data.data.length > 0) {
    const p = productsRes.data.data[0];
    check(p.stock === null, 'Ziyaretçi modunda stok miktarı kesinlikle gizlenir (null döner).');
    check(p.defaultPrice === null, 'Ziyaretçi modunda toptan liste fiyatı kesinlikle gizlenir (null döner).');
    check(p.pricing === null, 'Ziyaretçi modunda fiyatlama detayları kesinlikle gizlenir (null döner).');
    check(p.guestNotice === 'Fiyatları görmek için giriş yapın veya kayıt olun', 'Ziyaretçiye açıklayıcı JSON uyarısı verilir.');
  }

  console.log('\n================================================================');
  console.log(`🎉 TEST SONUCU: ${passed}/${total} (%${Math.round((passed / total) * 100)}) BAŞARILI`);
  console.log('================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('[FATAL_TEST_ERROR]:', err);
  process.exit(1);
});
