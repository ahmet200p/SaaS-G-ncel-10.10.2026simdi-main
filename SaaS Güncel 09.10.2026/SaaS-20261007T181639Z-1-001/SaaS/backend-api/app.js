// ============================================================================
// Multi-Tenant B2B Yedek Parça SaaS - Ana Uygulama (app.js)
// Tüm modüler API rotalarını (Auth, Süper Admin, Bayi, B2B Vitrin) birleştiren ana dosya
// ============================================================================

require('dotenv').config();
const config = require('./config');
// 3. ADIM: JWT Anahtarı İçin Çalışma Zamanı (Runtime) Koruması (Fail-Safe)
config.validateJwtSecret();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Modüler Rota İçe Aktarımları
const authRoutes = require('./routes/auth.routes');
const superAdminRoutes = require('./routes/superAdmin');
const tenantRoutes = require('./routes/tenant');
const storeRoutes = require('./routes/store');
const securityHeaders = require('./middleware/security');
const { tenantApiKeyInterceptor } = require('./middleware/tenantApiKey');

let compressionMiddleware = null;
try {
  const compression = require('compression');
  compressionMiddleware = compression();
} catch (e) {
  compressionMiddleware = null;
}

const app = express();
app.disable('x-powered-by');

// ----------------------------------------------------------------------------
// 1. TEMEL ARA YAZILIMLAR (MIDDLEWARES)
// ----------------------------------------------------------------------------
// Güvenlik Başlıkları (OWASP Security Headers)
app.use(securityHeaders);

if (compressionMiddleware) {
  app.use(compressionMiddleware);
}

// Güvenli CORS Yapılandırması:
// Sadece storefront-ui'ın çalıştığı adrese/porta (http://localhost:5500, http://127.0.0.1:5500 vb.) izin verilir.
// Yetkisiz veya bilinmeyen tarayıcı kökenleri (origins) engellenir (HTTP 403 Forbidden).
const allowedOrigins = new Set([
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://localhost:5500',
  'https://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://ahmetoto.com',
  'https://ahmetoto.com'
]);

if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean).forEach(o => allowedOrigins.add(o));
}
if (process.env.STOREFRONT_ORIGIN) {
  allowedOrigins.add(process.env.STOREFRONT_ORIGIN.trim());
}

const corsOptions = {
  origin: function (origin, callback) {
    // 1. Tarayıcı dışı istemciler (Postman, Curl, Sunucudan Sunucuya API entegrasyonları, Testler):
    // Tarayıcı dışı doğrudan HTTP isteklerinde 'Origin' başlığı bulunmaz (!origin). Bunlara izin verilir.
    if (!origin) {
      return callback(null, true);
    }

    // 2. Beyaz listedeki kökenler (storefront-ui):
    const normalizedOrigin = origin.toLowerCase().replace(/\/$/, '');
    if (allowedOrigins.has(normalizedOrigin)) {
      return callback(null, true);
    }

    // 3. Yetkisiz kökenler katı bir şekilde engellenir
    const corsError = new Error(`CORS politika engeli: '${origin}' kökeninden gelen isteklere izin verilmemektedir.`);
    corsError.status = 403;
    corsError.isCorsError = true;
    return callback(corsError, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Tenant-Slug',
    'x-tenant-slug',
    'X-Tenant-API-Key',
    'x-tenant-api-key',
    'X-API-Key',
    'x-api-key'
  ],
  exposedHeaders: ['X-Tenant-Slug', 'X-Tenant-API-Key'],
  maxAge: 86400
};

app.use(cors(corsOptions));

// Payload Boyut Sınırı (DoS Koruması)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Harici Bayiler ve Entegrasyonlar için X-Tenant-API-Key Denetleyicisi
app.use(tenantApiKeyInterceptor);

// Medya Yüklemeleri Statik Sunumu (Yalnızca ürün ve logo görselleri, HTML sunulmaz)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Headless REST API Güvencesi: Backend hiçbir şekilde HTML dosyası sunmaz (res.sendFile veya res.render kullanılmaz)
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    return res.status(404).json({
      success: false,
      message: 'Headless REST API: Bu sunucu hiçbir şekilde HTML dosyası sunmamaktadır (res.sendFile ve res.render devre dışıdır). Lütfen storefront-ui uygulamasını kullanınız.',
      path: req.originalUrl
    });
  }
  next();
});

// Kök Dizin (Root) Bilgilendirme - Saf JSON API Metadata
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'B2B Multi-Tenant Yedek Parça SaaS - Headless REST API Servisi',
    status: 'UP',
    version: '1.0.0',
    description: 'Saf Headless REST API mimarisi. Sunucu hiçbir şekilde HTML sunmaz, yalnızca saf JSON verisi döner.',
    documentation: '/api/health',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      store: '/api/store',
      tenant: '/api/tenant',
      admin: '/api/admin'
    }
  });
});

// İstek Kayıt Loglayıcısı (Request Logger)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// ----------------------------------------------------------------------------
// 2. SİSTEM SAĞLIK KONTROLÜ (HEALTH CHECK)
// ----------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'B2B Multi-Tenant Spare Parts SaaS API',
    uptime: process.uptime()
  });
});

// ----------------------------------------------------------------------------
// 3. TÜM MODÜLER API ROTALARININ BİRLEŞTİRİLMESİ (app.use...)
// ----------------------------------------------------------------------------

// A. Kimlik Doğrulama: Giriş yapma, şifre kontrolü ve JWT üretimi
// POST /api/auth/login, POST /auth/login, GET /api/auth/me
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

// B. Süper Admin: Bayi oluşturma (Transaction), bayi listeleme, parça havuzu yönetimi
// POST & GET /api/admin/tenants, POST & GET /api/admin/products
app.use('/api/admin', superAdminRoutes);

// C. Bayi (Tenant) Operasyonları: Kendi kataloğunu yönetme, gelen siparişler, sipariş onaylama
// POST & GET /api/tenant/catalog, GET & PATCH /api/tenant/orders
app.use('/api/tenant', tenantRoutes);

// D. B2B Vitrin (Otoservis/Tamirci): İskonto hesaplanmış ürün listesi (finalPrice) ve sipariş verme (Transaction)
// GET /api/store/products, POST /api/store/orders
app.use('/api/store', storeRoutes);

// ----------------------------------------------------------------------------
// 4. BULUNAMAYAN ROTA (404) VE MERKEZİ HATA YÖNETİMİ
// ----------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Kaynak bulunamadı: ${req.method} ${req.originalUrl}`
  });
});

app.use((err, req, res, next) => {
  if (err.isCorsError || (err.message && err.message.includes('CORS politika engeli'))) {
    return res.status(403).json({
      success: false,
      error: 'CORS_FORBIDDEN',
      message: err.message || 'CORS engellendi: Bu kökene (origin) izin verilmemektedir.'
    });
  }

  console.error('[UNHANDLED_ERROR]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Sunucuda beklenmeyen bir hata meydana geldi.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;
