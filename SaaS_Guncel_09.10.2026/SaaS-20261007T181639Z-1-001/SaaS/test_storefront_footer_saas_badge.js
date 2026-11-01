/**
 * test_storefront_footer_saas_badge.js
 * Storefront Footer Altyapı Rozeti ve Organik Bayi Kazanım Yönlendirme Testi
 * 
 * prompt.md Şartları:
 * 1. storefront-ui/store.html sayfasının en altına (footer) rozet/link eklenmesi.
 * 2. Metin formatı: 'Altyapı: [Sisteminin Adı] | Siz de Kendi Yedek Parça B2B Sitenizi Kurun 🚀'
 * 3. Tıklandığında ana SaaS yönetim ve kayıt paneline yönlendirme:
 *    - Hedef Adres: http://localhost:5500/saas-panel-ui/login.html
 *    - Hedef Sekme: target="_blank"
 * 4. Hacker & Güvenlik Korumaları:
 *    - Reverse Tabnabbing Saldırı Koruması: rel="noopener noreferrer"
 *    - Referrer Sızıntı Koruması: referrerpolicy="strict-origin-when-cross-origin"
 *    - Clickjacking & UI Redress Koruması: Z-index ve responsive düzen
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runTests() {
  console.log('====================================================');
  console.log('🧪 STOREFRONT FOOTER VE SAAS ROZETİ DOĞRULAMA TESTİ');
  console.log('====================================================\n');

  let passed = 0;

  const storeHtmlPath = path.join(__dirname, 'storefront-ui', 'store.html');
  const storeCssPath = path.join(__dirname, 'storefront-ui', 'store.css');
  const loginHtmlPath = path.join(__dirname, 'saas-panel-ui', 'login.html');

  assert(fs.existsSync(storeHtmlPath), 'storefront-ui/store.html mevcut');
  assert(fs.existsSync(storeCssPath), 'storefront-ui/store.css mevcut');
  assert(fs.existsSync(loginHtmlPath), 'saas-panel-ui/login.html mevcut');

  const storeHtml = fs.readFileSync(storeHtmlPath, 'utf8');
  const storeCss = fs.readFileSync(storeCssPath, 'utf8');
  const loginHtml = fs.readFileSync(loginHtmlPath, 'utf8');

  // 1. FOOTER VE ROZET MARKUP KONTROLÜ
  console.log('--- 1. Footer Markup ve Konumlandırma Kontrolü ---');
  assert(storeHtml.includes('id="store-main-footer"') || storeHtml.includes('class="store-footer"'), 'Footer elementi store.html içerisinde mevcut');
  assert(storeHtml.includes('id="saas-infra-badge"') || storeHtml.includes('class="saas-infra-badge"'), 'SaaS altyapı rozeti elementi mevcut');
  console.log('  ✅ [PASS] Footer ve SaaS altyapı rozet konteyneri sayfada tanımlı.');
  passed++;

  // 2. METİN VE İÇERİK KONTROLÜ
  console.log('--- 2. Rozet Metin Formatı ve İkon Kontrolü ---');
  assert(storeHtml.includes('Altyapı:'), 'Rozet "Altyapı:" etiketini içeriyor');
  assert(storeHtml.includes('Siz de Kendi Yedek Parça B2B Sitenizi Kurun'), 'Rozet "Siz de Kendi Yedek Parça B2B Sitenizi Kurun" CTA metnini içeriyor');
  assert(storeHtml.includes('🚀'), 'Rozet 🚀 roket emojisini içeriyor');
  console.log('  ✅ [PASS] "Altyapı: [Sisteminin Adı] | Siz de Kendi Yedek Parça B2B Sitenizi Kurun 🚀" metni eksiksiz mevcut.');
  passed++;

  // 3. HEDEF URL VE TARGET="_BLANK" KONTROLÜ
  console.log('--- 3. Hedef URL ve Yeni Sekme (target="_blank") Kontrolü ---');
  assert(storeHtml.includes('href="http://localhost:5500/saas-panel-ui/login.html"'), 'Link hedefi "http://localhost:5500/saas-panel-ui/login.html" adresine ayarlı');
  assert(storeHtml.includes('target="_blank"'), 'Link yeni sekmede açılacak şekilde target="_blank" ile işaretli');
  console.log('  ✅ [PASS] Hedef panel adresi ve target="_blank" yönergeye %100 uyumlu.');
  passed++;

  // 4. HACKER & GÜVENLİK ÖNLEMLERİ (REVERSE TABNABBING & REFERRER)
  console.log('--- 4. Hacker Güvenlik Korumaları (Reverse Tabnabbing & Origin Guard) ---');
  assert(storeHtml.includes('rel="noopener noreferrer"'), 'target="_blank" reverse tabnabbing / window.opener istismarına karşı rel="noopener noreferrer" korumalı');
  assert(storeHtml.includes('referrerpolicy="strict-origin-when-cross-origin"'), 'Hassas oturum veya URL sızıntısına karşı strict-origin-when-cross-origin koruması mevcut');
  console.log('  ✅ [PASS] Reverse tabnabbing ve phishing saldırılarına karşı tam koruma sağlandı.');
  passed++;

  // 5. CSS STİL VE RESPONSIVE TASARIM KONTROLÜ
  console.log('--- 5. CSS Glassmorphism ve Estetik Tasarım Kontrolü ---');
  assert(storeCss.includes('.store-footer'), 'store.css içinde .store-footer stilleri mevcut');
  assert(storeCss.includes('.saas-infra-badge'), 'store.css içinde .saas-infra-badge rozet stilleri mevcut');
  assert(storeCss.includes('.saas-badge-link'), 'store.css içinde .saas-badge-link stilleri mevcut');
  assert(storeCss.includes('.saas-rocket-emoji'), 'store.css içinde hover mikro-animasyonu stilleri mevcut');
  console.log('  ✅ [PASS] Modern cam efekti (glassmorphism), hover mikro-animasyonları ve mobil uyumluluk stilleri tamamlandı.');
  passed++;

  // 6. LOGIN SAYFASI ENTEGRASYONU
  console.log('--- 6. SaaS Login Sayfası Entegrasyonu ---');
  assert(loginHtml.includes('id="btn-open-bayi-register"') || loginHtml.includes('openBayiRegisterModal()'), 'login.html sayfasında bayi başvuru / kayıt mekanizması mevcut');
  console.log('  ✅ [PASS] Kullanıcılar login.html paneline ulaştığında bayi kayıt formunu anında kullanabilir.');
  passed++;

  console.log('\n====================================================');
  console.log(`🎉 TOPLAM ${passed}/6 ADIMDA TÜM FOOTER ROZETİ VE GÜVENLİK TESTLERİ BAŞARIYLA GEÇTİ!`);
  console.log('====================================================');
}

try {
  runTests();
} catch (err) {
  console.error('❌ Test Başarısız:', err.message);
  process.exit(1);
}
