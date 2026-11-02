// ============================================================================
// Multi-Tenant B2B Yedek Parça SaaS - server.js (Kök Başlatıcı Proxy)
// prompt.md Kural 4: CORS Middleware ve origin: '*' yapılandırması
// Üretim (production) ortamında doğrudan backend-api/server.js çalışır.
// Geliştirme (development) ortamında dev_server.js (PGlite + REST API + Frontend) çalışır.
// ============================================================================

const cors = require('cors');

// CORS middleware yapılandırması (origin: '*' ve Netlify/Frontend izinleri)
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Tenant-Id',
    'Tenant-ID',
    'X-Tenant-Slug',
    'X-Tenant-API-Key',
    'X-API-Key',
    'Accept',
    'Origin',
    'X-Requested-With'
  ]
};

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./backend-api/server');
} else {
  module.exports = require('./dev_server');
}
