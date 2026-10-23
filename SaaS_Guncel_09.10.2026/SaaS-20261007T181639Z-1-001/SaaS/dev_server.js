/**
 * dev_server.js
 * SaaS Geliştirme ve Canlı Çalıştırma Sunucusu (Database + REST API + Frontend)
 * 
 * 1. PostgreSQL (PGlite) Veritabanı Sunucusu: 127.0.0.1:5432
 * 2. Express Headless REST API: http://localhost:5000 (ve http://localhost:3000)
 * 3. Frontend Web Portalı (Storefront + SaaS Panel): http://localhost:5500
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. Backend REST API ve PostgreSQL Veritabanı Başlatıcı
require('./backend-api/server');

// 2. Frontend Statik Sunucusu (Port 5500)
const FRONTEND_PORT = 5500;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const frontendServer = http.createServer((req, res) => {
  // CORS ve Güvenlik Başlıkları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. API ve Uploads İsteklerini Doğrudan Express Backend REST API'sine (Port 5000) Şeffaf Yönlendir (Reverse Proxy)
  if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) {
    const proxyReq = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path: req.url,
      method: req.method,
      headers: req.headers
    }, (proxyRes) => {
      const responseHeaders = { ...proxyRes.headers };
      responseHeaders['access-control-allow-origin'] = '*';
      responseHeaders['cross-origin-resource-policy'] = 'cross-origin';
      delete responseHeaders['access-control-allow-credentials'];
      res.writeHead(proxyRes.statusCode, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: 'Backend REST API bağlantı hatası: ' + err.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  let reqUrl = req.url.split('?')[0];
  let reqPath = decodeURI(reqUrl);

  // Kök adrese (/) gelindiğinde varsayılan olarak Vitrin Portalı'na yönlendir
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/storefront-ui/store.html';
  }

  // Güvenlik Koruması: Path Traversal (Dizin Atlama) Atağını Engelle
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(ROOT_DIR, safePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden: Yetkisiz dosya dizinine erişim engellendi.');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: Aranan sayfa veya dosya bulunamadı (${reqPath}).`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

frontendServer.listen(FRONTEND_PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🌐 FRONTEND WEB PORTALI BAŞLATILDI (PORT ${FRONTEND_PORT})`);
  console.log(`🛒 B2B Vitrin Portalı:      http://localhost:${FRONTEND_PORT}/storefront-ui/store.html`);
  console.log(`🔑 SaaS Giriş Paneli:       http://localhost:${FRONTEND_PORT}/saas-panel-ui/login.html`);
  console.log(`👑 Süper Admin Paneli:      http://localhost:${FRONTEND_PORT}/saas-panel-ui/admin.html`);
  console.log(`🏪 Bayi Yönetim Paneli:     http://localhost:${FRONTEND_PORT}/saas-panel-ui/bayi.html`);
  console.log(`====================================================`);
});
