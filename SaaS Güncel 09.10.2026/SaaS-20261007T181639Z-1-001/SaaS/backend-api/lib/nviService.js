// ============================================================================
// NVİ KPS Public SOAP TC Kimlik No Doğrulama Servisi (lib/nviService.js)
// Servis Adresi: https://tckimlik.nvi.gov.tr/Service/KPSPublic.asmx?WSDL
// ============================================================================

const soap = require('soap');
const path = require('path');

const REMOTE_WSDL_URL = 'https://tckimlik.nvi.gov.tr/Service/KPSPublic.asmx?WSDL';
const LOCAL_WSDL_PATH = path.join(__dirname, 'KPSPublic.wsdl');

/**
 * 11 Haneli T.C. Kimlik Numarası Algoritmik Doğrulama (Checksum)
 * Hacker ve botların rastgele sayılarla NVİ servisini DoS/Brute-force
 * bombardımanına tutmasını sıfır ağ gecikmesiyle engeller.
 * 
 * @param {string|number} tc 
 * @returns {boolean}
 */
function validateTcKimlikChecksum(tc) {
  if (!tc) return false;
  const str = String(tc).trim();
  
  // 11 haneli ve sadece rakamlardan oluşmalı, ilk hane '0' olamaz
  if (!/^[1-9][0-9]{10}$/.test(str)) {
    return false;
  }

  const digits = str.split('').map(Number);
  
  // 1, 3, 5, 7, 9. hanelerin toplamı
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  // 2, 4, 6, 8. hanelerin toplamı
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];

  // 10. hane kuralı: ((oddSum * 7) - evenSum) % 10
  let digit10 = ((oddSum * 7) - evenSum) % 10;
  if (digit10 < 0) digit10 += 10;
  if (digit10 !== digits[9]) {
    return false;
  }

  // 11. hane kuralı: İlk 10 hanenin toplamının mod 10'u
  const sumFirst10 = digits.slice(0, 10).reduce((acc, val) => acc + val, 0);
  if ((sumFirst10 % 10) !== digits[10]) {
    return false;
  }

  return true;
}

/**
 * Doğum Yılı Doğrulama (Sadece 4 haneli yıl, örn: 1990)
 * 
 * @param {string|number} year 
 * @returns {boolean}
 */
function validateBirthYear(year) {
  if (!year) return false;
  const str = String(year).trim();
  if (!/^[0-9]{4}$/.test(str)) {
    return false;
  }
  const num = parseInt(str, 10);
  const currentYear = new Date().getFullYear();
  return num >= 1900 && num <= currentYear;
}

/**
 * Türkçe Karakterleri Koruyarak Tamamen Büyük Harfe Dönüştürme Filtresi
 * NVİ KPS servisi Türkçe karakter duyarlılığına ('i' -> 'İ', 'ı' -> 'I') son derece hassastır.
 * 
 * @param {string} text 
 * @returns {string}
 */
function formatTurkishUpper(text) {
  if (!text || typeof text !== 'string') return '';
  // Script bloklarını temizle
  let clean = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Kalan HTML etiketlerini temizle
  clean = clean.replace(/<[^>]*>?/gm, '');
  // Sadece Türkçe/Latin harfler ve boşluklara izin ver (Özel karakter, SQL veya script injection engeli)
  clean = clean.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ\s]/g, '');
  // Çoklu boşlukları tek boşluğa indir
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean.toLocaleUpperCase('tr-TR');
}

let cachedSoapClient = null;

/**
 * SOAP İstemcisini Başlatır (Remote WSDL öncelikli, fallback olarak yerel WSDL)
 */
async function getSoapClient() {
  if (cachedSoapClient) {
    return cachedSoapClient;
  }

  const options = {
    timeout: 8000,
    connection: 'keep-alive'
  };

  try {
    cachedSoapClient = await soap.createClientAsync(REMOTE_WSDL_URL, options);
    return cachedSoapClient;
  } catch (remoteErr) {
    // Uzak WSDL bağlantı hatasında yerel WSDL şemasını kullanarak doğrudan servis uç noktasına bağlanır
    try {
      cachedSoapClient = await soap.createClientAsync(LOCAL_WSDL_PATH, options);
      return cachedSoapClient;
    } catch (localErr) {
      console.error('[NVI_SOAP_INIT_ERROR]:', localErr);
      throw localErr;
    }
  }
}

/**
 * T.C. İçişleri Bakanlığı NVİ KPSPublic SOAP Servisi ile Kimlik Doğrulama
 * 
 * @param {Object} params
 * @param {string|number} params.tcKimlikNo - 11 Haneli T.C. Kimlik Numarası
 * @param {string} params.ad - İsim
 * @param {string} params.soyad - Soyisim
 * @param {string|number} params.dogumYili - 4 Haneli Doğum Yılı (Örn: 1990)
 * @returns {Promise<boolean>} Doğrulama başarılı ise true, aksi halde false
 */
async function verifyTcKimlikWithNvi({ tcKimlikNo, ad, soyad, dogumYili }) {
  // 1. ZORUNLU ALAN KONTROLLERİ: 4 verinin de boş olmadığından emin ol
  if (!tcKimlikNo || !ad || !soyad || !dogumYili) {
    return false;
  }

  const cleanTcStr = String(tcKimlikNo).trim();
  const cleanAd = formatTurkishUpper(ad);
  const cleanSoyad = formatTurkishUpper(soyad);
  const cleanDogumYili = parseInt(String(dogumYili).trim(), 10);

  if (cleanTcStr === '' || cleanAd === '' || cleanSoyad === '' || isNaN(cleanDogumYili)) {
    return false;
  }

  // 2. GÜVENLİK ÖN KONTROLÜ (Hacker & Bot Önleme):
  // Doğum yılı 4 haneli olmalı
  if (!validateBirthYear(cleanDogumYili)) {
    return false;
  }

  // T.C. Kimlik algoritması tutmuyorsa servise istek göndermeden anında reddet
  if (!validateTcKimlikChecksum(cleanTcStr)) {
    return false;
  }

  // 3. TEST VE GELİŞTİRME ORTAMI GEÇİŞİ
  // Test ortamlarında veya izole simülasyonlarda sabit geçerli/geçersiz test verisi desteği
  if (process.env.NODE_ENV === 'test' || process.env.MOCK_NVI === 'true') {
    // Algoritması geçerli ve bilinen test TC'leri için başarılı kabul et
    if (cleanTcStr === '10000000146' || cleanTcStr === '11111111110' || cleanTcStr.endsWith('00')) {
      return true;
    }
  }

  // 4. CANLI DEVLET (NVİ) SOAP SERVİS ÇAĞRISI
  try {
    const client = await getSoapClient();
    
    const requestArgs = {
      TCKimlikNo: Number(cleanTcStr),
      Ad: cleanAd,
      Soyad: cleanSoyad,
      DogumYili: cleanDogumYili
    };

    // Zaman aşımı korumalı SOAP çağrısı (6 saniye)
    const callPromise = client.TCKimlikNoDogrulaAsync(requestArgs);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('NVİ KPS SOAP servisi zaman aşımına uğradı (Timeout)')), 6000);
    });

    const [response] = await Promise.race([callPromise, timeoutPromise]);
    
    if (response && response.TCKimlikNoDogrulaResult === true) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('[NVI_SERVICE_CALL_ERROR]:', error.message || error);
    // Kural: "Eğer NVİ'den dönen sonuç false ise (veya servis hata verirse)... false dön"
    return false;
  }
}

module.exports = {
  verifyTcKimlikWithNvi,
  validateTcKimlikChecksum,
  validateBirthYear,
  formatTurkishUpper
};
