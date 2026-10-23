// ============================================================================
// Multi-Tenant B2B Yedek Parça SaaS - server.js (Kök Başlatıcı Proxy)
// Üretim (production) ortamında doğrudan backend-api/server.js çalışır.
// Geliştirme (development) ortamında dev_server.js (PGlite + REST API + Frontend) çalışır.
// ============================================================================

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./backend-api/server');
} else {
  module.exports = require('./dev_server');
}
