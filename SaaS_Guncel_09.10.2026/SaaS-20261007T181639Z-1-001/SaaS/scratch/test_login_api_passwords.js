const { startServer } = require('../backend-api/dev_pg_server');
const app = require('../backend-api/app');
const http = require('http');
const assert = require('assert');

async function testApi() {
  await startServer();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log('=== AUTH LOGIN API DOĞRULAMA TESTİ ===\n');

  async function postLogin(email, password) {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  // 1. Süper Admin Başarılı Giriş
  const adminRes = await postLogin('admin@sistem.com', 'Kim_!Lik9304.');
  assert.strictEqual(adminRes.status, 200, 'Süper Admin yeni şifreyle 200 OK dönmeli');
  assert(adminRes.data.success, 'Başarılı bayrağı true olmalı');
  assert(adminRes.data.token || (adminRes.data.data && adminRes.data.data.token), 'JWT Token dönmeli');
  console.log('✅ 1. Süper Admin (admin@sistem.com / Kim_!Lik9304.) Giriş: 200 OK');

  // 2. Süper Admin Hatalı Şifre
  const adminBadRes = await postLogin('admin@sistem.com', 'YanlisSifre123');
  assert.strictEqual(adminBadRes.status, 401, 'Hatalı şifre 401 Unauthorized dönmeli');
  console.log('✅ 2. Süper Admin Hatalı Şifre Koruması: 401 Unauthorized');

  // 3. Bayi Yöneticisi Başarılı Giriş
  const dealerRes = await postLogin('ahmet@ahmetoto.com', 'Denemehesabı..12');
  assert.strictEqual(dealerRes.status, 200, 'Bayi Yöneticisi yeni şifreyle 200 OK dönmeli');
  assert(dealerRes.data.success, 'Başarılı bayrağı true olmalı');
  console.log('✅ 3. Bayi Yöneticisi (ahmet@ahmetoto.com / Denemehesabı..12) Giriş: 200 OK');

  // 4. Bayi Yöneticisi Eski/Hatalı Şifre
  const dealerBadRes = await postLogin('ahmet@ahmetoto.com', '123456');
  assert.strictEqual(dealerBadRes.status, 401, 'Eski test şifresi (123456) 401 Unauthorized dönmeli');
  console.log('✅ 4. Bayi Yöneticisi Eski Şifre Koruması: 401 Unauthorized');

  server.close();
  console.log('\n🎉 TÜM API GİRİŞ TESTLERİ BAŞARIYLA GEÇTİ (4/4 PASS)!');
}

testApi()
  .catch((err) => {
    console.error('❌ API Test hatası:', err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
