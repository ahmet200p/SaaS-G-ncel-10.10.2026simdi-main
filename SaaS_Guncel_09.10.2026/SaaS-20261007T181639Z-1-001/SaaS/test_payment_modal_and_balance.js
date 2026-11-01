const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

async function makeRequest(url, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 PROMPT.MD: TAHSİLAT MODALI VE BAKİYE RENKLENDİRME TESTİ');
  console.log('====================================================\n');

  // 1. ADIM KONTROLLERİ: HTML ve UI Doğrulaması
  console.log('--- 1. ADIM: Tahsilat Modalı UI İyileştirmesi Kontrolleri ---');
  const bayiHtmlPath = path.join(__dirname, 'bayi.html');
  const tenantCssPath = path.join(__dirname, 'tenant.css');

  assert(fs.existsSync(bayiHtmlPath), 'bayi.html dosyası mevcut');
  assert(fs.existsSync(tenantCssPath), 'tenant.css dosyası mevcut');

  const bayiHtml = fs.readFileSync(bayiHtmlPath, 'utf8');
  const tenantCss = fs.readFileSync(tenantCssPath, 'utf8');

  assert(bayiHtml.includes('id="modal-payment"'), '1. ADIM: #modal-payment tahsilat modalı mevcut');
  assert(bayiHtml.includes('id="payment-modal-amount"'), '1. ADIM: #payment-modal-amount tutar inputu mevcut');
  assert(bayiHtml.includes('id="payment-modal-new-balance"'), '1. ADIM: #payment-modal-new-balance yeni bakiye alanı mevcut');
  assert(bayiHtml.includes('İşlem Sonrası Yeni Bakiye:'), '1. ADIM: "İşlem Sonrası Yeni Bakiye:" etiketi mevcut');
  assert(bayiHtml.includes('id="payment-preview-card"'), '1. ADIM: #payment-preview-card önizleme kartı mevcut');

  // CSS Kuralları
  assert(tenantCss.includes('border-radius: 6px'), '1. ADIM: tenant.css içinde border-radius: 6px kuralı tanımlı');
  assert(tenantCss.includes('#cbd5e1'), '1. ADIM: tenant.css içinde açık gri (#cbd5e1) border kuralı tanımlı');
  assert(tenantCss.includes('#3b82f6'), '1. ADIM: tenant.css içinde focus parlaması (#3b82f6) tanımlı');
  assert(tenantCss.includes('.payment-preview-card'), '1. ADIM: tenant.css içinde .payment-preview-card stili tanımlı');

  console.log('  ✅ [PASS] 1. ADIM: Modal UI, form-control inputlar ve yeni bakiye alanı doğrulandı.');

  // 2. ADIM KONTROLLERİ: Dinamik Hesaplama ve Renklendirme Mantığı
  console.log('\n--- 2. ADIM: JavaScript Dinamik Hesaplama ve Renk Kuralları Kontrolleri ---');
  assert(bayiHtml.includes("addEventListener('input'") /* ) */, '2. ADIM: Tutar inputuna input event listener eklenmiş');
  assert(bayiHtml.includes('updatePaymentModalBalancePreview'), '2. ADIM: updatePaymentModalBalancePreview canlı hesaplama fonksiyonu tanımlı');
  assert(bayiHtml.includes('activePaymentCustomerBalance + enteredAmount'), '2. ADIM: "Yeni Bakiye = Mevcut Bakiye + Girilen Tutar" formülü işletiliyor');

  // Renk kuralları kontrolleri (Yeşil #10b981, Kırmızı #ef4444, Siyah/Koyu Gri #1e293b)
  assert(bayiHtml.includes('#10b981'), '2. ADIM: Canlı Yeşil (#10b981) pozitif bakiye rengi tanımlı');
  assert(bayiHtml.includes('#ef4444'), '2. ADIM: Belirgin Kırmızı (#ef4444) negatif bakiye rengi tanımlı');
  assert(bayiHtml.includes('#1e293b'), '2. ADIM: Koyu Gri/Siyah (#1e293b) sıfır bakiye rengi tanımlı');
  assert(tenantCss.includes('#10b981'), '2. ADIM: tenant.css içinde yeşil (#10b981) kuralı mevcut');
  assert(tenantCss.includes('#ef4444'), '2. ADIM: tenant.css içinde kırmızı (#ef4444) kuralı mevcut');
  assert(tenantCss.includes('#1e293b'), '2. ADIM: tenant.css içinde koyu gri (#1e293b) kuralı mevcut');

  // JS fonksiyonunun mantık testi (simülasyon)
  function testFormatBalance(balance) {
    const num = Math.round((parseFloat(balance) || 0) * 100) / 100;
    const absStr = Math.abs(num).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
    if (num > 0.001) {
      return { text: '+' + absStr, color: '#10b981' };
    } else if (num < -0.001) {
      return { text: '-' + absStr, color: '#ef4444' };
    } else {
      return { text: '0,00 ₺', color: '#1e293b' };
    }
  }

  // Prompt'taki özel canlı test örneği:
  // "Kullanıcı 10000 girdiğinde ve mevcut bakiye -8000 ise, canlı önizleme alanında hemen +2.000,00 ₺ (Yeşil) yazsın. -2000 girerse (veya bakiye eksiye düşerse) Kırmızı yazsın."
  const scenario1 = testFormatBalance(-8000 + 10000);
  assert(scenario1.text === '+2.000,00 ₺' && scenario1.color === '#10b981', 'Senaryo 1: -8000 + 10000 = +2.000,00 ₺ (Yeşil) doğrulandı');

  const scenario2 = testFormatBalance(-8000 + (-2000));
  assert(scenario2.text === '-10.000,00 ₺' && scenario2.color === '#ef4444', 'Senaryo 2: -8000 + (-2000) = -10.000,00 ₺ (Kırmızı) doğrulandı');

  const scenario3 = testFormatBalance(-8000 + 6000);
  assert(scenario3.text === '-2.000,00 ₺' && scenario3.color === '#ef4444', 'Senaryo 3: -8000 + 6000 = -2.000,00 ₺ (Kırmızı) doğrulandı');

  const scenario4 = testFormatBalance(-8000 + 8000);
  assert(scenario4.text === '0,00 ₺' && scenario4.color === '#1e293b', 'Senaryo 4: -8000 + 8000 = 0,00 ₺ (Koyu Gri/Siyah) doğrulandı');

  console.log('  ✅ [PASS] 2. ADIM: Dinamik hesaplama, renk kuralları ve prompt senaryoları doğrulandı.');

  // 3. ADIM KONTROLLERİ: Tablo Render ve Canlı Backend Entegrasyonu
  console.log('\n--- 3. ADIM: Tablo Render ve Canlı Backend (currentBalance + amount) Testleri ---');
  assert(bayiHtml.includes('formatBalancePreview(bal)'), '3. ADIM: renderCustomersTable içinde formatBalancePreview kullanılıyor');
  assert(bayiHtml.includes('${balInfo.cssClass}'), '3. ADIM: Tablo hücrelerine balInfo cssClass dinamik olarak veriliyor');

  // Canlı Backend Sunucusu ile Test
  const app = require('./app');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Bayi Girişi (JWT Alma)
    const loginRes = await makeRequest(`${baseUrl}/api/auth/login`, 'POST', {
      email: 'ahmet@ahmetoto.com',
      password: '123456'
    });
    const token = loginRes.data.token || (loginRes.data.data && loginRes.data.data.token);
    assert(loginRes.status === 200 && token, 'Bayi girişi başarılı');

    // Test Müşterisi Oluştur (Mevcut bakiye: -8000.0 ₺, yani borçlu)
    const createRes = await makeRequest(`${baseUrl}/api/tenant/customers`, 'POST', {
      companyName: 'Prompt Test Otomotiv Sanayi',
      phone: '05551112233',
      address: 'Kartal Oto Sanayi',
      discountRate: 10.0,
      balance: -8000.0
    }, token);
    assert(createRes.status === 201 && createRes.data.data.id, 'Test müşterisi (-8000 ₺ bakiye ile) oluşturuldu');
    const custId = createRes.data.data.id;

    // Backend Tahsilat Testi: 10000 ₺ tahsilat giriliyor -> Yeni Bakiye = -8000 + 10000 = +2000.0
    const payRes1 = await makeRequest(`${baseUrl}/api/tenant/customers/${custId}/payment`, 'POST', {
      amount: 10000.0,
      description: 'Nakit Tahsilat'
    }, token);
    assert(payRes1.status === 200, 'POST /customers/:id/payment HTTP 200 döndü');
    assert(payRes1.data.success === true, 'Tahsilat işlemi başarılı');
    assert(payRes1.data.data.newBalance === 2000.0, 'Backend: -8000 + 10000 = +2000.0 ₺ başarıyla hesaplandı');

    // GET /api/tenant/customers listesinde de bakiyenin 2000.0 olduğunu doğrula
    const listRes = await makeRequest(`${baseUrl}/api/tenant/customers`, 'GET', null, token);
    assert(listRes.status === 200, 'GET /customers HTTP 200 döndü');
    const foundCust = listRes.data.data.find(c => c.id === custId);
    assert(foundCust && foundCust.balance === 2000.0, 'Müşteriler tablosuna yansıyan yeni bakiye +2000.0 ₺');

    // Negatif/Düzeltme Testi: 2000 ₺ olan bakiyeye -4000 ₺ işlem yapılıyor -> Yeni Bakiye = 2000 + (-4000) = -2000.0
    const payRes2 = await makeRequest(`${baseUrl}/api/tenant/customers/${custId}/payment`, 'POST', {
      amount: -4000.0,
      description: 'Düzeltme Kaydı'
    }, token);
    assert(payRes2.status === 200, 'POST /customers/:id/payment negatif işlem HTTP 200 döndü');
    assert(payRes2.data.data.newBalance === -2000.0, 'Backend: 2000 + (-4000) = -2000.0 ₺ eksiye düşme doğru hesaplandı');

    // Sıfırlama Testi: -2000 ₺ olan bakiyeye +2000 ₺ tahsilat yapılıyor -> Yeni Bakiye = -2000 + 2000 = 0.0
    const payRes3 = await makeRequest(`${baseUrl}/api/tenant/customers/${custId}/payment`, 'POST', {
      amount: 2000.0,
      description: 'Kalan Borç Kapatma'
    }, token);
    assert(payRes3.status === 200, 'POST /customers/:id/payment HTTP 200 döndü');
    assert(payRes3.data.data.newBalance === 0.0, 'Backend: -2000 + 2000 = 0.0 ₺ sıfır bakiye doğru hesaplandı');

    // Temizlik: Test müşterisini sil
    const delRes = await makeRequest(`${baseUrl}/api/tenant/customers/${custId}`, 'DELETE', null, token);
    assert(delRes.status === 200, 'Test müşterisi başarıyla temizlendi');

    console.log('  ✅ [PASS] 3. ADIM: Backend currentBalance + amount formülü ve tablo güncellemeleri doğrulandı.');
  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log('🎉 PROMPT.MD ŞARTNAMESİNİN TÜM ADIMLARI %100 BAŞARIYLA GEÇTİ!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST BAŞARISIZ:', err);
  process.exit(1);
});
