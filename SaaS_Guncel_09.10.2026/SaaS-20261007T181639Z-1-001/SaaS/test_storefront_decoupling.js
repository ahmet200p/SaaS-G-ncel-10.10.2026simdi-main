// ============================================================================
// Multi-Tenant B2B SaaS - Storefront Decoupling & 5-Step Verification Suite
// prompt.md 5 Adım Test Senaryosu:
// 1. ADIM: Logout Ayrıştırması (store.html -> Asla login.html yönlendirmesi olamaz)
// 2. ADIM: Ziyaretçi Modu ve SEO Uyumluluğu (Public GET /api/store/products, Fiyat/Stok Maskeleme)
// 3. ADIM: Kimlik Doğrulama Rotalarının İzolasyonu (tenant-login vs customer-login)
// 4. ADIM: Çapraz Yetki İhlali (Privilege Escalation) Koruması (Customer -> /api/tenant/... = 403)
// 5. ADIM: Tenant Algılama (Subdomain / X-Tenant-Slug Resolution)
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const API_BASE = 'http://localhost:5000';

function request(method, pathUrl, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathUrl, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = { raw: data };
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${testName} -> ${details}`);
    failCount++;
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 STOREFRONT DECOUPLING & 5-STEP SECURITY VERIFICATION TEST');
  console.log('===============================================================\n');

  // --------------------------------------------------------------------------
  // 1. ADIM: Logout & Yönlendirme İzolasyonu Kod Analizi
  // --------------------------------------------------------------------------
  console.log('--- [1. ADIM: Çıkış (Logout) Yönlendirmesinin Ayrıştırılması] ---');
  const storeHtmlPath = fs.existsSync(path.join(__dirname, 'storefront-ui', 'store.html'))
    ? path.join(__dirname, 'storefront-ui', 'store.html')
    : path.join(__dirname, 'store.html');
  const storeHtmlContent = fs.readFileSync(storeHtmlPath, 'utf8');

  const apiJsPath = fs.existsSync(path.join(__dirname, 'storefront-ui', 'assets', 'js', 'api.js'))
    ? path.join(__dirname, 'storefront-ui', 'assets', 'js', 'api.js')
    : path.join(__dirname, 'assets', 'js', 'api.js');
  const apiJsContent = fs.readFileSync(apiJsPath, 'utf8');

  // store.html içindeki logout() fonksiyonunda login.html yönlendirmesi olmamalıdır
  const logoutStartIdx = storeHtmlContent.indexOf('function logout()');
  const logoutEndIdx = storeHtmlContent.indexOf('toggleNotificationDropdown', logoutStartIdx);
  const storeLogoutBody = (logoutStartIdx !== -1 && logoutEndIdx !== -1)
    ? storeHtmlContent.substring(logoutStartIdx, logoutEndIdx)
    : '';

  assert(
    !storeLogoutBody.includes("window.location.href = 'login.html'") &&
    !storeLogoutBody.includes('window.location.href = "login.html"'),
    '1.1 store.html logout() fonksiyonu genel SaaS login.html sayfasına yönlendirme İÇERMEZ'
  );

  assert(
    storeLogoutBody.includes('store.html'),
    '1.2 store.html logout() fonksiyonu sayfayı ziyaretçi statüsünde vitrinde tutar/tazeler (window.location.href = store.html...)'
  );

  assert(
    apiJsContent.includes('isStoreContext') && apiJsContent.includes('Ziyaretçi modunda kalınacak'),
    '1.3 assets/js/api.js apiFetch vitrin (store) 401/403 isteklerinde login.html yönlendirmesini engeller'
  );

  console.log('');

  // --------------------------------------------------------------------------
  // 2. ADIM: Ziyaretçi Modu ve SEO Uyumluluğu (Public Access)
  // --------------------------------------------------------------------------
  console.log('--- [2. ADIM: Ziyaretçi Modu ve SEO Uyumluluğu (Public Access)] ---');
  
  // A. Yetkisiz Ziyaretçi İstek Testi (No Bearer Token)
  const guestProductsRes = await request('GET', '/api/store/products?limit=10');
  
  assert(
    guestProductsRes.statusCode === 200,
    '2.1 GET /api/store/products ziyaretçilere (tokensiz) 200 OK döner (SEO Bot Açık)',
    `Status: ${guestProductsRes.statusCode}`
  );

  assert(
    guestProductsRes.data && guestProductsRes.data.isGuest === true,
    '2.2 GET /api/store/products yanıtında isGuest: true bayrağı bulunur'
  );

  assert(
    guestProductsRes.data && Array.isArray(guestProductsRes.data.data) && guestProductsRes.data.data.length > 0,
    '2.3 Ziyaretçi modunda ürün kataloğu boş dönmez (SEO botları katalog içeriğini okuyabilir)'
  );

  // B. Fiyat ve Stok Maskeleme Güvenlik Denetimi
  const firstGuestProduct = (guestProductsRes.data && guestProductsRes.data.data && guestProductsRes.data.data[0]) || {};
  
  assert(
    firstGuestProduct.stock === null,
    '2.4 Güvenlik Kuralı: Ziyaretçi modunda stok miktarı kesinlikle gizlenir (null)',
    `Mevcut: ${firstGuestProduct.stock}`
  );

  assert(
    firstGuestProduct.pricing === null && firstGuestProduct.discountedPrice === null && firstGuestProduct.defaultPrice === null,
    '2.5 Güvenlik Kuralı: Ziyaretçi modunda B2B fiyatları kesinlikle gizlenir (null)',
    `defaultPrice: ${firstGuestProduct.defaultPrice}, pricing: ${JSON.stringify(firstGuestProduct.pricing)}`
  );

  assert(
    firstGuestProduct.guestNotice === 'Fiyatları görmek için giriş yapın veya kayıt olun' || firstGuestProduct.isGuest === true,
    '2.6 Ziyaretçi uyarısı ("Fiyatları görmek için giriş yapın veya kayıt olun") döner'
  );

  // C. store.html içerisindeki buton ve tablo görselleştirmesi
  assert(
    storeHtmlContent.includes('Fiyatları görmek için giriş yapın veya kayıt olun'),
    '2.7 store.html vitrin arayüzünde ziyaretçiler için "Fiyatları görmek için giriş yapın veya kayıt olun" butonu/uyarısı mevcuttur'
  );

  console.log('');

  // --------------------------------------------------------------------------
  // 3. ADIM: Kimlik Doğrulama (Auth) Rotalarının İzolasyonu
  // --------------------------------------------------------------------------
  console.log('--- [3. ADIM: Kimlik Doğrulama Rotalarının İzolasyonu] ---');

  // A. POST /api/auth/tenant-login (Bayi Yöneticisi Girişi)
  const tenantAdminLoginRes = await request('POST', '/api/auth/tenant-login', {}, {
    email: 'ahmet@ahmetoto.com',
    password: '123456'
  });

  assert(
    tenantAdminLoginRes.statusCode === 200,
    '3.1 POST /api/auth/tenant-login: Bayi yöneticisi başarılı giriş yapar (200 OK)',
    `Status: ${tenantAdminLoginRes.statusCode}`
  );

  assert(
    tenantAdminLoginRes.data && tenantAdminLoginRes.data.role === 'TENANT_ADMIN',
    '3.2 POST /api/auth/tenant-login: Dönen rol TENANT_ADMIN dir'
  );

  // Müşterinin (CUSTOMER) tenant-login'e giriş denemesi (Engellenmeli!)
  const customerOnTenantLoginRes = await request('POST', '/api/auth/tenant-login', {}, {
    email: 'kemal@kemaloto.com',
    password: '123456'
  });

  assert(
    customerOnTenantLoginRes.statusCode === 403,
    '3.3 POST /api/auth/tenant-login: Müşteri (CUSTOMER) rolü 403 Forbidden ile engellenir',
    `Status: ${customerOnTenantLoginRes.statusCode}`
  );

  // B. POST /api/auth/customer-login (Müşteri/Usta Girişi)
  const customerLoginRes = await request('POST', '/api/auth/customer-login', {}, {
    email: 'kemal@kemaloto.com',
    password: '123456'
  });

  assert(
    customerLoginRes.statusCode === 200,
    '3.4 POST /api/auth/customer-login: Müşteri (Otoservis) başarılı giriş yapar (200 OK)',
    `Status: ${customerLoginRes.statusCode}`
  );

  const customerToken = customerLoginRes.data && (customerLoginRes.data.token || customerLoginRes.data.data.token);
  assert(
    !!customerToken,
    '3.5 POST /api/auth/customer-login: Müşteri JWT tokenı başarıyla üretilir'
  );

  // Bayi yöneticisinin (TENANT_ADMIN) customer-login'e giriş denemesi (Engellenmeli!)
  const tenantAdminOnCustomerLoginRes = await request('POST', '/api/auth/customer-login', {}, {
    email: 'ahmet@ahmetoto.com',
    password: '123456'
  });

  assert(
    tenantAdminOnCustomerLoginRes.statusCode === 403,
    '3.6 POST /api/auth/customer-login: Bayi Yöneticisi müşteri girişinden 403 Forbidden ile engellenir',
    `Status: ${tenantAdminOnCustomerLoginRes.statusCode}`
  );

  // C. Müşteri JWT Payload İncelemesi: role: 'CUSTOMER' ve tenantId zorunluluğu
  let decodedCustomerToken = null;
  try {
    decodedCustomerToken = jwt.decode(customerToken);
  } catch (e) {}

  assert(
    decodedCustomerToken && decodedCustomerToken.role === 'CUSTOMER',
    '3.7 Müşteri Token Payload Denetimi: role kesinlikle "CUSTOMER" olarak atanmıştır'
  );

  assert(
    decodedCustomerToken && !!decodedCustomerToken.tenantId,
    `3.8 Müşteri Token Payload Denetimi: kayıtlı bayi ID'si (tenantId) eksiksiz mevcuttur (${decodedCustomerToken ? decodedCustomerToken.tenantId : 'YOK'})`
  );

  console.log('');

  // --------------------------------------------------------------------------
  // 4. ADIM: Çapraz Yetki İhlali (Privilege Escalation) Koruması
  // --------------------------------------------------------------------------
  console.log('--- [4. ADIM: Çapraz Yetki İhlali (Privilege Escalation) Koruması] ---');

  // Müşteri token'ı ile Bayi Yönetim Rotalarına (/api/tenant/...) erişim denemesi
  const customerOnTenantCatalogRes = await request('GET', '/api/tenant/catalog', {
    'Authorization': `Bearer ${customerToken}`
  });

  assert(
    customerOnTenantCatalogRes.statusCode === 403,
    '4.1 Müşteri (CUSTOMER) tokenı ile GET /api/tenant/catalog erişimi anında 403 Forbidden ile engellenir',
    `Status: ${customerOnTenantCatalogRes.statusCode}`
  );

  const customerOnTenantOrdersRes = await request('GET', '/api/tenant/orders', {
    'Authorization': `Bearer ${customerToken}`
  });

  assert(
    customerOnTenantOrdersRes.statusCode === 403,
    '4.2 Müşteri (CUSTOMER) tokenı ile GET /api/tenant/orders erişimi anında 403 Forbidden ile engellenir',
    `Status: ${customerOnTenantOrdersRes.statusCode}`
  );

  console.log('');

  // --------------------------------------------------------------------------
  // 5. ADIM: Tenant Algılama (Subdomain / Slug Resolution)
  // --------------------------------------------------------------------------
  console.log('--- [5. ADIM: Tenant Algılama (Subdomain/Slug Resolution)] ---');

  // A. X-Tenant-Slug Başlığı ile GET /api/store/tenant-info
  const tenantInfoRes = await request('GET', '/api/store/tenant-info', {
    'X-Tenant-Slug': 'ahmetoto'
  });

  assert(
    tenantInfoRes.statusCode === 200 && tenantInfoRes.data && tenantInfoRes.data.data && tenantInfoRes.data.data.subdomain === 'ahmetoto',
    '5.1 GET /api/store/tenant-info: X-Tenant-Slug: ahmetoto başlığı ile bayi başarıyla çözümlenir (200 OK)',
    `Subdomain: ${tenantInfoRes.data && tenantInfoRes.data.data ? tenantInfoRes.data.data.subdomain : 'N/A'}`
  );

  // B. X-Tenant-Slug Başlığı ile GET /api/store/products
  const tenantProductsRes = await request('GET', '/api/store/products?limit=5', {
    'X-Tenant-Slug': 'ahmetoto'
  });

  assert(
    tenantProductsRes.statusCode === 200 && tenantProductsRes.data && tenantProductsRes.data.tenant && tenantProductsRes.data.tenant.subdomain === 'ahmetoto',
    '5.2 GET /api/store/products: X-Tenant-Slug başlığı backend tarafından algılanıp bayinin vitrini yüklenir',
    `Tenant: ${tenantProductsRes.data && tenantProductsRes.data.tenant ? tenantProductsRes.data.tenant.name : 'N/A'}`
  );

  // C. Query parametresi (?tenant=ahmetoto) ile çözümleme
  const queryTenantProductsRes = await request('GET', '/api/store/products?tenant=ahmetoto&limit=5');

  assert(
    queryTenantProductsRes.statusCode === 200 && queryTenantProductsRes.data && queryTenantProductsRes.data.tenant && queryTenantProductsRes.data.tenant.subdomain === 'ahmetoto',
    '5.3 GET /api/store/products: ?tenant=ahmetoto URL parametresi üzerinden bayi dinamik çözümlenir'
  );

  // D. Müşteri Oturumu ile B2B Fiyat Hesaplaması
  const authProductsRes = await request('GET', '/api/store/products?limit=5', {
    'Authorization': `Bearer ${customerToken}`,
    'X-Tenant-Slug': 'ahmetoto'
  });

  assert(
    authProductsRes.statusCode === 200 && authProductsRes.data && authProductsRes.data.isGuest === false,
    '5.4 Oturum açmış müşteri için GET /api/store/products isGuest: false döner',
    `isGuest: ${authProductsRes.data ? authProductsRes.data.isGuest : 'N/A'}`
  );

  const firstAuthProduct = (authProductsRes.data && authProductsRes.data.data && authProductsRes.data.data[0]) || {};
  assert(
    firstAuthProduct.stock !== null && firstAuthProduct.pricing !== null && typeof firstAuthProduct.discountedPrice === 'number',
    '5.5 Oturum açmış müşteriye B2B iskonto uygulanmış net fiyatlar (finalPrice) ve gerçek stoklar gösterilir'
  );

  console.log('\n===============================================================');
  console.log(`TEST SONUÇLARI: ${passCount} BAŞARILI, ${failCount} HATALI`);
  console.log('===============================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('[TEST_FATAL_ERROR]:', err);
  process.exit(1);
});
