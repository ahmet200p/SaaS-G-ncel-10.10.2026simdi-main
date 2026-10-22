/**
 * test_nvi_verification.js
 * NVİ (Devlet Nüfus ve Vatandaşlık İşleri) T.C. Kimlik Doğrulama Kapsamlı Testi
 * 
 * 1. Türkçe Karakter Büyütme & Sanitization
 * 2. 4 Haneli Doğum Yılı Format Doğrulaması
 * 3. 11 Haneli TC Kimlik Checksum Algoritması (Anti-DoS Koruması)
 * 4. Boş Veri ve Hatalı Kayıt Fail-Secure İlkesi
 * 5. KPSPublic SOAP Web Servis Bağlantı & Entegrasyon Kontrolü
 */

const assert = require('assert');
const path = require('path');
const {
  validateTcKimlikChecksum,
  validateBirthYear,
  formatTurkishUpper,
  verifyTcKimlikWithNvi
} = require('./backend-api/lib/nviService');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 NVİ (DEVLET NÜFUS VE VATANDAŞLIK İŞLERİ) DOĞRULAMA TESTİ');
  console.log('====================================================\n');

  let passed = 0;

  // 1. Türkçe Karakter Büyütme
  console.log('--- 1. Türkçe Büyük Harf ve Güvenlik Sanitization ---');
  assert.strictEqual(formatTurkishUpper('İlçi'), 'İLÇİ', "İlçi kelimesi İLÇİ olarak dönüştürülmelidir");
  assert.strictEqual(formatTurkishUpper('ilker'), 'İLKER');
  assert.strictEqual(formatTurkishUpper('ışıl'), 'IŞIL');
  assert.strictEqual(formatTurkishUpper('çetin şahin'), 'ÇETİN ŞAHİN');
  assert.strictEqual(formatTurkishUpper('ahmet hadi ilçi'), 'AHMET HADİ İLÇİ');
  assert.strictEqual(formatTurkishUpper('   ömer güler   '), 'ÖMER GÜLER');
  assert.strictEqual(formatTurkishUpper('<script>alert("hack")</script>ali'), 'ALİ');
  console.log('  ✅ [PASS] i/İ, ı/I, İlçi -> İLÇİ dönüşümleri ve XSS script temizleme başarılı.');
  passed++;

  // 2. Doğum Yılı Formatı (Kesinlikle 4 hane olmalı)
  console.log('--- 2. Doğum Yılı Formatı (4 Haneli Yıl Kontrolü) ---');
  assert.strictEqual(validateBirthYear('1990'), true);
  assert.strictEqual(validateBirthYear(1985), true);
  assert.strictEqual(validateBirthYear('199'), false, '3 hane kabul edilemez');
  assert.strictEqual(validateBirthYear('19901'), false, '5 hane kabul edilemez');
  assert.strictEqual(validateBirthYear('abcd'), false, 'Harf kabul edilemez');
  assert.strictEqual(validateBirthYear(''), false, 'Boş yıl kabul edilemez');
  assert.strictEqual(validateBirthYear('1899'), false, '1900 öncesi kabul edilemez');
  console.log('  ✅ [PASS] Doğum yılı format kısıtlaması (YYYY) tam korumalı.');
  passed++;

  // 3. TC Algoritmik Checksum Doğrulaması (DoS Engeli)
  console.log('--- 3. TC Algoritmik Checksum ve Botnet Engeli ---');
  assert.strictEqual(validateTcKimlikChecksum('10000000146'), true);
  assert.strictEqual(validateTcKimlikChecksum('11111111110'), true);
  assert.strictEqual(validateTcKimlikChecksum('01234567890'), false, '0 ile başlayamaz');
  assert.strictEqual(validateTcKimlikChecksum('12345678901'), false, 'Algoritma tutarsız');
  assert.strictEqual(validateTcKimlikChecksum('10000000145'), false, '11. hane tutarsız');
  assert.strictEqual(validateTcKimlikChecksum('abc'), false);
  console.log('  ✅ [PASS] Sahte TC numaraları mikro-saniyede eleniyor (NVİ DoS saldırısı önlendi).');
  passed++;

  // 4. Fail-Secure İlkesi (Boş veya Hatalı Değerlerde Kayıt İptali)
  console.log('--- 4. Fail-Secure İlkesi & 4 Zorunlu Alan Kontrolü ---');
  const resEmptyTc = await verifyTcKimlikWithNvi({ tcKimlikNo: '', ad: 'Ahmet', soyad: 'Kaya', dogumYili: '1990' });
  assert.strictEqual(resEmptyTc, false);

  const resEmptyAd = await verifyTcKimlikWithNvi({ tcKimlikNo: '10000000146', ad: '', soyad: 'Kaya', dogumYili: '1990' });
  assert.strictEqual(resEmptyAd, false);

  const resEmptySoyad = await verifyTcKimlikWithNvi({ tcKimlikNo: '10000000146', ad: 'Ahmet', soyad: '', dogumYili: '1990' });
  assert.strictEqual(resEmptySoyad, false);

  const resEmptyDogum = await verifyTcKimlikWithNvi({ tcKimlikNo: '10000000146', ad: 'Ahmet', soyad: 'Kaya', dogumYili: '' });
  assert.strictEqual(resEmptyDogum, false);

  console.log('  ✅ [PASS] 4 alandan herhangi biri eksik veya hatalı olduğunda kayıt kesinlikle bloke ediliyor.');
  passed++;

  // 5. Hem Nesne Hem Sıralı Parametre Desteği & Türkçe Karakter ile Doğrulama
  console.log('--- 5. Türkçe İsim (İlçi) ve Parametre Uyumluluk Testi ---');
  const resObject = await verifyTcKimlikWithNvi({
    tcKimlikNo: '10000000146',
    ad: 'İlçi',
    soyad: 'İlçi',
    dogumYili: 1990
  });
  assert.strictEqual(resObject, true, 'Geçerli TC ve İlçi ismi doğrulanmalıdır');

  const resPositional = await verifyTcKimlikWithNvi('10000000146', 'İlçi', 'İlçi', 1990);
  assert.strictEqual(resPositional, true, 'Sıralı 4 parametre çağrısı başarıyla çalışmalıdır');

  const resInvalidTc = await verifyTcKimlikWithNvi({
    tcKimlikNo: '12345678901',
    ad: 'İlçi',
    soyad: 'İlçi',
    dogumYili: 1990
  });
  assert.strictEqual(resInvalidTc, false, 'Geçersiz TC checksum derhal reddedilmelidir');
  console.log('  ✅ [PASS] İlçi -> İLÇİ dönüşümü, nesne ve sıralı parametre çağrıları başarıyla doğrulandı.');
  passed++;

  console.log('\n====================================================');
  console.log(`🎉 TOPLAM ${passed}/5 ADIMDA TÜM NVİ GÜVENLİK TESTLERİ BAŞARIYLA GEÇTİ!`);
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('❌ NVİ Test Hatası:', err);
  process.exit(1);
});
