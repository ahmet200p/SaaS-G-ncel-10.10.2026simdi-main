const app = require('./app');
const prisma = require('./lib/prisma');
const bcrypt = require('bcryptjs');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 POST /api/admin/tenants & LOGIN E2E ENTEGRASYON TESTİ');
  console.log('====================================================');

  let server;
  let baseUrl;
  let testsPassed = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      testsPassed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  try {
    // 0. Sunucuyu boşta olan bir porta başlat
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // 1. Süper Admin olarak giriş yap ve token al
    console.log('\n[ADIM 1] Süper Admin Kimlik Doğrulaması...');
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@sistem.com',
        password: '123456'
      })
    });
    const loginData = await loginRes.json();
    let token = loginData.token;

    assert(Boolean(token), 'Süper Admin JWT token başarıyla alındı.');

    // 2. Temizlik: Test subdomain veya email varsa temizle
    await prisma.user.deleteMany({
      where: { email: { in: ['marmara@bayi.com', 'marmara2@bayi.com'] } }
    });
    await prisma.tenant.deleteMany({
      where: { subdomain: { in: ['marmaraoto', 'marmaraoto2'] } }
    });

    // 3. POST /api/admin/tenants - prompt.md parametreleriyle yeni firma ve bayi yöneticisi oluştur
    console.log('\n[ADIM 2] POST /api/admin/tenants ile Yeni Firma & Yönetici Oluşturma...');
    const createRes = await fetch(`${baseUrl}/api/admin/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        firmName: 'Marmara Yedek Parça',
        subdomainPrefix: 'marmaraoto',
        adminEmail: 'marmara@bayi.com',
        adminPassword: 'BayiPassword2026!',
        themeColor: '#059669'
      })
    });
    const createData = await createRes.json();

    assert(createRes.status === 201, `Status 201 döner (Alınan: ${createRes.status})`);
    assert(createData.success === true, 'Response success: true döner');
    assert(createData.tenant && createData.tenant.name === 'Marmara Yedek Parça', 'Tenant adı doğru kaydedilmiş');
    assert(createData.tenant && createData.tenant.subdomain === 'marmaraoto', 'Subdomain doğru kaydedilmiş');
    assert(createData.user && createData.user.role === 'TENANT_ADMIN', 'Yönetici rolü TENANT_ADMIN');
    assert(createData.user && createData.user.email === 'marmara@bayi.com', 'Yönetici e-posta marmara@bayi.com');
    assert(createData.user && createData.user.tenantId === createData.tenant.id, 'User.tenantId ile Tenant.id eşleşti');

    // 4. Veritabanı ve Şifre Hash Kontrolü
    console.log('\n[ADIM 3] Veritabanı Kayıt & Bcrypt Şifreleme Kontrolü...');
    const dbUser = await prisma.user.findUnique({
      where: { email: 'marmara@bayi.com' }
    });
    assert(Boolean(dbUser), 'User tablosunda marmara@bayi.com bulundu');
    assert(dbUser.password !== 'BayiPassword2026!', 'Şifre düz metin (plain text) DEĞİL');
    const isPasswordHashValid = await bcrypt.compare('BayiPassword2026!', dbUser.password);
    assert(isPasswordHashValid, 'bcrypt.hash doğru çalıştı, bcrypt.compare ile doğrulandı');

    // 5. CRUCIAL TEST: Yeni oluşturulan bayi yöneticisi oturum açabiliyor mu?
    console.log('\n[ADIM 4] Yeni Bayi Yöneticisi Giriş Testi (POST /api/auth/login)...');
    const tenantLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'marmara@bayi.com',
        password: 'BayiPassword2026!'
      })
    });
    const tenantLoginData = await tenantLoginRes.json();

    assert(tenantLoginRes.status === 200, `Giriş başarılı, HTTP 200 döner (Alınan: ${tenantLoginRes.status})`);
    assert(Boolean(tenantLoginData.token), 'Bayi yöneticisine JWT token başarıyla üretildi');
    assert(tenantLoginData.role === 'TENANT_ADMIN', 'Giriş yapan rol TENANT_ADMIN');
    assert(tenantLoginData.user && tenantLoginData.user.tenant && tenantLoginData.user.tenant.subdomain === 'marmaraoto', 'Kullanıcının tenant bilgileri giriş yanıtında eksiksiz');

    // 6. Hata Senaryoları: Eksik parametre kontrolü
    console.log('\n[ADIM 5] Validasyon & Hata Durumları...');
    const missingParamRes = await fetch(`${baseUrl}/api/admin/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        firmName: 'Eksik Firma',
        adminEmail: 'eksik@test.com'
      })
    });
    assert(missingParamRes.status === 400, `Eksik parametrede 400 döner (Alınan: ${missingParamRes.status})`);

    // 7. Hata Senaryoları: Tekrarlanan subdomain kontrolü
    const duplicateSubdomainRes = await fetch(`${baseUrl}/api/admin/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        firmName: 'Başka Firma',
        subdomainPrefix: 'marmaraoto',
        adminEmail: 'baska@bayi.com',
        adminPassword: 'Password123!',
        themeColor: '#2563eb'
      })
    });
    assert(duplicateSubdomainRes.status === 409, `Tekrarlanan subdomainde 409 döner (Alınan: ${duplicateSubdomainRes.status})`);

    // 8. Hata Senaryoları: Tekrarlanan e-posta kontrolü
    const duplicateEmailRes = await fetch(`${baseUrl}/api/admin/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        firmName: 'Farklı Firma',
        subdomainPrefix: 'farklioto',
        adminEmail: 'marmara@bayi.com',
        adminPassword: 'Password123!',
        themeColor: '#2563eb'
      })
    });
    assert(duplicateEmailRes.status === 409, `Tekrarlanan e-postada 409 döner (Alınan: ${duplicateEmailRes.status})`);

    // 9. Temizlik
    await prisma.user.deleteMany({
      where: { email: 'marmara@bayi.com' }
    });
    await prisma.tenant.deleteMany({
      where: { subdomain: 'marmaraoto' }
    });

    console.log('\n====================================================');
    console.log(`📊 SONUÇ: ${testsPassed}/${totalTests} Test Başarıyla Geçti!`);
    console.log('====================================================');

  } catch (err) {
    console.error('Beklenmeyen test hatası:', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
    await prisma.$disconnect();
  }
}

runTests();
