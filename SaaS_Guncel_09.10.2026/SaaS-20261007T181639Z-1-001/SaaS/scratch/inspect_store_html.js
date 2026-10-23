const fs = require('fs');
const path = require('path');

const storeHtmlPath = path.join(__dirname, '../storefront-ui/store.html');
const content = fs.readFileSync(storeHtmlPath, 'utf8');

const lines = content.split('\n');
console.log('Total lines:', lines.length);

lines.forEach((line, idx) => {
  if (line.includes('apiFetch') || line.includes('fetch(') || line.includes('X-Tenant-Slug') || line.includes('tenantSlug')) {
    console.log(`L${idx + 1}: ${line.trim()}`);
  }
});
