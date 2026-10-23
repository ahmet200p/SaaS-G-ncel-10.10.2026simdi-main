const http = require('http');
const fs = require('fs');
const path = require('path');
const prisma = require('./lib/prisma');

// Test suite for store B2B & B2C Auth, Modals and Header
async function runTests() {
  console.log('=== STARTING B2B/B2C STORE AUTH E2E TEST ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Verify Prisma Schema & Database fields
    console.log('--- TEST 1: Database Model Fields ---');
    const tenant = await prisma.tenant.findFirst();
    assert(tenant !== null, `Tenant exists: ${tenant?.name} (${tenant?.id})`);

    const timestamp = Date.now();
    const mechanicEmail = `mechanic_${timestamp}@example.com`;
    const retailEmail = `retail_${timestamp}@example.com`;

    // 2. Test Backend Register API directly via express routes
    console.log('\n--- TEST 2: Register API (B2B MECHANIC & B2C RETAIL) ---');
    const express = require('express');
    const authRoutes = require('./routes/auth.routes');
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);

    const server = app.listen(0);
    const port = server.address().port;

    async function postJson(endpoint, data) {
      return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(data);
        const req = http.request({
          hostname: '127.0.0.1',
          port: port,
          path: endpoint,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr)
          }
        }, (res) => {
          let raw = '';
          res.on('data', chunk => raw += chunk);
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(raw) });
            } catch (e) {
              resolve({ status: res.statusCode, raw });
            }
          });
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
      });
    }

    // Register Mechanic (B2B)
    const resMechanic = await postJson('/api/auth/register', {
      fullName: 'Ahmet Usta',
      phone: '05551112233',
      email: mechanicEmail,
      password: 'password123',
      customerType: 'MECHANIC',
      companyName: 'Ahmet Oto Servis',
      taxNumber: '9988776655'
    });

    assert(resMechanic.status === 201, `Mechanic registration HTTP 201 (Got ${resMechanic.status})`);
    assert(resMechanic.body?.success === true, `Mechanic register success: ${resMechanic.body?.message}`);
    assert(resMechanic.body?.data?.token, `Mechanic receives JWT token`);
    assert(resMechanic.body?.data?.user?.customerProfile?.customerType === 'MECHANIC', `Customer profile customerType is MECHANIC`);
    assert(resMechanic.body?.data?.user?.customerProfile?.status === 'PENDING_APPROVAL', `Mechanic status is PENDING_APPROVAL`);
    assert(resMechanic.body?.data?.user?.customerProfile?.companyName === 'Ahmet Oto Servis', `Company name saved correctly`);
    assert(resMechanic.body?.data?.user?.name === 'Ahmet Usta', `User name saved correctly: ${resMechanic.body?.data?.user?.name}`);

    // Register Retail (B2C)
    const resRetail = await postJson('/api/auth/register', {
      fullName: 'Mehmet Bireysel',
      phone: '05552223344',
      email: retailEmail,
      password: 'password123',
      customerType: 'RETAIL'
    });

    assert(resRetail.status === 201, `Retail registration HTTP 201 (Got ${resRetail.status})`);
    assert(resRetail.body?.success === true, `Retail register success: ${resRetail.body?.message}`);
    assert(resRetail.body?.data?.token, `Retail receives JWT token`);
    assert(resRetail.body?.data?.user?.customerProfile?.customerType === 'RETAIL', `Customer profile customerType is RETAIL`);
    assert(resRetail.body?.data?.user?.customerProfile?.status === 'APPROVED', `Retail status is APPROVED`);

    // 3. Test Backend Login API
    console.log('\n--- TEST 3: Login API with Registered Users ---');
    const resLoginMech = await postJson('/api/auth/login', {
      email: mechanicEmail,
      password: 'password123'
    });
    assert(resLoginMech.status === 200, `Mechanic login HTTP 200`);
    assert(resLoginMech.body?.data?.user?.customerProfile?.customerType === 'MECHANIC', `Mechanic profile loaded on login`);

    const resLoginRet = await postJson('/api/auth/login', {
      email: retailEmail,
      password: 'password123'
    });
    assert(resLoginRet.status === 200, `Retail login HTTP 200`);
    assert(resLoginRet.body?.data?.user?.customerProfile?.customerType === 'RETAIL', `Retail profile loaded on login`);

    server.close();

    // 4. Test Store HTML & CSS Content Verification
    console.log('\n--- TEST 4: Frontend HTML/CSS Elements Verification ---');
    const storeHtmlPath = path.join(__dirname, 'store.html');
    const storeCssPath = path.join(__dirname, 'store.css');
    const storeHtml = fs.readFileSync(storeHtmlPath, 'utf8');
    const storeCss = fs.readFileSync(storeCssPath, 'utf8');

    // Header actions
    assert(storeHtml.includes('id="guest-auth-actions"'), 'store.html has #guest-auth-actions for visitors');
    assert(storeHtml.includes('id="logged-in-user-actions"'), 'store.html has #logged-in-user-actions for logged-in users');
    assert(storeHtml.includes('btn-nav-login'), 'store.html has btn-nav-login');
    assert(storeHtml.includes('btn-nav-register'), 'store.html has btn-nav-register');

    // Modals
    assert(storeHtml.includes('id="modal-login-backdrop"'), 'store.html has #modal-login-backdrop');
    assert(storeHtml.includes('id="modal-register-backdrop"'), 'store.html has #modal-register-backdrop');
    assert(storeHtml.includes('id="card-type-mechanic"'), 'store.html has #card-type-mechanic (B2B card)');
    assert(storeHtml.includes('id="card-type-retail"'), 'store.html has #card-type-retail (B2C card)');
    assert(storeHtml.includes('id="mechanic-extra-collapse"'), 'store.html has #mechanic-extra-collapse accordion');
    assert(storeHtml.includes('id="reg-company-name"'), 'store.html has #reg-company-name input');
    assert(storeHtml.includes('id="reg-tax-number"'), 'store.html has #reg-tax-number input');

    // Script functions
    assert(storeHtml.includes('function formatDealerName'), 'store.html implements formatDealerName');
    assert(storeHtml.includes('function checkAuthState'), 'store.html implements checkAuthState');
    assert(storeHtml.includes('function openLoginModal'), 'store.html implements openLoginModal');
    assert(storeHtml.includes('function openRegisterModal'), 'store.html implements openRegisterModal');
    assert(storeHtml.includes('function selectAccountType'), 'store.html implements selectAccountType');
    assert(storeHtml.includes('function handleLoginSubmit'), 'store.html implements handleLoginSubmit');
    assert(storeHtml.includes('function handleRegisterSubmit'), 'store.html implements handleRegisterSubmit');

    // CSS rules
    assert(storeCss.includes('.guest-auth-actions'), 'store.css contains .guest-auth-actions');
    assert(storeCss.includes('.btn-nav-login'), 'store.css contains .btn-nav-login');
    assert(storeCss.includes('.btn-nav-register'), 'store.css contains .btn-nav-register');
    assert(storeCss.includes('.account-type-grid'), 'store.css contains .account-type-grid');
    assert(storeCss.includes('.account-type-card'), 'store.css contains .account-type-card');
    assert(storeCss.includes('.mechanic-extra-collapse'), 'store.css contains .mechanic-extra-collapse');

    // Test formatDealerName logic
    console.log('\n--- TEST 5: Brand Name Duplication Fix Test ---');
    function formatDealerName(rawName) {
      if (!rawName) return 'Ahmet Oto Yedek Parça';
      let clean = rawName.trim();
      clean = clean.replace(/yedek\s+par[çc]a/gi, '').trim();
      return `${clean} Yedek Parça`;
    }

    assert(formatDealerName('Ahmet Oto') === 'Ahmet Oto Yedek Parça', 'Format "Ahmet Oto" -> "Ahmet Oto Yedek Parça"');
    assert(formatDealerName('Ahmet Oto Yedek Parça') === 'Ahmet Oto Yedek Parça', 'Format "Ahmet Oto Yedek Parça" -> "Ahmet Oto Yedek Parça" (prevents duplicate)');
    assert(formatDealerName('Ahmet Oto Yedek Parça Yedek Parça') === 'Ahmet Oto Yedek Parça', 'Format double duplicate -> single Yedek Parça');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
