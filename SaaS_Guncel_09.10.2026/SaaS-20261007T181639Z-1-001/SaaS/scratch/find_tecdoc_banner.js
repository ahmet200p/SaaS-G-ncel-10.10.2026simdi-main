const fs = require('fs');
const path = require('path');

['saas-panel-ui/admin.html', 'saas-panel-ui/index.html'].forEach(relPath => {
  const fullPath = path.join(__dirname, '..', relPath);
  if (fs.existsSync(fullPath)) {
    const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
    console.log(`\n=== Matches in ${relPath} ===`);
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes('tecdoc') || line.toLowerCase().includes('parça havuzu') || line.toLowerCase().includes('parca-havuzu')) {
        console.log(`L${idx + 1}: ${line.trim()}`);
      }
    });
  }
});
