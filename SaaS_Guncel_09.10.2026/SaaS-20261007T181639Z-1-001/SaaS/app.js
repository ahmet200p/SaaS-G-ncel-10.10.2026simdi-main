// ============================================================================
// Multi-Tenant B2B Yedek Parça SaaS - app.js (Kök Proxy)
// Doğrudan backend-api/app.js modülünü dışa aktarır.
// Render veya doğrudan çalıştırmada (node app.js) sunucuyu ayağa kaldırır.
// ============================================================================

const app = require('./backend-api/app');

// Doğrudan 'node app.js' ile başlatıldığında sunucuyu otomatik dinlemeye al
if (require.main === module) {
  if (process.env.NODE_ENV === 'production') {
    require('./backend-api/server');
  } else {
    require('./server');
  }
}

module.exports = app;
