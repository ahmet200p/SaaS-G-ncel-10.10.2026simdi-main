// ============================================================================
// Multi-Tenant B2B SaaS - Bayi Portalı Endpoint Testi
// test_prompt_tenant_portal_endpoints.js
// /api/orders, /api/products, /api/customers, /api/discounts, /api/returns
// ============================================================================

const http = require('http');
const jwt = require('jsonwebtoken');
const { startServer } = require('./dev_pg_server');
const app = require('./backend-api/app');
const prisma = require('./backend-api/lib/prisma');
const config = require('./backend-api/config');

let server;
let currentPort;

function makeRequest(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: currentPort,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, text: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 BAYİ PORTALI ENDPOINT & TENANT-ID DOĞRULAMA TESTİ');
  console.log('================================================================\n');

  try {
    await startServer();

    server = app.listen(0);
    currentPort = server.address().port;
    console.log(`Test Express server running on port: ${currentPort}`);

    // 1. Veritabanından aktif bir bayi ve bayi yöneticisi bul veya ilk bayiyi al
    const tenant = await prisma.tenant.findFirst({
      where: { isActive: true },
      include: { users: true }
    });

    if (!tenant) {
      throw new Error('Sistemde aktif bayi bulunamadı.');
    }

    console.log(`[TEST_INFO] Aktif Bayi: "${tenant.name}" (${tenant.id}, subdomain: ${tenant.subdomain})`);

    // Bayi kullanıcısı için token oluştur
    let tenantUser = tenant.users.find(u => u.role === 'TENANT_ADMIN') || tenant.users[0];
    const tenantToken = jwt.sign(
      {
        id: tenantUser ? tenantUser.id : 'test-dealer-user-id',
        email: tenantUser ? tenantUser.email : 'dealer@test.com',
        role: 'TENANT_ADMIN',
        tenantId: tenant.id
      },
      config.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Süper Admin için token oluştur (tenantId null)
    const superAdminToken = jwt.sign(
      {
        id: 'super-admin-test-id',
        email: 'superadmin@sistem.com',
        role: 'SUPER_ADMIN',
        tenantId: null
      },
      config.JWT_SECRET,
      { expiresIn: '2h' }
    );

    const endpointsToTest = [
      { name: 'Siparişler', direct: '/api/orders', tenantPrefix: '/api/tenant/orders' },
      { name: 'Ürünler', direct: '/api/products', tenantPrefix: '/api/tenant/products' },
      { name: 'Müşteriler', direct: '/api/customers', tenantPrefix: '/api/tenant/customers' },
      { name: 'İskontolar', direct: '/api/discounts', tenantPrefix: '/api/tenant/discounts' },
      { name: 'İadeler', direct: '/api/returns', tenantPrefix: '/api/tenant/returns' }
    ];

    console.log('\n--- 1. BÖLÜM: TENANT_ADMIN Oturumu ile GET İstekleri (Doğrudan Rotalar) ---');
    for (const ep of endpointsToTest) {
      const res = await makeRequest('GET', ep.direct, {
        Authorization: `Bearer ${tenantToken}`,
        'X-Tenant-ID': tenant.id,
        'X-Tenant-Slug': tenant.subdomain
      });

      if (res.status === 200 && res.data && res.data.success !== false) {
        console.log(`  ✅ [PASS] ${ep.direct} (${ep.name}) -> 200 OK (count/data döner)`);
      } else {
        console.error(`  ❌ [FAIL] ${ep.direct} (${ep.name}) -> Status: ${res.status}`, res.data || res.text);
        throw new Error(`${ep.direct} beklenen 200 yanıtını vermedi`);
      }
    }

    console.log('\n--- 2. BÖLÜM: TENANT_ADMIN Oturumu ile /api/tenant/... Rotaları ---');
    for (const ep of endpointsToTest) {
      const res = await makeRequest('GET', ep.tenantPrefix, {
        Authorization: `Bearer ${tenantToken}`
      });

      if (res.status === 200 && res.data && res.data.success !== false) {
        console.log(`  ✅ [PASS] ${ep.tenantPrefix} (${ep.name}) -> 200 OK`);
      } else {
        console.error(`  ❌ [FAIL] ${ep.tenantPrefix} (${ep.name}) -> Status: ${res.status}`, res.data || res.text);
        throw new Error(`${ep.tenantPrefix} beklenen 200 yanıtını vermedi`);
      }
    }

    console.log('\n--- 3. BÖLÜM: SUPER_ADMIN Oturumu (Fail-Safe Default Tenant Çözümlemesi) ---');
    // Süper admin token'ında tenantId null olsa bile 400 Bad Request vermemeli
    for (const ep of endpointsToTest) {
      const res = await makeRequest('GET', ep.tenantPrefix, {
        Authorization: `Bearer ${superAdminToken}`
      });

      if (res.status === 200) {
        console.log(`  ✅ [PASS] ${ep.tenantPrefix} (SuperAdmin token) -> 200 OK (Otomatik tenant fallback)`);
      } else {
        console.error(`  ❌ [FAIL] ${ep.tenantPrefix} -> Status: ${res.status}`, res.data || res.text);
        throw new Error(`${ep.tenantPrefix} SuperAdmin için 400 döndürdü`);
      }
    }

    console.log('\n--- 4. BÖLÜM: X-Tenant-ID Başlığı ile Doğrudan ID Enjeksiyonu ---');
    const resWithHeader = await makeRequest('GET', '/api/orders', {
      Authorization: `Bearer ${superAdminToken}`,
      'X-Tenant-ID': tenant.id
    });
    if (resWithHeader.status === 200) {
      console.log('  ✅ [PASS] X-Tenant-ID başlığı ile yapılan istek 200 OK döndürdü.');
    } else {
      throw new Error(`X-Tenant-ID başlığı ile yapılan istek başarısız oldu: ${resWithHeader.status}`);
    }

    console.log('\n================================================================');
    console.log('🎉 TÜM BAYİ PORTALI ENDPOINT VE TENANT ÇÖZÜMLEME TESTLERİ GEÇTİ!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ TEST BAŞARISIZ:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
    await prisma.$disconnect();
  }
}

runTests();
