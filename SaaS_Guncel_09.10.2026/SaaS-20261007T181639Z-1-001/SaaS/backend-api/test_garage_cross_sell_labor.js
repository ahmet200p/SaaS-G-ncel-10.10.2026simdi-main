// ============================================================================
// B2B AFS Systems - Sadakat Modülleri (Akıllı Garaj, Çapraz Satış, İşçilik) Test Paketi
// ============================================================================

const http = require('http');
const { Socket } = require('net');
const jwt = require('jsonwebtoken');
const config = require('./config');
const app = require('./app');
const {
  estimateLaborTime,
  getRecommendedTogether,
  executeDeepCrossReferenceSearch
} = require('./services/partsCatalogService');

/**
 * Express uygulamasını tamamen bellek içinde (in-memory) doğrudan çalıştıran HTTP dispatcher.
 */
function callApp(method, url, headers = {}, body = null) {
  return new Promise((resolve) => {
    const socket = new Socket();
    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = url;
    const reqHeaders = Object.assign({ host: 'localhost' }, headers);
    if (body) {
      const payload = Buffer.from(JSON.stringify(body));
      reqHeaders['content-type'] = 'application/json';
      reqHeaders['content-length'] = String(payload.length);
      req.push(payload);
      req.push(null);
      req.body = body;
    } else {
      req.push(null);
    }
    req.headers = reqHeaders;

    const res = new http.ServerResponse(req);
    let chunks = [];
    res.write = (chunk) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      return true;
    };
    res.end = (chunk) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString('utf8');
      let data = text;
      try {
        data = JSON.parse(text);
      } catch (e) {}
      resolve({ status: res.statusCode, headers: res.getHeaders(), body: data });
    };

    app(req, res);
  });
}

async function runTests() {
  console.log('========================================================');
  console.log('🧪 OTO SERVİS & USTA SADAKAT MODÜLLERİ TESTİ BAŞLATILIYOR');
  console.log('========================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, description) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] Test ${totalTests}: ${description}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] Test ${totalTests}: ${description}`);
      process.exitCode = 1;
    }
  }

  // --------------------------------------------------------------------------
  // TEST GRUBU 1: İŞÇİLİK SÜRESİ (Labor Time Engine)
  // --------------------------------------------------------------------------
  console.log('\n--- 1. İŞÇİLİK VE BAKIM SÜRESİ TESTLERİ ---');

  const trigerLabor = estimateLaborTime('Triger Kayışı', 'Motor Mekanik');
  assert(trigerLabor === '3 Saat', `Triger Kayışı işçilik süresi "3 Saat" olmalı (Alınan: "${trigerLabor}")`);

  const balataLabor = estimateLaborTime('Ön Fren Balatası', 'Fren Sistemi');
  assert(balataLabor === '45 Dk', `Fren Balatası işçilik süresi "45 Dk" olmalı (Alınan: "${balataLabor}")`);

  const filtreLabor = estimateLaborTime('Yağ Filtresi', 'Filtre Grubu');
  assert(filtreLabor === '30 Dk', `Yağ Filtresi işçilik süresi "30 Dk" olmalı (Alınan: "${filtreLabor}")`);

  const amortisorLabor = estimateLaborTime('Ön Amortisör', 'Yürüyen Aksam');
  assert(amortisorLabor === '1.5 Saat', `Amortisör işçilik süresi "1.5 Saat" olmalı (Alınan: "${amortisorLabor}")`);

  const debriyajLabor = estimateLaborTime('Baskı Balata Debriyaj Seti', 'Şanzıman');
  assert(debriyajLabor === '4 Saat', `Debriyaj işçilik süresi "4 Saat" olmalı (Alınan: "${debriyajLabor}")`);

  const customSpecs = { estimatedLaborTime: '2 Saat 15 Dk' };
  const preservedLabor = estimateLaborTime('Fren Balatası', 'Fren', '', customSpecs);
  assert(preservedLabor === '2 Saat 15 Dk', `API'den hazır gelen süre doğrudan korunmalı (Alınan: "${preservedLabor}")`);

  // --------------------------------------------------------------------------
  // TEST GRUBU 2: BAKIM KİTLERİ VE ÇAPRAZ SATIŞ (Cross-Sell Engine)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. ÇAPRAZ SATIŞ VE BAKIM KİTLERİ (recommendedTogether) TESTLERİ ---');

  const trigerRecommendations = getRecommendedTogether('Triger Seti', 'Motor', 'triger');
  assert(Array.isArray(trigerRecommendations) && trigerRecommendations.length >= 2, 'Triger araması en az 2 tamamlayıcı parça dönmeli');

  const hasWaterPump = trigerRecommendations.some(r => r.name.includes('Devirdaim') || r.name.includes('Su Pompası'));
  assert(hasWaterPump, 'Triger seti aratıldığında Devirdaim Su Pompası önerilmeli');

  const hasTensioner = trigerRecommendations.some(r => r.name.includes('Gergi') || r.name.includes('Rulman') || r.name.includes('Bilya'));
  assert(hasTensioner, 'Triger seti aratıldığında Gergi Rulmanı önerilmeli');

  const balataRecommendations = getRecommendedTogether('Fren Balatası', 'Fren', 'balata');
  const hasDisc = balataRecommendations.some(r => r.name.includes('Disk'));
  assert(hasDisc, 'Fren balatası aratıldığında Fren Diski önerilmeli');

  const filtreRecommendations = getRecommendedTogether('Yağ Filtresi', 'Filtre Grubu', 'yağ filtresi');
  const hasMotorOil = filtreRecommendations.some(r => r.name.includes('Motor Yağı'));
  assert(hasMotorOil, 'Yağ filtresi aratıldığında Motor Yağı önerilmeli');

  // --------------------------------------------------------------------------
  // TEST GRUBU 3: KATALOG ARAMA API ENTEGRASYONU (Search Controller)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. KATALOG ARAMA API ÇIKTI TESTLERİ (/api/catalog/search) ---');

  const searchRes = await callApp('GET', '/api/catalog/search?q=triger');

  assert(searchRes.status === 200, `GET /api/catalog/search?q=triger HTTP 200 dönmeli (Status: ${searchRes.status})`);
  assert(searchRes.body.success === true, 'Arama yanıtı success: true olmalı');
  assert(Array.isArray(searchRes.body.recommendedTogether), 'Arama yanıtında recommendedTogether dizisi olmalı');
  assert(searchRes.body.recommendedTogether.length > 0, 'recommendedTogether dizisi dolu olmalı');
  assert(
    searchRes.body.technicalSpecs && typeof searchRes.body.technicalSpecs.estimatedLaborTime === 'string',
    `Arama yanıtında technicalSpecs.estimatedLaborTime bulunmalı (Değer: "${searchRes.body.technicalSpecs?.estimatedLaborTime}")`
  );

  // --------------------------------------------------------------------------
  // TEST GRUBU 4: AKILLI GARAJ API TESTLERİ (CRUD - /api/garage)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. AKILLI GARAJ CRUD ENDPOINT TESTLERİ ---');

  // Test kullanıcısı için JWT Token üret
  const testUserId = 'test-mechanic-uuid-99';
  const testTenantId = 'test-tenant-uuid-11';
  const authToken = jwt.sign(
    {
      id: testUserId,
      email: 'usta@otoservis.com',
      role: 'CUSTOMER',
      tenantId: testTenantId
    },
    config.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // A. POST /api/garage - Yetkisiz erişim testi (401)
  const unauthRes = await callApp('POST', '/api/garage', {}, { vin: 'VF1LB17C536060366' });
  assert(unauthRes.status === 401, `Yetkisiz istek 401 Unauthorized dönmeli (Alınan: ${unauthRes.status})`);

  // B. POST /api/garage - Geçersiz VIN (400)
  const badVinRes = await callApp(
    'POST',
    '/api/garage',
    { Authorization: `Bearer ${authToken}` },
    { vin: '' }
  );
  assert(badVinRes.status === 400, `Boş VIN gönderildiğinde 400 Bad Request dönmeli (Alınan: ${badVinRes.status})`);

  // C. POST /api/garage - Başarılı Araç Kaydı (201)
  const createVehicleRes = await callApp(
    'POST',
    '/api/garage',
    { Authorization: `Bearer ${authToken}` },
    {
      vin: 'VF1LB17C536060366',
      plate: '34 USTA 1923',
      customerName: 'Kemal Usta / Ahmet Müşteri',
      lastServiceDate: '2026-10-31T12:00:00.000Z',
      vehicleBrand: 'Renault',
      model: 'Clio II Symbol',
      notes: 'Triger ve periyodik yağ bakımı yapıldı.'
    }
  );

  assert(
    createVehicleRes.status === 201,
    `POST /api/garage 201 Created dönmeli (Status: ${createVehicleRes.status}, Body: ${JSON.stringify(createVehicleRes.body)})`
  );
  assert(createVehicleRes.body.success === true, 'Araç kaydı success: true dönmeli');
  assert(
    createVehicleRes.body.data && createVehicleRes.body.data.vin === 'VF1LB17C536060366',
    'Kaydedilen aracın VIN numarası doğru dönmeli'
  );

  // D. GET /api/garage - Ustanın Araçlarını Listeleme (200)
  const listVehiclesRes = await callApp(
    'GET',
    '/api/garage',
    { Authorization: `Bearer ${authToken}` }
  );

  assert(listVehiclesRes.status === 200, `GET /api/garage 200 OK dönmeli (Status: ${listVehiclesRes.status})`);
  assert(listVehiclesRes.body.success === true, 'Garaj listeleme success: true olmalı');
  assert(Array.isArray(listVehiclesRes.body.data), 'Garaj listesi dizi olarak dönmeli');
  const foundSavedVehicle = listVehiclesRes.body.data.some(v => v.vin === 'VF1LB17C536060366');
  assert(foundSavedVehicle, 'Kaydedilen araç garaj listesinde bulunmalı');

  // E. GET /api/garage/history/:vin - Şasiye Ait Sipariş Geçmişi
  const historyRes = await callApp(
    'GET',
    '/api/garage/history/VF1LB17C536060366',
    { Authorization: `Bearer ${authToken}` }
  );

  assert(historyRes.status === 200, `GET /api/garage/history/:vin 200 OK dönmeli (Status: ${historyRes.status})`);
  assert(historyRes.body.success === true, 'Şasi geçmişi success: true olmalı');
  assert(historyRes.body.vin === 'VF1LB17C536060366', 'Şasi geçmişi sorgulanan VIN ile eşleşmeli');
  assert(Array.isArray(historyRes.body.parts), 'Geçmiş parça listesi dizi olarak dönmeli');

  // F. DELETE /api/garage/:id - Araç Silme
  const vehicleIdToDelete = createVehicleRes.body.data?.id;
  if (vehicleIdToDelete) {
    const deleteRes = await callApp(
      'DELETE',
      `/api/garage/${vehicleIdToDelete}`,
      { Authorization: `Bearer ${authToken}` }
    );
    assert(deleteRes.status === 200, `DELETE /api/garage/:id 200 OK dönmeli (Status: ${deleteRes.status})`);
  }

  console.log('\n========================================================');
  console.log(`📊 TEST SONUÇLARI: ${passedTests} / ${totalTests} Başarılı`);
  console.log('========================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 TÜM TESTLER BAŞARIYLA GEÇTİ! SİSTEM KUSURSUZ ÇALIŞIYOR.');
    process.exit(0);
  } else {
    console.error('⚠️ BAZI TESTLER BAŞARISIZ OLDU!');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('[TEST_RUNNER_ERROR]:', err);
  process.exit(1);
});
