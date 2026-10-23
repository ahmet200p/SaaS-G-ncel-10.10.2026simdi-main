const fs = require('fs');
const path = require('path');

function searchInDir(dir, query) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === '.gemini') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchInDir(fullPath, query);
    } else if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.prisma')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes(query.toLowerCase())) {
        console.log(`Found "${query}" in: ${path.relative(path.join(__dirname, '..'), fullPath)}`);
      }
    }
  }
}

console.log('--- Searching for TecDoc ---');
searchInDir(path.join(__dirname, '..'), 'TecDoc');

console.log('--- Searching for Merkezi Parça Havuzu ---');
searchInDir(path.join(__dirname, '..'), 'Merkezi Parça Havuzu');
