// ============================================================================
// ŞASİ (VIN) -> KOMPLE OEM PARÇA AĞACI (VEHICLE PARTS TREE) DOĞRULAMA TESTİ
// prompt.md Katı Kuralları:
// 1. Geniş Çaplı Katalog Taraması (fren, motor, süspansiyon vb. tüm OEM parçalar)
// 2. JSON Çıktı Standartı: vehicleInfo + compatibleParts dizisi
// 3. Veri Yapısı: { "partName": "Ön Fren Balata Takımı", "oemCode": "410601241R", "categoryGroup": "Fren Sistemi" }
// 4. Sahte Veri Yasak: Parça ağacı yoksa [] döner, "Test Parçası 1" vb. üretilmez.
// ============================================================================

const assert = require('assert');
const axios = require('axios');
const { searchVin, searchParts } = require('./controllers/searchController');
const {
  sanitize,
  isValidRealOemCode,
  normalizeCatalogPartItem
} = require('./services/partsCatalogService');

function invokeController(handler, reqOverrides = {}) {
  return new Promise((resolve) => {
    const req = {
      params: {},
      query: {},
      body: {},
      headers: {},
      ...reqOverrides
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ statusCode: this.statusCode, body: payload });
        return this;
      }
    };
    handler(req, res);
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('ŞASİ (VIN) TO OEM PARÇA AĞACI API DOĞRULAMA TESTLERİ BAŞLIYOR...');
  console.log('================================================================\n');

  const originalAxiosGet = axios.get;

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Geniş Çaplı Katalog Taraması & Veri Yapısı Doğrulaması
    // ------------------------------------------------------------------------
    console.log('▶ TEST 1: VIN (VF15R040H52814321) -> vehicleInfo & compatibleParts Ağacı');

    axios.get = async (url, config = {}) => {
      const params = config.params || {};

      // 1. Araç Künyesi (/v1/car/info)
      if (url.includes('/v1/car/info')) {
        return {
          status: 200,
          data: [
            {
              catalogId: 'renault',
              carId: 'car_clio_iv_01',
              modelId: 'mod_clio_iv',
              brand: 'Renault',
              title: 'Clio IV (BH_)',
              criteria: 'CRIT_VF15R',
              parameters: [
                { key: 'car_name', value: 'Clio IV' },
                { key: 'year', value: '2018' },
                { key: 'engine', value: '1.5 dCi K9K' }
              ]
            }
          ]
        };
      }

      // 2. Ana ve Alt Kategori Grupları (/v1/catalogs/renault/groups2)
      if (url.includes('/v1/catalogs/renault/groups2')) {
        if (!params.groupId) {
          return {
            status: 200,
            data: [
              { id: 'grp_brakes', name: 'Brake system', hasSubgroups: true, hasParts: false },
              { id: 'grp_engine', name: 'Engine', hasSubgroups: false, hasParts: true },
              { id: 'grp_susp', name: 'Suspension', hasSubgroups: false, hasParts: true }
            ]
          };
        }
        if (params.groupId === 'grp_brakes') {
          return {
            status: 200,
            data: [
              { id: 'sub_front_brakes', name: 'Front Axle Brake Pads & Discs', hasSubgroups: false, hasParts: true }
            ]
          };
        }
        return { status: 200, data: [] };
      }

      // 3. Şemalar (/v1/catalogs/renault/schemas)
      if (url.includes('/v1/catalogs/renault/schemas')) {
        return {
          status: 200,
          data: {
            list: [
              {
                id: 'sch_01',
                groupId: 'sub_front_brakes',
                name: 'Front Brake System',
                img: 'https://img.parts-catalogs.com/renault_2020_03/1351/brake_schema.png',
                partNames: [
                  // Şema pozisyon numarası ve iç katalog hash'i (elenmeli!)
                  { id: '1', name: 'Callout Number Only' },
                  { id: '099e0afa71f140e94ab1e50481bab91d', name: 'Internal Hash ID' },
                  // Gerçek OEM parçası
                  { oe: '402063149R', name: 'Front Brake Disc' }
                ]
              },
              {
                id: 'sch_02',
                groupId: 'grp_engine',
                name: 'Triger kayışı ve eksantrik dişlisi',
                img: 'https://img.parts-catalogs.com/renault_2020_03/1351/timing_belt_schema.png',
                partNames: [
                  { id: '13028', name: 'Triger kayışı' }
                ]
              }
            ]
          }
        };
      }

      // 4. Grup Parça Listeleri (/v1/catalogs/renault/parts2)
      if (url.includes('/v1/catalogs/renault/parts2')) {
        if (params.groupId === 'sub_front_brakes') {
          return {
            status: 200,
            data: {
              partGroups: [
                {
                  name: 'Brake Pad Set',
                  parts: [
                    { name: 'Front Brake Pad Set', number: '410601241R' }
                  ]
                }
              ]
            }
          };
        }
        if (params.groupId === 'grp_engine') {
          return {
            status: 200,
            data: {
              partGroups: [
                {
                  name: 'Engine & Lubrication',
                  parts: [
                    { name: 'Oil Filter', oem: '152089599R' },
                    { name: 'Timing Belt Kit', oeNumber: '130C17529R' }
                  ]
                }
              ]
            }
          };
        }
        if (params.groupId === 'grp_susp') {
          return {
            status: 200,
            data: [
              { name: 'Front Shock Absorber', code: '543020008R' },
              { name: 'Control Arm', oemCode: '545006892R' }
            ]
          };
        }
      }

      return { status: 200, data: [] };
    };

    const res1 = await invokeController(searchVin, {
      params: { vin: 'VF15R040H52814321' }
    });

    assert.strictEqual(res1.statusCode, 200, 'HTTP 200 dönmeli');
    assert.strictEqual(res1.body.success, true, 'success: true olmalı');
    assert.ok(res1.body.vehicleInfo && typeof res1.body.vehicleInfo === 'object', 'vehicleInfo objesi bulunmalı');
    assert.strictEqual(res1.body.vehicleInfo.vin, 'VF15R040H52814321');
    assert.strictEqual(res1.body.vehicleInfo.vehicleBrand, 'Renault');
    assert.ok(Array.isArray(res1.body.compatibleParts), 'compatibleParts bir dizi (array) olmalı');
    assert.strictEqual(res1.body.compatibleParts.length, 6, 'Toplam 6 gerçek OEM parçası toplanmalı (pozisyon no ve iç hash elenmeli)');

    // Her elemanın sadece { partName, oemCode, categoryGroup } formatında olduğunu doğrula
    for (const part of res1.body.compatibleParts) {
      assert.deepStrictEqual(
        Object.keys(part).sort(),
        ['categoryGroup', 'oemCode', 'partName'],
        'Her compatibleParts objesi tam olarak { partName, oemCode, categoryGroup } anahtarlarına sahip olmalı'
      );
      assert.ok(part.partName.length > 0, 'partName boş olmamalı');
      assert.ok(part.oemCode.length >= 5, 'oemCode geçerli olmalı');
      assert.ok(part.categoryGroup.length > 0, 'categoryGroup boş olmamalı');
    }

    const brakePad = res1.body.compatibleParts.find((p) => p.oemCode === '410601241R');
    assert.deepStrictEqual(
      brakePad,
      {
        partName: 'Ön Fren Balata Takımı',
        oemCode: '410601241R',
        categoryGroup: 'Fren Sistemi'
      },
      'prompt.md içindeki örnek veri yapısıyla birebir eşleşmeli'
    );

    console.log('  ✔ Araç Künyesi (vehicleInfo):', JSON.stringify(res1.body.vehicleInfo));
    console.log('  ✔ Uyumlu OEM Parçalar (compatibleParts):', JSON.stringify(res1.body.compatibleParts, null, 2));

    // ------------------------------------------------------------------------
    // TEST 2: Sahte Veri Yasak (Katalog API parça ağacı sunmuyorsa [] dönmeli)
    // ------------------------------------------------------------------------
    console.log('\n▶ TEST 2: Parça Ağacı Sunulmayan Şasi -> Boş Dizi [] (Sahte Veri Yasak)');

    axios.get = async (url) => {
      if (url.includes('/v1/car/info')) {
        return {
          status: 200,
          data: [
            {
              catalogId: 'vw',
              carId: 'car_golf_01',
              brand: 'Volkswagen',
              title: 'Golf VII (5G1)',
              criteria: 'CRIT_VW'
            }
          ]
        };
      }
      // Diğer tüm parça/grup uç noktaları boş dönüyor
      return { status: 200, data: [] };
    };

    const res2 = await invokeController(searchVin, {
      params: { vin: 'WVWZZZAUZJW000001' }
    });

    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.vehicleInfo.vehicleBrand, 'Volkswagen');
    assert.ok(Array.isArray(res2.body.compatibleParts), 'compatibleParts dizi olmalı');
    assert.strictEqual(res2.body.compatibleParts.length, 0, 'Katalog parça ağacı sunmuyorsa kesinlikle [] dönmeli');
    console.log('  ✔ Parça ağacı olmayan VIN için compatibleParts:', JSON.stringify(res2.body.compatibleParts));

    // ------------------------------------------------------------------------
    // TEST 3: Sahte / Mock Parça İsimlerinin ("Test Parçası 1" vb.) Reddedilmesi
    // ------------------------------------------------------------------------
    console.log('\n▶ TEST 3: Sahte / Mock Veri Filtresi ("Test Parçası 1" vb. Kesin Engel)');
    const fake1 = normalizeCatalogPartItem({ partName: 'Test Parçası 1', oemCode: '410601241R', categoryGroup: 'Fren' });
    const fake2 = normalizeCatalogPartItem({ partName: 'Ön Fren Balata', oemCode: 'TEST12345', categoryGroup: 'Fren' });
    const fake3 = isValidRealOemCode('099e0afa71f140e94ab1e50481bab91d');
    assert.strictEqual(fake1, null, '"Test Parçası 1" kesinlikle reddedilmeli');
    assert.strictEqual(fake2, null, '"TEST12345" sahte kodu kesinlikle reddedilmeli');
    assert.strictEqual(fake3, false, '32 haneli MD5 katalog ID OEM kodu olarak kabul edilmemeli');
    assert.strictEqual(sanitize('130 C 175-29R'), '130C17529R', 'sanitize() tüm boşluk ve özel karakterleri temizlemeli');
    console.log('  ✔ "Test Parçası 1", "TEST12345" ve iç hash ID\'leri başarıyla engellendi.');

    // ------------------------------------------------------------------------
    // TEST 4: VIN Listesinden Tıklanan Mekanik Parça -> Derin Çapraz Eşleştirme & Şema
    // ------------------------------------------------------------------------
    console.log('\n▶ TEST 4: VIN Listesinden Tıklanan Parça ("Triger Kayış Seti (130C17529R)") -> OEM, Muadil ve Şema');
    const timingBeltRes = await invokeController(searchParts, {
      params: { oeNumber: 'Triger Kayış Seti (130C17529R)' }
    });
    assert.strictEqual(timingBeltRes.statusCode, 200);
    assert.strictEqual(timingBeltRes.body.success, true);
    assert.strictEqual(timingBeltRes.body.searchedCode, '130C17529R', 'Parantez içindeki OE kodu sanitize edilerek çıkarılmalı');
    assert.ok(timingBeltRes.body.originalOEMs.includes('130C17529R'), 'originalOEMs aranan OEM kodunu içermeli');
    assert.ok(timingBeltRes.body.originalOEMs.length >= 2, 'Kardeş/revizyon OEM numaraları dönmeli');
    assert.ok(timingBeltRes.body.referenceCodes.length >= 3, 'Marka bazlı muadil referans kodları (Gates, INA, Continental vb.) dönmeli');
    assert.ok(timingBeltRes.body.technicalSpecs && Object.keys(timingBeltRes.body.technicalSpecs).length > 0, 'Teknik özellikler (technicalSpecs) dönmeli');
    assert.ok(timingBeltRes.body.images.length > 0, 'Mekanik parça için grup/montaj şeması dönmeli');
    assert.strictEqual(timingBeltRes.body.images[0].url, 'https://img.parts-catalogs.com/renault_2020_03/1351/timing_belt_schema.png');
    console.log('  ✔ Triger Kayış Seti (130C17529R) Çapraz Eşleşme ve Şema Sonucu:', JSON.stringify(timingBeltRes.body, null, 2));

    // Muadil referans kodu ile tersine arama (Reverse Cross-Reference + Fallback Şema)
    const sampleAftermarket = timingBeltRes.body.referenceCodes[0];
    const reverseRes = await invokeController(searchParts, {
      params: { oeNumber: `${sampleAftermarket.brand} ${sampleAftermarket.code}` }
    });
    assert.strictEqual(reverseRes.statusCode, 200);
    assert.ok(reverseRes.body.originalOEMs.includes('130C17529R'), 'Yan sanayi kodundan OEM koduna geri çözülmeli');
    assert.ok(reverseRes.body.images.length > 0, 'Yan sanayi kodunda eşdeğer OEM şeması fallback olarak gelmeli');
    assert.strictEqual(reverseRes.body.images[0].isFallback, true, 'isFallback: true olmalı');
    console.log(`  ✔ Tersine Yan Sanayi Sorgusu (${sampleAftermarket.brand} ${sampleAftermarket.code}) -> Kök OEM: ${reverseRes.body.rootOEM}, isFallback: ${reverseRes.body.images[0].isFallback}`);

    console.log('\n================================================================');
    console.log('✅ TÜM ŞASİ (VIN) -> OEM PARÇA AĞACI VE ÇAPRAZ EŞLEŞME TESTLERİ GEÇTİ (4/4)');
    console.log('================================================================');
  } finally {
    axios.get = originalAxiosGet;
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ TEST HATASI:', err);
    process.exit(1);
  });
