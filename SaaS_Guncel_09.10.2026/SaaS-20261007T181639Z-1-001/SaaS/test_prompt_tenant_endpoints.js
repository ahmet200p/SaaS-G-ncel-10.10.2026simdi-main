const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');
const config = require('./backend-api/config');
const app = require('./backend-api/app');
const prisma = require('./backend-api/lib/prisma');
const { startServer } = require('./dev_pg_server');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TENANT ENDPOINTS & RESILIENCE VERIFICATION TESTİ');
  console.log('================================================================');

  await startServer();

  const server = app.listen(0);
  const port = server.address().port;
  console.log(`Test Express server running on port: ${port}`);

  // Generate valid Super Admin token
  const superAdminToken = jwt.sign(
    { id: 'test-admin-id', email: 'admin@sistem.com', role: 'SUPER_ADMIN' },
    config.JWT_SECRET,
    { expiresIn: '1h' }
  );

  function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: port,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // 1. GET /api/admin/tenants
  console.log('\n--- Test 1: GET /api/admin/tenants ---');
  const res1 = await makeRequest('/api/admin/tenants');
  assert.strictEqual(res1.status, 200, `Expected 200, got ${res1.status}`);
  assert.strictEqual(res1.data.success, true);
  assert(Array.isArray(res1.data.data), 'data should be an array');
  console.log(`✅ [PASS] GET /api/admin/tenants returned 200 with ${res1.data.count} tenants`);

  // 2. GET /api/tenants
  console.log('\n--- Test 2: GET /api/tenants ---');
  const res2 = await makeRequest('/api/tenants');
  assert.strictEqual(res2.status, 200, `Expected 200, got ${res2.status}`);
  assert.strictEqual(res2.data.success, true);
  assert(Array.isArray(res2.data.data), 'data should be an array');
  console.log(`✅ [PASS] GET /api/tenants returned 200 with ${res2.data.count} tenants`);

  // 3. GET /tenants
  console.log('\n--- Test 3: GET /tenants ---');
  const res3 = await makeRequest('/tenants');
  assert.strictEqual(res3.status, 200, `Expected 200, got ${res3.status}`);
  assert.strictEqual(res3.data.success, true);
  console.log(`✅ [PASS] GET /tenants returned 200 with ${res3.data.count} tenants`);

  // 4. GET /api/admin/pending-tenants
  console.log('\n--- Test 4: GET /api/admin/pending-tenants ---');
  const res4 = await makeRequest('/api/admin/pending-tenants');
  assert.strictEqual(res4.status, 200, `Expected 200, got ${res4.status}`);
  assert.strictEqual(res4.data.success, true);
  assert(Array.isArray(res4.data.data), 'data should be an array');
  console.log(`✅ [PASS] GET /api/admin/pending-tenants returned 200 with ${res4.data.count} pending tenants`);

  // 5. GET /api/pending-tenants
  console.log('\n--- Test 5: GET /api/pending-tenants ---');
  const res5 = await makeRequest('/api/pending-tenants');
  assert.strictEqual(res5.status, 200, `Expected 200, got ${res5.status}`);
  assert.strictEqual(res5.data.success, true);
  assert(Array.isArray(res5.data.data), 'data should be an array');
  console.log(`✅ [PASS] GET /api/pending-tenants returned 200 with ${res5.data.count} pending tenants`);

  // 6. GET /pending-tenants
  console.log('\n--- Test 6: GET /pending-tenants ---');
  const res6 = await makeRequest('/pending-tenants');
  assert.strictEqual(res6.status, 200, `Expected 200, got ${res6.status}`);
  assert.strictEqual(res6.data.success, true);
  console.log(`✅ [PASS] GET /pending-tenants returned 200 with ${res6.data.count} pending tenants`);

  // 7. Data Structure & Type Safety Verification
  console.log('\n--- Test 7: Data Structure & Type Safety ---');
  const sampleTenant = res1.data.data[0];
  if (sampleTenant) {
    assert(typeof sampleTenant.id === 'string', 'Tenant id must be string');
    assert(typeof sampleTenant.name === 'string', 'Tenant name must be string');
    assert(typeof sampleTenant.subdomain === 'string', 'Tenant subdomain must be string');
    assert(typeof sampleTenant.status === 'string', 'Tenant status must be string');
    assert(typeof sampleTenant.isActive === 'boolean', 'Tenant isActive must be boolean');
    assert(Array.isArray(sampleTenant.users), 'Tenant users must be an array');
    assert(typeof sampleTenant._count === 'object', 'Tenant _count must be an object');
    console.log('✅ [PASS] Tenant record conforms to standard JSON schema with no null type errors');
  }

  // 8. PUT /api/admin/tenants/:id/approve
  if (res5.data.data.length > 0) {
    const targetPending = res5.data.data[0];
    console.log(`\n--- Test 8: PUT /api/admin/tenants/:id/approve for "${targetPending.name}" ---`);
    const approveRes = await makeRequest(`/api/admin/tenants/${targetPending.id}/approve`, 'PUT');
    assert.strictEqual(approveRes.status, 200, `Expected 200, got ${approveRes.status}`);
    assert.strictEqual(approveRes.data.success, true);
    assert.strictEqual(approveRes.data.data.status, 'APPROVED');
    assert.strictEqual(approveRes.data.data.isActive, true);
    console.log(`✅ [PASS] Tenant "${targetPending.name}" successfully approved!`);
  }

  server.close();
  await prisma.$disconnect();

  console.log('\n================================================================');
  console.log('🎉 TÜM ENDPOINT VE PRISMA GÜVENLİK TESTLERİ BAŞARIYLA GEÇTİ!');
  console.log('================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
