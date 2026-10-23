// ============================================================================
// Multi-Tenant B2B SaaS - Mass Assignment Güvenlik Açığı & Yetki İzolasyon Testi
// (test_mass_assignment_security.js)
// prompt.md 3 Adımının Tamamını Uçtan Uca Doğrular:
// 1. ADIM: Herkese Açık /register Rotasının Kilitlenmesi (role Parametresi Yok Sayılır, CUSTOMER Sabit)
// 2. ADIM: Tamirci (MECHANIC) vs Bireysel (RETAIL) customerType İzolasyonu (Role her zaman CUSTOMER kalır)
// 3. ADIM: Yetkili Oluşturma Rotalarının (register-admin & /admin/admins) JWT + isSuperAdmin ile Korunması
// ============================================================================

const http = require('http');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const app = require('./app');
const prisma = require('./lib/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');

const TEST_PORT = 5055;
let server;

function makeRequest(url, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const bodyStr = data ? JSON.stringify(data) : null;

    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    if (bodyStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: reqHeaders
    };

    const req = http.request(options, (res) => {
      let chunks = '';
      res.on('data', chunk => chunks += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(chunks);
        } catch (e) {
          json = chunks;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🛡️ MASS ASSIGNMENT GÜVENLİK AÇIĞI VE YETKİ KONTROL TESTLERİ');
  console.log('================================================================');

  let passed = 0;
  let total = 0;

  function check(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Test başarısız: ${message}`);
    }
  }

  try {
    // 0. Test Sunucusunu Başlat
    await new Promise((resolve) => {
      server = app.listen(TEST_PORT, () => {
        console.log(`[TEST_SERVER] Test sunucusu port ${TEST_PORT} üzerinde dinliyor...`);
        resolve();
      });
    });

    const baseUrl = `http://localhost:${TEST_PORT}`;

    // Test için geçerli bir tenant hazırla
    let tenant = await prisma.tenant.findUnique({ where: { subdomain: 'ahmetoto' } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'Ahmet Oto Test',
          subdomain: 'ahmetoto',
          themeColor: '#f97316',
          isActive: true
        }
      });
    }

    // Süper Admin ve token hazırla
    let superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    if (!superAdmin) {
      const hash = await bcrypt.hash('123456', 10);
      superAdmin = await prisma.user.create({
        data: {
          email: 'admin_security_test@sistem.com',
          password: hash,
          role: 'SUPER_ADMIN'
        }
      });
    }
    const superAdminToken = jwt.sign(
      { id: superAdmin.id, email: superAdmin.email, role: 'SUPER_ADMIN', tenantId: null },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // ========================================================================
    // 1. ADIM: Herkese Açık Kayıt Rotasının (Public Register) Kilitlenmesi
    // ========================================================================
    console.log('\n--- 1. ADIM: Mass Assignment Saldırı Denemeleri (role Manipülasyonu) ---');

    // 1.A: Saldırgan dışarıdan role: 'SUPER_ADMIN' göndererek kayıt olmaya çalışır
    const attackerSuperEmail = `attacker_super_${Date.now()}@hacker.io`;
    const attackSuperRes = await makeRequest(`${baseUrl}/api/auth/register`, 'POST', {
      email: attackerSuperEmail,
      password: 'password123',
      fullName: 'Evil Super Admin',
      role: 'SUPER_ADMIN' // Saldırı yükü!
    });

    check(attackSuperRes.status === 201, 'POST /api/auth/register HTTP 201 döndü');
    check(attackSuperRes.data.success === true, 'Kayıt işlemi başarılı tamamlandı');
    
    // Response içerisindeki rol kontrolü
    const registeredSuperUser = attackSuperRes.data.user || attackSuperRes.data.data?.user;
    check(registeredSuperUser.role === 'CUSTOMER', `Gelen yanıtta kullanıcı rolü CUSTOMER olarak sabitlendi (Beklenen: CUSTOMER, Gelen: ${registeredSuperUser.role})`);

    // Veritabanındaki gerçek rol kontrolü
    const dbSuperUser = await prisma.user.findUnique({ where: { email: attackerSuperEmail } });
    check(dbSuperUser !== null, 'Saldırgan kullanıcısı veritabanına yazıldı');
    check(dbSuperUser.role === 'CUSTOMER', `Veritabanındaki gerçek rol CUSTOMER'dır; SUPER_ADMIN olamaz! (Rol: ${dbSuperUser.role})`);

    // 1.B: Saldırgan dışarıdan role: 'TENANT_ADMIN' göndererek kayıt olmaya çalışır
    const attackerTenantEmail = `attacker_tenant_${Date.now()}@hacker.io`;
    const attackTenantRes = await makeRequest(`${baseUrl}/api/auth/register`, 'POST', {
      email: attackerTenantEmail,
      password: 'password123',
      fullName: 'Evil Tenant Admin',
      role: 'TENANT_ADMIN', // Saldırı yükü!
      tenantId: tenant.id
    });

    check(attackTenantRes.status === 201, 'POST /api/auth/register HTTP 201 döndü');
    const registeredTenantUser = attackTenantRes.data.user || attackTenantRes.data.data?.user;
    check(registeredTenantUser.role === 'CUSTOMER', `Gelen yanıtta kullanıcı rolü CUSTOMER olarak sabitlendi (Beklenen: CUSTOMER, Gelen: ${registeredTenantUser.role})`);

    const dbTenantUser = await prisma.user.findUnique({ where: { email: attackerTenantEmail } });
    check(dbTenantUser.role === 'CUSTOMER', `Veritabanındaki gerçek rol CUSTOMER'dır; TENANT_ADMIN olamaz! (Rol: ${dbTenantUser.role})`);

    // ========================================================================
    // 2. ADIM: Tamirci (B2B) vs Bireysel (B2C) Ayrımının İzolasyonu
    // ========================================================================
    console.log('\n--- 2. ADIM: Tamirci (MECHANIC) vs Bireysel (RETAIL) customerType İzolasyonu ---');

    // 2.A: Tamirci (B2B MECHANIC) Kaydı
    const mechanicEmail = `mechanic_iso_${Date.now()}@tamirci.com`;
    const mechanicRes = await makeRequest(`${baseUrl}/api/auth/register`, 'POST', {
      email: mechanicEmail,
      password: 'password123',
      fullName: 'Yılmaz Usta',
      customerType: 'MECHANIC',
      companyName: 'Yılmaz Oto Servis',
      phone: '05441234567'
    });

    check(mechanicRes.status === 201, 'Tamirci kaydı HTTP 201 döndü');
    const mechUser = await prisma.user.findUnique({
      where: { email: mechanicEmail },
      include: { customerProfile: true }
    });
    check(mechUser.role === 'CUSTOMER', 'Tamirci kullanıcısının sistem rolü CUSTOMER');
    check(mechUser.customerProfile !== null, 'Tamirci için CustomerProfile oluşturuldu');
    check(mechUser.customerProfile.customerType === 'MECHANIC', 'customerProfile.customerType MECHANIC olarak kaydedildi');
    check(mechUser.customerProfile.status === 'PENDING_APPROVAL', 'Tamirci profili onay bekliyor (status: PENDING_APPROVAL)');

    // 2.B: Bireysel (B2C RETAIL) Kaydı
    const retailEmail = `retail_iso_${Date.now()}@bireysel.com`;
    const retailRes = await makeRequest(`${baseUrl}/api/auth/register`, 'POST', {
      email: retailEmail,
      password: 'password123',
      fullName: 'Ayşe Bireysel',
      customerType: 'RETAIL',
      phone: '05449876543'
    });

    check(retailRes.status === 201, 'Bireysel müşteri kaydı HTTP 201 döndü');
    const retUser = await prisma.user.findUnique({
      where: { email: retailEmail },
      include: { customerProfile: true }
    });
    check(retUser.role === 'CUSTOMER', 'Bireysel kullanıcının sistem rolü CUSTOMER');
    check(retUser.customerProfile !== null, 'Bireysel müşteri için CustomerProfile oluşturuldu');
    check(retUser.customerProfile.customerType === 'RETAIL', 'customerProfile.customerType RETAIL olarak kaydedildi');
    check(retUser.customerProfile.status === 'APPROVED', 'Bireysel müşteri profili anında onaylandı (status: APPROVED)');

    // ========================================================================
    // 3. ADIM: Yetkili Oluşturma Rotalarının (Admin Creation) Güvenliğe Alınması
    // ========================================================================
    console.log('\n--- 3. ADIM: Yetkili Oluşturma Uç Noktalarının Güvenlik Doğrulaması ---');

    // 3.A: Yetkisiz / Token'sız istek POST /api/auth/register-admin -> 401 DÖNMELİ
    const unauthAdminRes = await makeRequest(`${baseUrl}/api/auth/register-admin`, 'POST', {
      email: `unauth_admin_${Date.now()}@evil.com`,
      password: 'password123',
      role: 'SUPER_ADMIN'
    });
    check(unauthAdminRes.status === 401, `Token'sız POST /register-admin HTTP 401 Unauthorized döndü (Got ${unauthAdminRes.status})`);

    // 3.B: Normal müşteri (CUSTOMER) token'ı ile istek POST /api/auth/register-admin -> 403 DÖNMELİ
    const customerToken = attackSuperRes.data.token || attackSuperRes.data.data?.token;
    const custForbiddenRes = await makeRequest(`${baseUrl}/api/auth/register-admin`, 'POST', {
      email: `cust_trying_admin_${Date.now()}@evil.com`,
      password: 'password123',
      role: 'SUPER_ADMIN'
    }, { Authorization: `Bearer ${customerToken}` });
    check(custForbiddenRes.status === 403, `CUSTOMER token'ı ile POST /register-admin HTTP 403 Forbidden döndü (Got ${custForbiddenRes.status})`);

    // 3.C: Geçerli Süper Admin token'ı ile POST /api/auth/register-admin -> 201 BAŞARILI
    const legitimateTenantAdminEmail = `valid_tenant_admin_${Date.now()}@oto.com`;
    const validAdminRes = await makeRequest(`${baseUrl}/api/auth/register-admin`, 'POST', {
      email: legitimateTenantAdminEmail,
      password: 'password123',
      fullName: 'Resmi Bayi Yöneticisi',
      role: 'TENANT_ADMIN',
      tenantId: tenant.id
    }, { Authorization: `Bearer ${superAdminToken}` });

    check(validAdminRes.status === 201, `Süper Admin token'ı ile POST /register-admin HTTP 201 Created döndü (Got ${validAdminRes.status})`);
    check(validAdminRes.data.success === true, 'Yetkili kullanıcı oluşturma başarılı');
    const createdAdmin = await prisma.user.findUnique({ where: { email: legitimateTenantAdminEmail } });
    check(createdAdmin.role === 'TENANT_ADMIN', 'Oluşturulan kullanıcının rolü TENANT_ADMIN olarak kaydedildi');

    // 3.D: Süper Admin Rotaları (/api/admin/admins) da Token'sız Erişime Kapalı Olmalı
    const unauthAdminApiRes = await makeRequest(`${baseUrl}/api/admin/admins`, 'POST', {
      email: `unauth_api_admin_${Date.now()}@evil.com`,
      password: 'password123',
      role: 'SUPER_ADMIN'
    });
    check(unauthAdminApiRes.status === 401, `Token'sız POST /api/admin/admins HTTP 401 döndü (Got ${unauthAdminApiRes.status})`);

    console.log('\n================================================================');
    console.log(`🎉 MASS ASSIGNMENT VE YETKİ GÜVENLİK TESTLERİ TAMAMLANDI! (${passed}/${total})`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ Test yürütme sırasında hata:', err.message);
    process.exitCode = 1;
  } finally {
    if (server) {
      await new Promise(r => server.close(r));
      console.log('[TEST_SERVER] Test sunucusu kapatıldı.');
    }
  }
}

runTests();
