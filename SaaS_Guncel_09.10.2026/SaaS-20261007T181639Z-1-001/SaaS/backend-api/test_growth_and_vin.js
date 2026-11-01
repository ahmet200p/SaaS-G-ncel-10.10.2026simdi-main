// ============================================================================
// Multi-Tenant B2B SaaS - Büyüme (Growth) Modülleri & VIN Determinizm Testi
// ============================================================================

const assert = require('assert');

// Hafif ve güvenilir Express Request/Response Mock Simülatörü
function createMockReqRes({ method = 'GET', url = '/', body = {}, query = {}, params = {}, headers = {} }) {
  const req = {
    method,
    url,
    body,
    query,
    params,
    headers: { ...headers },
    get: (name) => headers[name.toLowerCase()] || headers[name] || '',
    accepts: (type) => type === 'json' || type === 'application/json'
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    setHeader(name, val) {
      this.headers[name] = val;
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      return this;
    }
  };

  return { req, res };
}

async function runTests() {
  console.log('🚀 [TEST] Büyüme (Growth) Modülleri & VIN Determinizm Test Paketi Başlatılıyor...\n');

  // Controllers
  const analyticsController = require('./controllers/analyticsController');
  const quoteController = require('./controllers/quoteController');
  const searchController = require('./controllers/searchController');
  const { searchVinNumber } = require('./services/partsCatalogService');

  // ------------------------------------------------------------------------
  // TEST 1: POST /api/analytics/no-hit (Kayıp Arama Günlüğü - Sessiz 200 OK)
  // ------------------------------------------------------------------------
  console.log('--- 1. KAYIP ARAMA (NO-HIT LOG) TESTİ ---');

  // 1.A: VIN no-hit kaydı
  const mockVinNoHit = createMockReqRes({
    method: 'POST',
    url: '/api/analytics/no-hit',
    body: {
      searchTerm: 'VF1TESTVIN1234567',
      searchType: 'VIN',
      metadata: { source: 'unit_test', reason: 'zero_results' }
    }
  });

  await analyticsController.recordNoHitLog(mockVinNoHit.req, mockVinNoHit.res);
  assert.strictEqual(mockVinNoHit.res.statusCode, 200, 'VIN no-hit API 200 OK dönmelidir.');
  assert.strictEqual(mockVinNoHit.res.body?.success, true, 'success: true olmalıdır.');
  console.log('✅ POST /api/analytics/no-hit (VIN) sessizce 200 OK ile kaydedildi.');

  // 1.B: OEM parça no-hit kaydı
  const mockOemNoHit = createMockReqRes({
    method: 'POST',
    url: '/api/analytics/no-hit',
    body: {
      searchTerm: '7701MOCKMISSING99',
      searchType: 'OEM',
      metadata: { source: 'unit_test' }
    }
  });

  await analyticsController.recordNoHitLog(mockOemNoHit.req, mockOemNoHit.res);
  assert.strictEqual(mockOemNoHit.res.statusCode, 200, 'OEM no-hit API 200 OK dönmelidir.');
  assert.strictEqual(mockOemNoHit.res.body?.success, true);
  console.log('✅ POST /api/analytics/no-hit (OEM) sessizce 200 OK ile kaydedildi.');

  // 1.C: GET /api/analytics/no-hit
  const mockGetNoHit = createMockReqRes({ method: 'GET', url: '/api/analytics/no-hit' });
  await analyticsController.getNoHitLogs(mockGetNoHit.req, mockGetNoHit.res);
  assert.strictEqual(mockGetNoHit.res.statusCode, 200);
  assert.ok(Array.isArray(mockGetNoHit.res.body?.data), 'data bir dizi olmalıdır.');
  console.log(`✅ GET /api/analytics/no-hit doğrulandı (${mockGetNoHit.res.body.data.length} kayıt listelendi).`);


  // ------------------------------------------------------------------------
  // TEST 2: POST /api/quotes/generate & GET /api/quotes/:id (CustomerQuote)
  // ------------------------------------------------------------------------
  console.log('\n--- 2. MÜŞTERİ TEKLİFİ (CUSTOMER QUOTE) TESTİ ---');

  const mockCreateQuote = createMockReqRes({
    method: 'POST',
    url: '/api/quotes/generate',
    body: {
      customerName: 'Ahmet Oto Özel Servis',
      customerPhone: '05321234567',
      notes: '7 gün süreyle geçerli özel servis teklifidir.',
      items: [
        {
          partName: 'Front pad - Ön Fren Balata Takımı',
          oemCode: '7701209639',
          quantity: 2,
          unitPrice: 650.00,
          totalPrice: 1300.00,
          brand: 'Renault'
        },
        {
          partName: 'Fren Diski Ön Takım',
          oemCode: '7701207795',
          quantity: 1,
          unitPrice: 1450.00,
          totalPrice: 1450.00,
          brand: 'Renault'
        }
      ],
      totalPrice: 2750.00
    }
  });

  await quoteController.generateQuote(mockCreateQuote.req, mockCreateQuote.res);
  assert.strictEqual(mockCreateQuote.res.statusCode, 201, 'POST /api/quotes/generate 201 Created dönmelidir.');
  const quoteData = mockCreateQuote.res.body?.data;
  assert.ok(quoteData?.id, 'Teklif UUID üretilmiş olmalıdır.');
  assert.ok(quoteData.quoteUrl.startsWith('/quote/'), 'quoteUrl /quote/:uuid formatında olmalıdır.');
  assert.ok(quoteData.whatsappShareUrl.includes('whatsapp.com'), 'WhatsApp paylaşım linki oluşturulmalıdır.');
  assert.ok(quoteData.whatsappText.includes('AHMET OTO ÖZEL SERVİS'), 'WhatsApp metninde müşteri adı yer almalıdır.');
  console.log(`✅ POST /api/quotes/generate başarıyla çalıştı. Quote ID: ${quoteData.id}`);
  console.log(`   - Link: ${quoteData.quoteUrl}`);
  console.log(`   - WhatsApp URL: ${quoteData.whatsappShareUrl.slice(0, 75)}...`);

  // 2.B: GET /api/quotes/:id
  const mockGetQuote = createMockReqRes({
    method: 'GET',
    url: `/api/quotes/${quoteData.id}`,
    params: { id: quoteData.id }
  });
  await quoteController.getQuoteById(mockGetQuote.req, mockGetQuote.res);
  assert.strictEqual(mockGetQuote.res.statusCode, 200, 'GET /api/quotes/:id 200 OK dönmelidir.');
  assert.strictEqual(mockGetQuote.res.body?.data?.customerName, 'Ahmet Oto Özel Servis');
  assert.strictEqual(mockGetQuote.res.body?.data?.items?.length, 2);
  assert.strictEqual(mockGetQuote.res.body?.data?.totalPrice, 2750.00);
  console.log('✅ GET /api/quotes/:id public görüntüleme doğrulandı.');


  // ------------------------------------------------------------------------
  // TEST 3: GÖRSEL HOTSPOT (ŞEMA KOORDİNAT) DESTEĞİ
  // ------------------------------------------------------------------------
  console.log('\n--- 3. GÖRSEL HOTSPOT (images[].hotspots) STANDARDI TESTİ ---');

  const mockResultWithHotspots = {
    searchedQuery: '7701209639',
    partName: 'Fren Balata Takımı',
    partGroup: 'Fren Sistemi',
    images: [
      {
        url: 'https://img.parts-catalogs.com/renault/01084372.png',
        coordinates: [
          { x: 150, y: 320, width: 45, height: 30, positionNumber: '1', oemCode: '7701209639' }
        ]
      },
      'https://img.parts-catalogs.com/renault/01084374.png' // düz string url
    ]
  };

  const strictResponse = searchController.buildStrictSearchResponse(mockResultWithHotspots);
  assert.ok(Array.isArray(strictResponse.images), 'images bir dizi olmalıdır.');
  assert.strictEqual(strictResponse.images.length, 2, '2 görsel olmalıdır.');

  for (const img of strictResponse.images) {
    assert.ok(typeof img === 'object' && img !== null, 'Görsel bir obje olmalıdır.');
    assert.ok(typeof img.url === 'string' && img.url.length > 0, 'Görsel url alanı içermelidir.');
    assert.ok(Array.isArray(img.hotspots), 'images[].hotspots ZORUNLU olarak dizi olmalıdır!');
  }

  assert.strictEqual(strictResponse.images[0].hotspots.length, 1, '1. görselde 1 hotspot bulunmalıdır.');
  assert.strictEqual(strictResponse.images[0].hotspots[0].x, 150);
  assert.strictEqual(strictResponse.images[0].hotspots[0].positionNumber, '1');
  assert.strictEqual(strictResponse.images[1].hotspots.length, 0, '2. görselin hotspots dizisi boş [] olmalıdır.');
  console.log('✅ images[].hotspots zorunlu dizisi ve koordinat normalizasyonu başarıyla doğrulandı.');


  // ------------------------------------------------------------------------
  // TEST 4: ŞASİ (VIN) SORGUSU DETERMINIZMI VE TÜM PARÇALAR (FRONT PAD DAHİL)
  // ------------------------------------------------------------------------
  console.log('\n--- 4. ŞASİ (VIN) SORGUSU DETERMINIZM & FRONT PAD TESTİ ---');
  const targetVin = 'VF1LB17C536060366';

  // 1. Sorgu
  const run1 = await searchVinNumber(targetVin);
  assert.ok(run1, 'Sorgu 1 başarılı bir obje dönmelidir.');
  assert.ok(Array.isArray(run1.compatibleParts), 'compatibleParts bir dizi olmalıdır.');
  const count1 = run1.compatibleParts.length;
  console.log(`   - 1. VIN Sorgusu Sonucu: ${count1} uyumlu OEM parçası bulundu.`);

  // 2. Sorgu (Hemen peşinden tekrar)
  const run2 = await searchVinNumber(targetVin);
  const count2 = run2.compatibleParts.length;
  console.log(`   - 2. VIN Sorgusu Sonucu: ${count2} uyumlu OEM parçası bulundu.`);

  // Determinizm doğrulaması: Sayı asla değişmemelidir!
  assert.strictEqual(count1, count2, `VIN sorgusu deterministik olmalıdır! (${count1} === ${count2})`);
  assert.ok(count1 >= 100, `Uyumlu parça sayısı eksiksiz (tam ağaç) olmalıdır (Bulunan: ${count1}).`);

  // Front pad / Fren balata doğrulaması
  const frontPads = run1.compatibleParts.filter(p =>
    /(front\s*pad|fren\s*balata|brake\s*pad)/i.test(p.partName)
  );
  assert.ok(frontPads.length > 0, 'Şasiye ait Front pad / Fren Balatası parça listesinde KESİNLİKLE bulunmalıdır!');
  console.log(`✅ Front pad / Fren balata parçaları başarıyla mevcut (${frontPads.length} adet varyant):`);
  frontPads.forEach(fp => console.log(`      • [${fp.oemCode}] ${fp.partName} (${fp.categoryGroup})`));

  console.log('\n🎉 TÜM TESTLER BAŞARIYLA GEÇTİ! SİSTEM %100 ÇALIŞIYOR VE HATASIZDIR.');
}

runTests().catch((err) => {
  console.error('\n❌ [TEST_HATA]:', err);
  process.exit(1);
});

