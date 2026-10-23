const fs = require('fs');
const path = require('path');

// 1. Update storefront-ui/assets/js/api.js
const apiJsPath = path.join(__dirname, '../storefront-ui/assets/js/api.js');
let apiJs = fs.readFileSync(apiJsPath, 'utf8');

// Helper to add before resolveApiBase or inside IIFE
const helperFunc = `  // 1. ADIM: Dinamik ve Güvenli Tenant / Subdomain Çözümleyici (Headless Storefront)
  function getResolvedTenantSlug() {
    if (typeof window !== 'undefined' && window.location) {
      const urlParams = new URLSearchParams(window.location.search);
      const qSlug = urlParams.get('subdomain') || urlParams.get('tenant') || urlParams.get('slug');
      if (qSlug && qSlug.trim()) {
        const clean = qSlug.trim().toLowerCase();
        try { localStorage.setItem('tenantSlug', clean); } catch (e) {}
        return clean;
      }
      if (window.location.hostname) {
        const parts = window.location.hostname.split('.');
        // Örn: demir-oto.localhost
        if (parts.length === 2 && parts[1] === 'localhost' && parts[0] !== 'localhost') {
          const devSub = parts[0].toLowerCase();
          try { localStorage.setItem('tenantSlug', devSub); } catch (e) {}
          return devSub;
        }
        // Örn: ahmetoto.sistem.com
        if (parts.length >= 3 && !['www', 'api', 'admin', 'panel'].includes(parts[0])) {
          const prodSub = parts[0].toLowerCase();
          try { localStorage.setItem('tenantSlug', prodSub); } catch (e) {}
          return prodSub;
        }
      }
    }
    let localSlug = null;
    try { localSlug = localStorage.getItem('tenantSlug'); } catch (e) {}
    return localSlug || 'ahmetoto';
  }
`;

if (!apiJs.includes('function getResolvedTenantSlug(')) {
  apiJs = apiJs.replace(
    '  // Sunucu Adresi Yapılandırması:',
    helperFunc + '\n  // Sunucu Adresi Yapılandırması:'
  );
}

// In apiFetch: replace slug resolution block
const oldSlugRegex = /\/\/ 5\. ADIM: Tenant Algılama[\s\S]*?if \(!headers\.has\('X-Tenant-Slug'\)\) \{[\s\S]*?headers\.set\('X-Tenant-Slug', slug\);\s*\}/;

const newSlugBlock = `// 5. ADIM: Tenant Algılama (Subdomain/Slug Resolution)
    if (!headers.has('X-Tenant-Slug')) {
      const slug = getResolvedTenantSlug();
      if (slug) {
        headers.set('X-Tenant-Slug', slug);
      }
    }`;

apiJs = apiJs.replace(oldSlugRegex, newSlugBlock);

// Expose getResolvedTenantSlug on window
if (!apiJs.includes('window.getResolvedTenantSlug = getResolvedTenantSlug;')) {
  apiJs = apiJs.replace(
    'window.escapeHtml = escapeHtml;',
    'window.escapeHtml = escapeHtml;\n  window.getResolvedTenantSlug = getResolvedTenantSlug;'
  );
}

fs.writeFileSync(apiJsPath, apiJs, 'utf8');
console.log('Successfully updated assets/js/api.js');
