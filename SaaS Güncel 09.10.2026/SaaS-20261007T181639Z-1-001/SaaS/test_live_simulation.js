const http = require('http');
const app = require('./app');

let server;
let port = 5000;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(5000, () => {
      port = 5000;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

async function simulateFrontendUser() {
  await startServer();
  console.log('=== CANLI ORTAM KULLANICI SİMÜLASYONU (FRONTEND & BACKEND) ===');

  
  // 1. admin.html sayfasının sunucudan çekilmesi
  const pageRes = await fetch('http://localhost:5000/admin.html');
  const html = await pageRes.text();
  console.log('1. admin.html HTTP status:', pageRes.status);
  console.log('   - btn-save-settings mevcut:', html.includes('id="btn-save-settings"'));
  console.log('   - setting-tax-rate mevcut:', html.includes('id="setting-tax-rate"'));
  console.log('   - loadSettings() tanımlı:', html.includes('function loadSettings()'));

  // 2. Süper Admin oturumu açma
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@sistem.com', password: '123456' })
  });
  const loginData = await loginRes.json();
  console.log('2. Süper Admin Girişi:', loginData.success, '| Rol:', loginData.role);
  const token = loginData.token;

  // 3. loadSettings() fonksiyonunun API çağrısı
  const getRes = await fetch('http://localhost:5000/api/admin/settings', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const getData = await getRes.json();
  console.log('3. loadSettings() verileri çekildi:', getData.data);

  // 4. Formu doldurup 'Ayarları Kaydet' (#btn-save-settings) butonuna basma
  const saveRes = await fetch('http://localhost:5000/api/admin/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      tecdocApiKey: 'tc_live_user_test_2026',
      tecdocEndpoint: 'https://api.tecalliance.net/v2/catalog',
      defaultB2BDiscount: 30.0,
      defaultTaxRate: 20.0,
      platformCurrency: 'TRY',
      adminEmail: 'admin@sistem.com'
    })
  });
  const saveData = await saveRes.json();
  console.log('4. Kaydetme yanıtı:', saveData.message, '| Güncel İskonto:', saveData.data.defaultB2BDiscount);

  // 5. Sayfa yenilendiğinde loadSettings() ile verilerin kaybolmadığının teyidi
  const reloadRes = await fetch('http://localhost:5000/api/admin/settings', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const reloadData = await reloadRes.json();
  console.log('5. Sayfa yenileme sonrası loadSettings():', reloadData.data);
  const isPersisted = reloadData.data.tecdocApiKey === 'tc_live_user_test_2026' && reloadData.data.defaultB2BDiscount === 30.0;
  console.log('   - Veri kalıcılığı korundu mu?:', isPersisted ? 'EVET (BAŞARILI)' : 'HAYIR');

  // 6. Test sonrası varsayılan ayarlara geri döndürme
  await fetch('http://localhost:5000/api/admin/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      tecdocApiKey: 'tc_live_demo_984182938472',
      tecdocEndpoint: 'https://api.tecalliance.net/v2/catalog',
      defaultB2BDiscount: 20.0,
      defaultTaxRate: 20.0,
      platformCurrency: 'TRY',
      adminEmail: 'admin@sistem.com'
    })
  });
  console.log('6. Temizlik tamamlandı, varsayılanlar geri yüklendi.');
  await stopServer();
}

simulateFrontendUser().catch(err => {
  console.error(err);
  if (server) server.close();
  process.exit(1);
});

