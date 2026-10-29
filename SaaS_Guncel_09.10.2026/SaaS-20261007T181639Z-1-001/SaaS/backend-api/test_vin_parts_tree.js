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

    // ------------------------------------------------------------------------
    // TEST 5: VF1LB17C536060366 (Clio II / Thalia / Symbol) Çok Katmanlı Ağaç,
    //         "Front pad" (parameters dizili parça), >50 Yaprak Grup ve %100 Sabit Sayı (Determinism)
    // ------------------------------------------------------------------------
    console.log('\n▶ TEST 5: VF1LB17C536060366 -> "Front pad" Dahil Tüm Yaprak Gruplar & %100 Sabit Sonuç (Determinism)');

    let transientFailureInjected = false;
    axios.get = async (url, config = {}) => {
      const params = config.params || {};

      if (url.includes('/v1/car/info')) {
        return {
          status: 200,
          data: [
            {
              catalogId: 'renault',
              carId: 'car_clio_ii_symbol',
              modelId: 'mod_clio_ii',
              brand: 'Renault',
              title: 'Clio II, Thalia, Symbol, Lutecia',
              criteria: 'CRIT_VF1LB17'
            }
          ]
        };
      }

      // 3 katmanlı grup ağacı (Root -> Level 2 -> 45 adet Level 3 yaprak grup)
      if (url.includes('/v1/catalogs/renault/groups2')) {
        if (!params.groupId) {
          return {
            status: 200,
            data: [
              { id: 'cat_acc', name: 'Accessories', hasSubgroups: true, hasParts: false },
              { id: 'cat_mech', name: 'Mechanical & Chassis', hasSubgroups: true, hasParts: false }
            ]
          };
        }
        if (params.groupId === 'cat_acc') {
          return {
            status: 200,
            data: [
              { id: 'sub_acc_trim', name: 'Interior Trim & Sunblind', hasSubgroups: true, hasParts: false }
            ]
          };
        }
        if (params.groupId === 'sub_acc_trim') {
          return {
            status: 200,
            data: [
              { id: 'leaf_sunblind', name: 'Sunblind & Warning Triangle', hasSubgroups: false, hasParts: true }
            ]
          };
        }
        if (params.groupId === 'cat_mech') {
          // 25 adet 2. seviye alt dal döndür, her biri 3. seviyede 2'şer yaprak grup açsın (toplam 50+ yaprak grup -> eski .slice(0,36) sınırını aşar!)
          const level2 = [];
          for (let i = 1; i <= 25; i++) {
            level2.push({
              id: `sub_mech_${i}`,
              name: i === 1 ? 'Braking System Front' : `Mechanical Subgroup ${i}`,
              hasSubgroups: true,
              hasParts: false
            });
          }
          return { status: 200, data: level2 };
        }
        if (String(params.groupId).startsWith('sub_mech_')) {
          const idx = String(params.groupId).replace('sub_mech_', '');
          return {
            status: 200,
            data: [
              { id: `leaf_mech_${idx}_a`, name: idx === '1' ? 'Front Brake Caliper & Pad' : `Leaf Assembly ${idx}A`, hasSubgroups: false, hasParts: true },
              { id: `leaf_mech_${idx}_b`, name: `Leaf Assembly ${idx}B`, hasSubgroups: false, hasParts: true }
            ]
          };
        }
        return { status: 200, data: [] };
      }

      // Şemalar: hem root page=0 hem de branchId ile gelen şema yaprakları
      if (url.includes('/v1/catalogs/renault/schemas')) {
        if (params.branchId === 'cat_mech') {
          return {
            status: 200,
            data: {
              list: [
                {
                  id: 'sch_branch_brake',
                  groupId: 'leaf_branch_only_brake',
                  name: 'Front Pad & Disc Assembly',
                  img: 'https://img.parts-catalogs.com/renault_2020_03/clio2/front_pad_schema.png'
                }
              ]
            }
          };
        }
        if (!params.branchId && (params.page === 0 || params.page === undefined)) {
          return {
            status: 200,
            data: {
              list: [
                {
                  id: 'sch_acc_1',
                  groupId: 'leaf_sunblind',
                  name: 'Sunblind & Accessories',
                  img: 'https://img.parts-catalogs.com/renault_2020_03/clio2/sunblind.png'
                }
              ]
            }
          };
        }
        return { status: 200, data: { list: [] } };
      }

      // Yaprak grup parçaları (/parts2)
      if (url.includes('/v1/catalogs/renault/parts2')) {
        // Geçici ağ hatası simülasyonu: axiosGetCatalogWithRetry otomatik telafi etmeli ve parça sayısı asla düşmemeli!
        if (params.groupId === 'leaf_mech_1_a' && !transientFailureInjected) {
          transientFailureInjected = true;
          const err = new Error('Simulated ECONNRESET on leaf_mech_1_a');
          err.code = 'ECONNRESET';
          throw err;
        }

        if (params.groupId === 'leaf_sunblind') {
          return {
            status: 200,
            data: {
              partGroups: [
                {
                  name: 'Accessories',
                  parts: [
                    { name: 'Sunblind', oem: '7701416288' },
                    { name: 'SUNBLINDS C2', oem: '7701416289' },
                    { name: 'Warning triangle', oem: '7711422907' },
                    { name: 'TRIM', oem: '7711229556' }
                  ]
                }
              ]
            }
          };
        }

        if (params.groupId === 'leaf_mech_1_a') {
          // Kritik regresyon testi: parameters dizisi olan ve name alanı pozisyon no ("1") olup description alanı "Front pad" olan parça!
          return {
            status: 200,
            data: {
              partGroups: [
                {
                  name: 'Front pad',
                  parts: [
                    {
                      name: '1',
                      description: 'Front pad',
                      oem: '7701208122',
                      parameters: [
                        { key: 'Thickness', value: '18 mm' },
                        { key: 'Brake System', value: 'TRW / Lucas' }
                      ]
                    }
                  ]
                }
              ]
            }
          };
        }

        if (params.groupId === 'leaf_branch_only_brake') {
          return {
            status: 200,
            data: {
              partGroups: [
                {
                  name: 'Rear Brake Pad',
                  parts: [
                    {
                      name: 'Rear pad',
                      oem: '7701207484',
                      parameters: [{ key: 'Axle', value: 'Rear' }]
                    }
                  ]
                }
              ]
            }
          };
        }

        if (String(params.groupId).startsWith('leaf_mech_')) {
          const cleanToken = String(params.groupId).replace('leaf_mech_', '').replace(/[^a-z0-9]/gi, '').toUpperCase();
          return {
            status: 200,
            data: [
              {
                name: `Engine Mount ${cleanToken}`,
                oem: `820099${cleanToken}R`,
                parameters: [{ key: 'Side', value: 'Right' }]
              }
            ]
          };
        }
      }

      return { status: 200, data: [] };
    };

    // Aynı şasiyi arka arkaya 5 kez sorgula -> sonuç sayısı ve sırası 5'inde de BİREBİR AYNI olmalı!
    const runs = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      const r = await invokeController(searchVin, {
        params: { vin: 'VF1LB17C536060366' }
      });
      assert.strictEqual(r.statusCode, 200);
      assert.strictEqual(r.body.success, true);
      runs.push(r.body.compatibleParts);
    }

    const firstRun = runs[0];
    assert.ok(firstRun.length >= 45, `36 yaprak grup sınırı olmamalı, tüm yaprak gruplar taranmalı (Bulunan: ${firstRun.length})`);

    // "Front pad" (7701208122) mutlaka listede olmalı ve hem "front pad" hem "balata" aramasında çıkmalı
    const frontPadPart = firstRun.find((p) => p.oemCode === '7701208122');
    assert.ok(frontPadPart, 'parameters dizisi içeren "Front pad (7701208122)" parçası kesinlikle elenmemeli ve listede bulunmalı');
    assert.ok(
      frontPadPart.partName.toLowerCase().includes('front pad') &&
      frontPadPart.partName.toLowerCase().includes('balata'),
      `Front pad parça adı hem İngilizce hem Türkçe aramayı desteklemeli (Bulunan: "${frontPadPart.partName}")`
    );
    assert.strictEqual(frontPadPart.categoryGroup, 'Fren Sistemi');

    // Branch schemas üzerinden gelen yaprak grup parçası (7701207484) da listede olmalı
    const branchRearPad = firstRun.find((p) => p.oemCode === '7701207484');
    assert.ok(branchRearPad, 'Branch /schemas üzerinden gelen yaprak grubun parçaları da taranmalı');

    // Fren Sistemi parçaları (Front pad), aksesuar (Sunblind) parçalarından ÖNCE (listenin en üstünde) sıralanmalı
    const frontPadIndex = firstRun.findIndex((p) => p.oemCode === '7701208122');
    const sunblindIndex = firstRun.findIndex((p) => p.oemCode === '7701416288');
    assert.ok(frontPadIndex >= 0 && sunblindIndex > frontPadIndex, 'Fren Sistemi (Front pad) parçaları Sunblind gibi aksesuarlardan önce sıralanmalı');

    // 5 sorgunun tamamında parça sayısı ve parça sırası %100 aynı olmalı
    for (let i = 1; i < runs.length; i++) {
      assert.strictEqual(runs[i].length, firstRun.length, `Sorgu #${i + 1} parça sayısı (${runs[i].length}) ilk sorguyla (${firstRun.length}) birebir aynı olmalı`);
      assert.deepStrictEqual(runs[i], firstRun, `Sorgu #${i + 1} parça dizilimi ilk sorguyla birebir aynı olmalı`);
    }

    console.log(`  ✔ VF1LB17C536060366 için 5 ardışık sorguda sabit ${firstRun.length} uyumlu OEM parça döndü.`);
    console.log(`  ✔ İlk sıradaki parça: ${firstRun[0].partName} (${firstRun[0].oemCode}) [${firstRun[0].categoryGroup}]`);

    console.log('\n================================================================');
    console.log('✅ TÜM ŞASİ (VIN) -> OEM PARÇA AĞACI VE ÇAPRAZ EŞLEŞME TESTLERİ GEÇTİ (5/5)');
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
