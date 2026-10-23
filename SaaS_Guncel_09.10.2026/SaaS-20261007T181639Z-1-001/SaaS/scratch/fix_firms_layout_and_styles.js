const fs = require('fs');
const path = require('path');

// 1. UPDATE saas-panel-ui/style.css
const styleCssPath = path.join(__dirname, '../saas-panel-ui/style.css');
let styleCss = fs.readFileSync(styleCssPath, 'utf8');

const updatedTableStyles = `/* ==========================================================================
   7. BAŞLIK VE SAĞA YASLI MAVİ BUTON (MODERN B2B SAAS LAYOUT)
   ========================================================================== */
.section-action-header {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  width: 100% !important;
  margin-top: 8px;
  margin-bottom: 24px;
  padding-bottom: 4px;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-dark, #0f172a);
  letter-spacing: -0.02em;
}

/* Sağa yaslı, mavi renkli '+ Yeni Firma Ekle' butonu */
.btn-primary {
  background-color: var(--primary, #2563eb);
  color: #ffffff;
  border: none;
  padding: 10px 20px;
  border-radius: var(--radius-md, 8px);
  font-size: 0.88rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: var(--transition, all 0.2s ease);
  box-shadow: 0 4px 10px rgba(37, 99, 235, 0.25);
  flex-shrink: 0;
}

.btn-primary:hover {
  background-color: var(--primary-dark, #1d4ed8);
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.35);
  transform: translateY(-1px);
}

/* ==========================================================================
   8. KAYITLI FİRMALAR TABLOSU (FULL-WIDTH CARD, SHADOW-SM, ROUNDED-LG)
   ========================================================================== */
.table-container {
  width: 100% !important;
  background-color: #ffffff !important;
  border-radius: var(--radius-lg, 12px) !important;
  border: 1px solid #e2e8f0 !important;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.04) !important;
  overflow: hidden !important;
  margin-bottom: 24px;
}

.tenants-table {
  width: 100% !important;
  border-collapse: collapse !important;
  text-align: left !important;
}

.tenants-table thead {
  background-color: #f8fafc !important;
  border-bottom: 1px solid #e2e8f0 !important;
}

.tenants-table th {
  padding: 15px 22px !important;
  font-size: 0.78rem !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
  color: #64748b !important;
  vertical-align: middle !important;
  background-color: #f8fafc !important;
}

.tenants-table td {
  padding: 16px 22px !important;
  font-size: 0.90rem !important;
  color: #1e293b !important;
  border-bottom: 1px solid #f1f5f9 !important;
  vertical-align: middle !important;
}

.tenants-table tr:last-child td {
  border-bottom: none !important;
}

.tenants-table tbody tr {
  transition: background-color 0.15s ease !important;
}

.tenants-table tbody tr:hover {
  background-color: #f8fafc !important;
}

/* Firma Kimliği ve Avatarı */
.firm-identity {
  display: flex;
  align-items: center;
  gap: 12px;
}

.firm-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md, 8px);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.8rem;
  flex-shrink: 0;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.firm-name {
  font-weight: 600;
  color: var(--text-dark, #0f172a);
}

/* Subdomain Şık Badge Görünümü */
.subdomain-text {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  font-size: 0.82rem !important;
  font-weight: 600 !important;
  color: #2563eb !important;
  background: #eff6ff !important;
  border: 1px solid #dbeafe !important;
  padding: 5px 12px !important;
  border-radius: 8px !important;
  text-decoration: none !important;
  transition: all 0.2s ease !important;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.05) !important;
}

.subdomain-text:hover {
  background: #dbeafe !important;
  color: #1d4ed8 !important;
  border-color: #bfdbfe !important;
  transform: translateY(-1px) !important;
}

/* Tema Rengi (Color Dot + Text) */
.color-badge-wrapper {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 4px 10px !important;
  background: #f8fafc !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 20px !important;
  width: fit-content !important;
}

.color-swatch-box {
  width: 12px !important;
  height: 12px !important;
  border-radius: 50% !important;
  display: inline-block !important;
  box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.12) !important;
  flex-shrink: 0 !important;
}

.color-name {
  font-weight: 600 !important;
  color: #334155 !important;
  font-size: 0.83rem !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
}`;

// Replace the sections 7 & 8 in style.css
const oldStylesRegex = /\/\* ==========================================================================\s*7\. BAŞLIK VE SAĞA YASLI MAVİ BUTON[\s\S]*?\.color-name \{[\s\S]*?\}/;
if (oldStylesRegex.test(styleCss)) {
  styleCss = styleCss.replace(oldStylesRegex, updatedTableStyles);
  fs.writeFileSync(styleCssPath, styleCss, 'utf8');
  console.log('Updated table & layout styles in saas-panel-ui/style.css');
}

// 2. UPDATE saas-panel-ui/admin.html
const adminHtmlPath = path.join(__dirname, '../saas-panel-ui/admin.html');
let adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');

// Fix unclosed section-action-header
const unclosedHeaderPattern = `<section class="section-action-header">
        <div>
          <h3 class="section-title">Kayıtlı Firmalar (Tenants)</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">Sistemde kayıtlı bayiler, durum yönetimi ve B2B mağaza erişimleri</p>
        </div>
        <button class="btn-primary" id="btn-add-tenant">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span> Yeni Firma Ekle</span>
        </button>
      <!-- Onay Bekleyen Bayi Başvuruları Bölümü`;

const closedHeaderPattern = `<section class="section-action-header">
        <div>
          <h3 class="section-title">Kayıtlı Firmalar (Tenants)</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">Sistemde kayıtlı bayiler, durum yönetimi ve B2B mağaza erişimleri</p>
        </div>
        <button class="btn-primary" id="btn-add-tenant">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span> Yeni Firma Ekle</span>
        </button>
      </section>

      <!-- Onay Bekleyen Bayi Başvuruları Bölümü`;

if (adminHtml.includes(unclosedHeaderPattern)) {
  adminHtml = adminHtml.replace(unclosedHeaderPattern, closedHeaderPattern);
  console.log('Closed section-action-header in admin.html');
}

// Fix static row in admin.html
adminHtml = adminHtml.replace(
  `<a href="store.html?subdomain=ahmetoto" class="subdomain-text" title="Mağazayı Aç" style="text-decoration: none; color: inherit;">ahmetoto.sistem.com ↗</a>`,
  `<a href="../storefront-ui/store.html?subdomain=ahmetoto" class="subdomain-text" target="_blank" title="B2B Mağazasını Aç">ahmetoto.sistem.com ↗</a>`
);
adminHtml = adminHtml.replace(
  `<span class="color-name">Turuncu</span>`,
  `<span class="color-name">#f97316 (Turuncu)</span>`
);

// Fix dynamic row in admin.html loadTenants
adminHtml = adminHtml.replace(
  `<a href="store.html?subdomain=\${safeSubdomain}" class="subdomain-text" title="Mağazayı Aç" style="text-decoration: none; color: inherit;">\${safeSubdomain}.sistem.com ↗</a>`,
  `<a href="../storefront-ui/store.html?subdomain=\${safeSubdomain}" class="subdomain-text" target="_blank" title="B2B Mağazasını Aç">\${safeSubdomain}.sistem.com ↗</a>`
);

fs.writeFileSync(adminHtmlPath, adminHtml, 'utf8');
console.log('Updated saas-panel-ui/admin.html');

// 3. UPDATE saas-panel-ui/index.html as well
const indexHtmlPath = path.join(__dirname, '../saas-panel-ui/index.html');
if (fs.existsSync(indexHtmlPath)) {
  let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  indexHtml = indexHtml.replace(
    `<a href="store.html?subdomain=ahmetoto" class="subdomain-text" title="Mağazayı Aç" style="text-decoration: none; color: inherit;">ahmetoto.sistem.com ↗</a>`,
    `<a href="../storefront-ui/store.html?subdomain=ahmetoto" class="subdomain-text" target="_blank" title="B2B Mağazasını Aç">ahmetoto.sistem.com ↗</a>`
  );
  indexHtml = indexHtml.replace(
    `<a href="store.html?subdomain=\${safeSubdomain}" class="subdomain-text" title="Mağazayı Aç" style="text-decoration: none; color: inherit;">\${safeSubdomain}.sistem.com ↗</a>`,
    `<a href="../storefront-ui/store.html?subdomain=\${safeSubdomain}" class="subdomain-text" target="_blank" title="B2B Mağazasını Aç">\${safeSubdomain}.sistem.com ↗</a>`
  );
  fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
  console.log('Updated saas-panel-ui/index.html');
}
