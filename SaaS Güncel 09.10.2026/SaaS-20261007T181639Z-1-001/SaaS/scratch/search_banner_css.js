const fs = require('fs');
const path = require('path');

function searchCss(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git') searchCss(full);
    } else if (f.endsWith('.css') || f.endsWith('.html')) {
      const c = fs.readFileSync(full, 'utf8');
      if (c.includes('under-construction-banner')) {
        console.log(`Found under-construction-banner in: ${path.relative(path.join(__dirname, '..'), full)}`);
      }
    }
  }
}

searchCss(path.join(__dirname, '..'));
