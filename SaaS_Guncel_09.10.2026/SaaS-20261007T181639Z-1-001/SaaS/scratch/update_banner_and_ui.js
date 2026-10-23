const fs = require('fs');
const path = require('path');

// 1. Update saas-panel-ui/style.css
const styleCssPath = path.join(__dirname, '../saas-panel-ui/style.css');
let styleCss = fs.readFileSync(styleCssPath, 'utf8');

const newBannerStyles = `/* Parts-Catalogs Entegrasyon Bilgi Kutusu (Aktif & Güven Veren Tasarım) */
.integration-active-banner,
.under-construction-banner {
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #d1fae5 100%);
  border: 1px solid #a7f3d0;
  border-radius: var(--radius-lg, 12px);
  padding: 22px 26px;
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
  box-shadow: 0 4px 15px -3px rgba(16, 185, 129, 0.12), 0 2px 6px -2px rgba(16, 185, 129, 0.08);
}

.integration-icon-box,
.construction-icon-box {
  width: 56px;
  height: 56px;
  background: #dcfce7;
  color: #059669;
  border-radius: var(--radius-md, 10px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.18);
}

.integration-text,
.construction-text {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.integration-badge,
.construction-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  background: #059669;
  color: #ffffff;
  padding: 3px 10px;
  border-radius: 20px;
  width: fit-content;
  letter-spacing: 0.3px;
}

.integration-title,
.construction-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #065f46;
}

.integration-desc,
.construction-desc {
  font-size: 0.85rem;
  color: #047857;
  line-height: 1.48;
}
`;

// Replace old construction styles in style.css
const oldBannerRegex = /\/\* Yapım Aşamasında Bilgilendirme Kutusu \*\/[\s\S]*?\.construction-desc \{[\s\S]*?\}/;
if (oldBannerRegex.test(styleCss)) {
  styleCss = styleCss.replace(oldBannerRegex, newBannerStyles);
  fs.writeFileSync(styleCssPath, styleCss, 'utf8');
  console.log('Updated saas-panel-ui/style.css');
}

// 2. HTML Banner Markup
const newBannerHtml = `      <!-- Parts-Catalogs Entegrasyon Bilgi Kutusu -->
      <div class="integration-active-banner">
        <div class="integration-icon-box">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path>
            <path d="m9 12 2 2 4-4"></path>
          </svg>
        </div>
        <div class="integration-text">
          <div class="integration-badge">
            <span style="width: 7px; height: 7px; border-radius: 50%; background: #4ade80; display: inline-block;"></span>
            Entegrasyon Başarılı
          </div>
          <h4 class="integration-title">Merkezi Parça Havuzu & Parts-Catalogs Entegrasyonu Aktif</h4>
          <p class="integration-desc">Bu modül, Parts-Catalogs API altyapısı ile tam entegre çalışmaktadır. Tüm şasi (VIN) ve orijinal yedek parça (OE) sorgulamalarınız küresel veri ağı üzerinden anlık ve otomatik olarak listelenmektedir.</p>
        </div>
      </div>`;

// Update saas-panel-ui/admin.html and saas-panel-ui/index.html
['saas-panel-ui/admin.html', 'saas-panel-ui/index.html'].forEach(relPath => {
  const fullPath = path.join(__dirname, '..', relPath);
  if (fs.existsSync(fullPath)) {
    let html = fs.readFileSync(fullPath, 'utf8');

    // Replace banner
    const bannerRegex = /<!-- 'Yapım Aşamasında' Bilgilendirme Kutusu -->[\s\S]*?<\/div>\s*<\/div>/;
    if (bannerRegex.test(html)) {
      html = html.replace(bannerRegex, newBannerHtml);
    } else {
      // Fallback regex matching under-construction-banner
      const bannerFallbackRegex = /<div class="under-construction-banner">[\s\S]*?<\/div>\s*<\/div>/;
      if (bannerFallbackRegex.test(html)) {
        html = html.replace(bannerFallbackRegex, newBannerHtml);
      }
    }

    // Replace TecDoc wording in pool empty state & quick actions
    html = html.replace(
      'Yeni parçalar eklendiğinde veya TecDoc entegrasyonu sağlandığında burada görüntülenecektir.',
      'Yeni parçalar eklendiğinde veya Parts-Catalogs entegrasyonu üzerinden çekildiğinde burada görüntülenecektir.'
    );

    html = html.replace(
      '<span>TecDoc API entegrasyonu ve finansal iskonto parametrelerini yapılandır</span>',
      '<span>Parts-Catalogs API entegrasyonu ve finansal iskonto parametrelerini yapılandır</span>'
    );

    html = html.replace(
      '<h4 class="settings-card-title">TecDoc & Parça Veri Entegrasyonu</h4>',
      '<h4 class="settings-card-title">Parts-Catalogs & Parça Veri Entegrasyonu</h4>'
    );

    html = html.replace(
      'Platform genel parametreleri, TecDoc API anahtarları ve iskonto kuralları',
      'Platform genel parametreleri, Parts-Catalogs API anahtarları ve iskonto kuralları'
    );

    fs.writeFileSync(fullPath, html, 'utf8');
    console.log(`Updated ${relPath}`);
  }
});
