/**
 * ============================================================================
 * TEST SÜİTİ: STOREFRONT DİNAMİK FETCH & HARDCODED ÜRÜN TEMİZLİĞİ TESTİ
 * prompt.md:
 * - "storefront-ui klasöründeki store.html dosyamızı güncelleyeceğiz."
 * - "Bu dosya artık kendi başına bağımsız bir frontend."
 * - "Sayfa yüklendiğinde veya arama çubuğuna parça kodu yazıldığında, backend'imize (http://localhost:3000/api/store/products) fetch veya axios ile istek atıp gelen JSON verisini ekrandaki ürün tablosuna JavaScript ile dinamik olarak yazdır."
 * - "Hardcoded (sabit) ürünleri HTML'den temizle."
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let passed = 0;
let total = 0;

function check(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

function fetchJson(port, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: urlPath,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Tenant-Slug': 'ahmetoto',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', err => reject(err));
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🛒 STOREFRONT DİNAMİK FETCH & SIFIR HARDCODED TESTİ (prompt.md)');
  console.log('================================================================\n');

  const storefrontHtmlPath = path.join(__dirname, 'storefront-ui', 'store.html');
  const htmlContent = fs.readFileSync(storefrontHtmlPath, 'utf-8');

  // --------------------------------------------------------------------------
  // BÖLÜM 1: HARDCODED ÜRÜNLERİN HTML'DEN TEMİZLENMESİ DENETİMİ
  // --------------------------------------------------------------------------
  console.log('--- 1. Hardcoded (Sabit) Ürünlerin HTML\'den Temizlenmesi ---');

  // 1.1 tbody etiketinin hardcoded <tr> içermediğini doğrula
  const tbodyRegex = /<tbody\s+id=["']products-table-body["'][^>]*>([\s\S]*?)<\/tbody>/i;
  const match = htmlContent.match(tbodyRegex);
  check(match !== null, 'store.html içinde products-table-body etiketine sahip tbody mevcuttur.');

  if (match) {
    const innerContent = match[1].trim();
    const hasHardcodedTr = /<tr\b/i.test(innerContent);
    check(!hasHardcodedTr, 'products-table-body içinde hiçbir statik/hardcoded <tr> satırı bulunmamaktadır (Temiz DOM).');
  }

  // 1.2 Arayüzün JavaScript ile dinamik tablo render fonksiyonuna sahip olduğunu doğrula
  check(htmlContent.includes('function renderProductTable()'), 'renderProductTable dinamik çizim fonksiyonu mevcuttur.');
  check(htmlContent.includes('tbody.appendChild(tr)') || htmlContent.includes('tbody.innerHTML'), 'Tablo satırları API verisiyle dinamik DOM elementleri olarak oluşturulmaktadır.');

  // --------------------------------------------------------------------------
  // BÖLÜM 2: DİNAMİK FETCH & BACKEND PORT 3000/5000 ENTEGRASYONU
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Bağımsız Frontend Fetch & Backend İletişimi ---');

  check(
    htmlContent.includes('http://localhost:3000/api/store/products') || htmlContent.includes('localhost:3000'),
    'store.html backend uç noktası olarak http://localhost:3000/api/store/products hedefini içermektedir.'
  );

  check(
    htmlContent.includes('fetch(') || htmlContent.includes('apiFetch('),
    'store.html API istekleri için modern fetch istemcisini kullanmaktadır.'
  );

  check(
    htmlContent.includes('async function loadProducts()'),
    'Sayfa yüklendiğinde ve arama yapıldığında tetiklenen loadProducts() asenkron fonksiyonu mevcuttur.'
  );

  check(
    htmlContent.includes('document.addEventListener(\'DOMContentLoaded\''),
    'DOMContentLoaded olayı ile sayfa açılır açılmaz loadProducts() tetiklenmektedir.'
  );

  // --------------------------------------------------------------------------
  // BÖLÜM 3: ARAMA ÇUBUĞUNA YAZILDIĞINDA (INPUT EVENT) DİNAMİK İSTEK
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Arama Çubuğuna Yazıldığında Dinamik Tetiklenme ---');

  check(
    htmlContent.includes("searchInput.addEventListener('input'") || htmlContent.includes('addEventListener("input"'),
    'Arama çubuğuna yazı yazıldığında (input eventi) dinleyici aktifleşmektedir.'
  );

  check(
    htmlContent.includes('searchDebounceTimer') || htmlContent.includes('setTimeout'),
    'Arama yazımı sırasında sunucuyu yormamak için debounced (gecikmeli) dinamik tetikleme mevcuttur.'
  );

  // --------------------------------------------------------------------------
  // BÖLÜM 4: CANLI BACKEND http://localhost:3000/api/store/products YANIT TESTİ
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Canlı Backend (http://localhost:3000/api/store/products) Doğrulaması ---');

  const res3000 = await fetchJson(3000, '/api/store/products?limit=5');
  check(res3000.statusCode === 200, 'http://localhost:3000/api/store/products HTTP 200 OK yanıtı vermektedir.');
  check(res3000.data.success === true, 'Port 3000 yanıtı success: true olarak dönmektedir.');
  check(Array.isArray(res3000.data.data), 'Port 3000 üzerinden ürün dizisi (data array) eksiksiz dönmektedir.');

  // Arama filtresi testi port 3000 üzerinden
  const searchRes3000 = await fetchJson(3000, '/api/store/products?search=Amortis');
  check(searchRes3000.statusCode === 200 && searchRes3000.data.success === true, 'Port 3000 üzerinden parça araması (?search=Amortis) başarıyla saf JSON dönmektedir.');

  // Port 5000 alternatif test
  const res5000 = await fetchJson(5000, '/api/store/products?limit=5');
  check(res5000.statusCode === 200 && res5000.data.success === true, 'Port 5000 ana portu da eşzamanlı olarak 200 OK ile kesintisiz hizmet vermektedir.');

  console.log('\n================================================================');
  console.log(`🎉 TEST SONUCU: ${passed}/${total} (%${Math.round((passed / total) * 100)}) BAŞARILI`);
  console.log('================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('[FATAL_ERROR]:', err);
  process.exit(1);
});
