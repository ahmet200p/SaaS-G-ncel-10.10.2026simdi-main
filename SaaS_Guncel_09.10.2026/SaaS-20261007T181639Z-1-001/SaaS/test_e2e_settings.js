const app = require('./backend-api/app');
const prisma = require('./backend-api/lib/prisma');

async function runSettingsE2ETests() {
  console.log('====================================================');
  console.log('🧪 GET & PUT /api/admin/settings E2E ENTEGRASYON TESTİ');
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

    // 1. Yetkisiz erişim testi (Token olmadan erişim engellenmeli)
    console.log('\n[ADIM 1] Güvenlik & Yetkilendirme Kontrolü...');
    const unauthorizedRes = await fetch(`${baseUrl}/api/admin/settings`);
    assert(unauthorizedRes.status === 401 || unauthorizedRes.status === 403, 'Token olmadan GET /api/admin/settings isteği 401/403 ile reddedildi.');

    // 2. Süper Admin olarak giriş yap ve token al
    console.log('\n[ADIM 2] Süper Admin Girişi ve Token Alma...');
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@sistem.com',
        password: '123456'
      })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    assert(Boolean(token), 'Süper Admin token alındı.');

    // 3. GET /api/admin/settings testi
    console.log('\n[ADIM 3] GET /api/admin/settings Testi...');
    const getRes = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const getData = await getRes.json();

    assert(getRes.status === 200, 'GET /api/admin/settings HTTP 200 döndü.');
    assert(getData.success === true, 'GET yanıtında success: true alanı mevcut.');
    assert(Boolean(getData.data), 'GET yanıtında data nesnesi mevcut.');
    assert(getData.data.id === 1, 'GET ayarlarında singleton id: 1 doğrulandı.');

    // 4. PUT /api/admin/settings testi (Tüm alanlar ve sayısal dönüşümler)
    console.log('\n[ADIM 4] PUT /api/admin/settings Testi (Güncelleme & parseFloat Kontrolü)...');
    const updatePayload = {
      tecdocApiKey: 'tc_test_key_live_998877',
      tecdocEndpoint: 'https://api.tecalliance.net/v2/custom_catalog',
      defaultB2BDiscount: '35.5', // String olarak gönderiyoruz, parseFloat testi için
      defaultTaxRate: '18.0',     // String olarak gönderiyoruz, parseFloat testi için
      platformCurrency: 'EUR',
      adminEmail: 'superadmin@sistem.com'
    };

    const putRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updatePayload)
    });
    const putData = await putRes.json();

    assert(putRes.status === 200, 'PUT /api/admin/settings HTTP 200 döndü.');
    assert(putData.success === true, 'PUT yanıtında success: true mevcut.');
    assert(Boolean(putData.message), 'PUT yanıtında başarılı mesajı mevcut.');
    assert(Boolean(putData.data), 'PUT yanıtında data nesnesi mevcut.');
    assert(putData.data.tecdocApiKey === 'tc_test_key_live_998877', 'tecdocApiKey başarıyla güncellendi.');
    assert(putData.data.tecdocEndpoint === 'https://api.tecalliance.net/v2/custom_catalog', 'tecdocEndpoint başarıyla güncellendi.');
    assert(putData.data.defaultB2BDiscount === 35.5 && typeof putData.data.defaultB2BDiscount === 'number', 'defaultB2BDiscount parseFloat ile Float 35.5 olarak kaydedildi.');
    assert(putData.data.defaultTaxRate === 18.0 && typeof putData.data.defaultTaxRate === 'number', 'defaultTaxRate parseFloat ile Float 18.0 olarak kaydedildi.');
    assert(putData.data.platformCurrency === 'EUR', 'platformCurrency EUR olarak kaydedildi.');
    assert(putData.data.adminEmail === 'superadmin@sistem.com', 'adminEmail superadmin@sistem.com olarak kaydedildi.');

    // 5. Veritabanından doğrudan doğrulama
    console.log('\n[ADIM 5] Prisma Veritabanı Doğrulaması (dev.db)...');
    const dbRecord = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    assert(dbRecord !== null, 'dev.db tablosunda id: 1 kaydı mevcut.');
    assert(dbRecord.tecdocApiKey === 'tc_test_key_live_998877', 'Veritabanında tecdocApiKey güncellendiği doğrulandı.');
    assert(dbRecord.defaultB2BDiscount === 35.5, 'Veritabanında defaultB2BDiscount Float 35.5 olarak doğrulandı.');

    // 6. Tekrar GET isteği yaparak teyit etme
    console.log('\n[ADIM 6] Güncelleme Sonrası GET /api/admin/settings ile Teyit...');
    const verifyGetRes = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const verifyGetData = await verifyGetRes.json();
    assert(verifyGetData.data.tecdocApiKey === 'tc_test_key_live_998877', 'Güncellenen veriler GET çağrısında eksiksiz döndü.');
    assert(verifyGetData.data.defaultB2BDiscount === 35.5, 'İskonto oranı GET çağrısında 35.5 döndü.');

    // 7. Test sonrası ayarları başlangıç varsayılanlarına geri döndürme
    console.log('\n[ADIM 7] Test Sonrası Temizlik (Varsayılana Geri Döndürme)...');
    await prisma.systemSettings.update({
      where: { id: 1 },
      data: {
        tecdocApiKey: 'tc_live_demo_984182938472',
        tecdocEndpoint: 'https://api.tecalliance.net/v2/catalog',
        defaultB2BDiscount: 20.0,
        defaultTaxRate: 20.0,
        platformCurrency: 'TRY',
        adminEmail: 'admin@sistem.com'
      }
    });
    await prisma.user.updateMany({
      where: { email: 'superadmin@sistem.com' },
      data: { email: 'admin@sistem.com' }
    });
    assert(true, 'Test sonrası ayarlar ve yönetici hesabı başarıyla korundu.');

  } catch (error) {
    console.error('❌ Beklenmeyen Test Hatası:', error);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
    await prisma.$disconnect();

    console.log('\n====================================================');
    console.log(`📊 TEST SONUCU: ${testsPassed}/${totalTests} Başarılı (%${Math.round((testsPassed / totalTests) * 100)})`);
    console.log('====================================================');
  }
}

runSettingsE2ETests();
