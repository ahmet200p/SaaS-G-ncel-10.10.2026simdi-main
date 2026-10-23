const fs = require('fs');
const path = require('path');

const adminHtmlPath = path.join(__dirname, '../saas-panel-ui/admin.html');
const content = fs.readFileSync(adminHtmlPath, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('Mağaza') || line.includes('store.html') || line.includes('subdomain')) {
    console.log(`L${idx + 1}: ${line.trim()}`);
  }
});
