// ============================================================================
// B2B AFS Systems - Deep Cross-Reference & Aggressive Schema Test Suite
// prompt.md Kural 1, 2, 3, 4 Doğrulama Testi
// ============================================================================

const assert = require('assert');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

async function runTestSuite() {
  console.log('=================================================================');
  console.log('BAŞLATILIYOR: prompt.md KURAL 1, 2, 3, 4 DOĞRULAMA TESTLERİ');
  console.log('=================================================================');

  // 1. Veritabanına Test Verisi Tohumlama (Seeding)
  const dbDir = path.join(__dirname, 'prisma', 'pgdata');
  const db = new PGlite(dbDir);
  await db.waitReady;

  console.log('\n[TEST HAZIRLIĞI] Test ürün ve çapraz referans verisi hazırlanıyor...');

  // Önceki test kayıtları varsa temizle
  await db.query(`
    DELETE FROM "PartCrossReference" WHERE "rootOEM" = '410601241R' OR "normalizedCode" IN ('410601241R', '7701208122', 'GDB1552', '0986424794', '1160091AA');
  `).catch(() => {});
  await db.query(`
    DELETE FROM "Product" WHERE "oeNumber" = '410601241R' OR "rootOEM" = '410601241R';
  `).catch(() => {});

  const prodId = 'test-prod-clio-pad-1';
  const testOem = '410601241R';
  const originalOemsJson = JSON.stringify(['7701208122', '410601241R']);
  const referenceCodesJson = JSON.stringify([
    { brand: 'TRW', code: 'GDB1552' },
    { brand: 'Bosch', code: '0986424794' },
    { brand: 'AYD', code: '11-60091AA' }
  ]);
  const techSpecsJson = JSON.stringify({
    thickness: '18mm',
    fittingPosition: 'Front Axle'
  });
  const testImageUrl = 'https://catalog-cdn.parts-catalogs.com/diagrams/renault/410601241R_cad.png';
  const imagesJson = JSON.stringify([testImageUrl]);

  // Test Ürününü Kaydet (Root OEM: 410601241R, Resim sadece bu OEM'e ait!)
  await db.query(`
    INSERT INTO "Product" (
      "id", "oeNumber", "name", "category", "defaultPrice", "vehicleBrand", "compatibleModels", 
      "partGroup", "imageUrl", "images", "rootOEM", "originalOEMs", "referenceCodes", 
      "technicalSpecs", "schemaSourceCode", "updatedAt"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP
    );
  `, [
    prodId, testOem, 'Ön Fren Balata Takımı (Clio IV)', 'Fren Sistemi', 850.0,
    'Renault', 'Clio IV, Captur', 'Fren Balatası',
    testImageUrl, imagesJson, testOem, originalOemsJson, referenceCodesJson,
    techSpecsJson, testOem
  ]);

  // PartCrossReference ağı kayıtları
  const crossRecords = [
    { id: 'ref-1', code: '410601241R', norm: '410601241R', brand: 'OEM', root: '410601241R', isOem: true },
    { id: 'ref-2', code: '7701208122', norm: '7701208122', brand: 'OEM', root: '410601241R', isOem: true },
    { id: 'ref-3', code: 'GDB1552', norm: 'GDB1552', brand: 'TRW', root: '410601241R', isOem: false },
    { id: 'ref-4', code: '0986424794', norm: '0986424794', brand: 'Bosch', root: '410601241R', isOem: false },
    { id: 'ref-5', code: '11-60091AA', norm: '1160091AA', brand: 'AYD', root: '410601241R', isOem: false }
  ];

  for (const r of crossRecords) {
    await db.query(`
      INSERT INTO "PartCrossReference" ("id", "code", "normalizedCode", "brand", "rootOEM", "isOEM", "productId", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP);
    `, [r.id, r.code, r.norm, r.brand, r.root, r.isOem, prodId]);
  }

  // Tohumlama bitti, bağlantıyı kapat ki servis aynı dizini kullanabilsin
  await db.close();
  console.log('✓ Test verileri başarıyla tohumlandı.');

  // 2. Servis ve Denetleyici Modüllerini İçe Aktar
  const { executeDeepCrossReferenceSearch } = require('./services/partsCatalogService');
  const { searchParts, buildStrictSearchResponse } = require('./controllers/searchController');

  // =========================================================================
  // TEST 1: SENARYO A - YAN SANAYİ REFERANS KODU ARAMASI ("trw gdb1552")
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('TEST 1: Senaryo A (Yan Sanayi Referans Kodu: "trw gdb1552")');
  console.log('-----------------------------------------------------------------');

  const resultA = await executeDeepCrossReferenceSearch('trw gdb1552');
  console.log('Senaryo A Sonucu:', JSON.stringify(resultA, null, 2));

  // Doğrulama 1: searchedQuery birebir aranan sorgu olmalı
  assert.strictEqual(resultA.searchedQuery, 'trw gdb1552', 'searchedQuery "trw gdb1552" olmalı.');

  // Doğrulama 2: Kök OEM (rootOEM) bulunmalı ve "410601241R" olmalı
  assert.strictEqual(resultA.rootOEM, '410601241R', 'Kural 1 Senaryo A: Kök OEM "410601241R" olarak çözülmeli.');

  // Doğrulama 3: originalOEMs içinde hem revizyon ("7701208122") hem kök ("410601241R") bulunmalı
  assert.ok(Array.isArray(resultA.originalOEMs), 'originalOEMs bir dizi olmalı.');
  assert.ok(resultA.originalOEMs.includes('410601241R'), 'originalOEMs "410601241R" içermeli.');
  assert.ok(resultA.originalOEMs.includes('7701208122'), 'originalOEMs revizyon "7701208122" içermeli.');

  // Doğrulama 4: referenceCodes içinde TRW, Bosch ve AYD bulunmalı
  assert.ok(Array.isArray(resultA.referenceCodes), 'referenceCodes bir dizi olmalı.');
  const trwMatch = resultA.referenceCodes.find(r => r.brand.toUpperCase() === 'TRW' && r.code.toUpperCase() === 'GDB1552');
  const boschMatch = resultA.referenceCodes.find(r => r.brand.toUpperCase() === 'BOSCH' && r.code.replace(/\s+/g, '') === '0986424794');
  const aydMatch = resultA.referenceCodes.find(r => r.brand.toUpperCase() === 'AYD' && r.code.replace(/[^A-Z0-9]/gi, '') === '1160091AA');
  assert.ok(trwMatch, 'TRW GDB1552 referansı bulunmalı.');
  assert.ok(boschMatch, 'Bosch 0986424794 referansı bulunmalı.');
  assert.ok(aydMatch, 'AYD 11-60091AA referansı bulunmalı.');

  // Doğrulama 5: KURAL 2 - Aggressive Schema Fetching
  // TRW GDB1552'nin kendi şeması yok; Kardeş kod 410601241R'den çekilmiş olmalı!
  assert.ok(Array.isArray(resultA.images) && resultA.images.length > 0, 'Kural 2: Görsel dizisi boş olmamalı.');
  assert.strictEqual(resultA.images[0].isFallback, true, 'Kural 2: Görsel isFallback: true olmalı.');
  assert.strictEqual(resultA.images[0].sourceCode, '410601241R', 'Kural 2: Görsel sourceCode: "410601241R" olmalı.');
  assert.strictEqual(resultA.schemaSourceCode, '410601241R', 'Kural 2: schemaSourceCode metadata: "410601241R" olmalı.');

  // Doğrulama 6: KURAL 3 - Gerçek technicalSpecs verisi
  assert.ok(resultA.technicalSpecs, 'Kural 3: technicalSpecs mevcut olmalı.');
  assert.strictEqual(resultA.technicalSpecs.thickness, '18mm', 'thickness 18mm olmalı.');
  assert.strictEqual(resultA.technicalSpecs.fittingPosition, 'Front Axle', 'fittingPosition Front Axle olmalı.');

  console.log('✓ TEST 1 (Senaryo A) BAŞARIYLA GEÇTİ!');

  // =========================================================================
  // TEST 2: SENARYO B - OEM KODU ARAMASI ("7701208122")
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('TEST 2: Senaryo B (OEM Revizyon Kodu: "7701208122")');
  console.log('-----------------------------------------------------------------');

  const resultB = await executeDeepCrossReferenceSearch('7701208122');
  console.log('Senaryo B Sonucu:', JSON.stringify(resultB, null, 2));

  assert.strictEqual(resultB.searchedQuery, '7701208122', 'searchedQuery "7701208122" olmalı.');
  assert.strictEqual(resultB.rootOEM, '410601241R', 'Kural 1 Senaryo B: Kök OEM "410601241R" olmalı.');
  assert.ok(resultB.originalOEMs.includes('7701208122'), 'originalOEMs "7701208122" içermeli.');
  assert.ok(resultB.originalOEMs.includes('410601241R'), 'originalOEMs "410601241R" içermeli.');
  assert.ok(resultB.referenceCodes.length >= 3, 'Tüm yan sanayi muadilleri bulunmalı.');
  assert.strictEqual(resultB.images[0].sourceCode, '410601241R', 'Kural 2: Kardeş koddan şema çekilmeli.');

  console.log('✓ TEST 2 (Senaryo B) BAŞARIYLA GEÇTİ!');

  // =========================================================================
  // TEST 3: KURAL 3 - SIFIR SAHTE VERİ / SIFIR MOCK TESTİ
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('TEST 3: Kural 3 (Sıfır Sahte / Hardcoded Veri Toleransı)');
  console.log('-----------------------------------------------------------------');

  // Bilinmeyen / olmayan bir kod arandığında ASLA uydurma veri dönmemeli
  const resultUnknown = await executeDeepCrossReferenceSearch('BILINMEYENKOD99999');
  console.log('Bilinmeyen Kod Sonucu:', JSON.stringify(resultUnknown, null, 2));

  assert.strictEqual(resultUnknown.rootOEM, undefined, 'Bilinmeyen parça için sahte Kök OEM üretilmemeli.');
  assert.deepStrictEqual(resultUnknown.originalOEMs, [], 'Bilinmeyen parça için sahte OEM revizyonları üretilmemeli.');
  assert.deepStrictEqual(resultUnknown.referenceCodes, [], 'Bilinmeyen parça için sahte referanslar (B-xxx, V-xxx) üretilmemeli.');
  assert.strictEqual(resultUnknown.technicalSpecs, undefined, 'Kural 3: API/DB’de veri yoksa technicalSpecs undefined olmalı.');
  assert.deepStrictEqual(resultUnknown.images, [], 'Kural 3: API/DB’de şema yoksa sahte "Karter/Yağ Filtresi" dönülmemeli.');

  console.log('✓ TEST 3 (Kural 3 - Sıfır Sahte Veri) BAŞARIYLA GEÇTİ!');

  // =========================================================================
  // TEST 4: KURAL 4 - REST CONTROLLER KESİN JSON ÇIKTI STANDARDI (STRICT PAYLOAD)
  // =========================================================================
  console.log('\n-----------------------------------------------------------------');
  console.log('TEST 4: Kural 4 (API JSON Çıktı Standardı / Strict Payload)');
  console.log('-----------------------------------------------------------------');

  let mockResponseJson = null;
  let mockResponseStatus = null;
  const mockReq = {
    params: { oeNumber: 'trw gdb1552' },
    query: {},
    body: {}
  };
  const mockRes = {
    status: (code) => {
      mockResponseStatus = code;
      return {
        json: (data) => {
          mockResponseJson = data;
          return data;
        }
      };
    }
  };

  await searchParts(mockReq, mockRes);

  assert.strictEqual(mockResponseStatus, 200, 'HTTP durum kodu 200 olmalı.');
  assert.strictEqual(mockResponseJson.success, true, 'success: true olmalı.');
  assert.strictEqual(mockResponseJson.searchedQuery, 'trw gdb1552', 'searchedQuery doğru olmalı.');
  assert.strictEqual(mockResponseJson.rootOEM, '410601241R', 'rootOEM doğru olmalı.');
  assert.ok(Array.isArray(mockResponseJson.originalOEMs), 'originalOEMs dizi olmalı.');
  assert.ok(Array.isArray(mockResponseJson.referenceCodes), 'referenceCodes dizi olmalı.');
  assert.ok(mockResponseJson.technicalSpecs && typeof mockResponseJson.technicalSpecs === 'object', 'technicalSpecs obje olmalı.');
  assert.ok(Array.isArray(mockResponseJson.images), 'images dizi olmalı.');
  assert.strictEqual(mockResponseJson.images[0].isFallback, true, 'images[0].isFallback doğru olmalı.');
  assert.strictEqual(mockResponseJson.images[0].sourceCode, '410601241R', 'images[0].sourceCode doğru olmalı.');

  console.log('HTTP Controller JSON Çıktısı:');
  console.log(JSON.stringify(mockResponseJson, null, 2));

  console.log('✓ TEST 4 (Kural 4 - Kesin API JSON Çıktı Standardı) BAŞARIYLA GEÇTİ!');

  console.log('\n=================================================================');
  console.log('TÜM TESTLER EKSİKSİZ VE HATASIZ OLARAK GEÇTİ (4/4 BAŞARILI)');
  console.log('=================================================================');
  process.exit(0);
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST BAŞARISIZ OLDU:', err);
  process.exit(1);
});
