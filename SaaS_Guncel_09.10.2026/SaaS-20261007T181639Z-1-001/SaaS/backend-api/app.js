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
const catalogRoutes = require('./routes/catalog.routes');
const securityHeaders = require('./middleware/security');
const { tenantApiKeyInterceptor } = require('./middleware/tenantApiKey');
const { apiLimiter } = require('./middleware/rateLimiter');

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
// 1. CORS ARA YAZILIMI (EN ÜSTTE ÇAĞRILIR - prompt.md Düzeltme 1 & 2)
// Tüm router'lardan ve özel yetki/onay middleware'lerinden KESİNLİKLE ÖNCE çalışır.
// ----------------------------------------------------------------------------
const allowedOrigins = new Set([
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://localhost:5500',
  'https://127.0.0.1:5500',
  'http://localhost:5501',
  'http://127.0.0.1:5501',
  'https://localhost:5501',
  'https://127.0.0.1:5501',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'https://localhost:3001',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://panel.saas.com',
  'https://panel.saas.com',
  'http://ahmetoto.com',
  'https://ahmetoto.com',
  'https://saas-g-ncel-10-10-2026simdi-main.onrender.com'
]);

if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean).forEach(o => allowedOrigins.add(o));
}
if (process.env.STOREFRONT_ORIGIN) {
  allowedOrigins.add(process.env.STOREFRONT_ORIGIN.trim());
}

function isAllowedOrigin(origin) {
  // 1. Tarayıcı dışı istemciler (Postman, curl, sunucudan sunucuya doğrudan istekler) veya Origin başlığı olmayanlar:
  if (!origin) return true;

  // 2. Yerel dosya açılımları (file:// - Tarayıcı Origin: null veya 'null' gönderir):
  if (origin === 'null' || origin === 'file://') return true;

  const normalized = origin.toLowerCase().replace(/\/$/, '');

  // 3. İzin verilen önceden tanımlı veya env kökenleri:
  if (allowedOrigins.has(normalized)) return true;

  // 4. Localhost, 127.0.0.1, IPv6 loopback [::1], 0.0.0.0 ve alt alan adları (*.localhost):
  try {
    const url = new URL(normalized);
    const host = url.hostname;
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      host === '::1'
    ) {
      return true;
    }

    // 5. Yerel ağ / LAN IP'leri (192.168.x.x, 10.x.x.x, 172.16-31.x.x, *.local):
    // Geliştirici ve test cihazlarının (mobil, yerel ağ, farklı portlar) erişimi için:
    if (
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      host.endsWith('.local')
    ) {
      return true;
    }

    // 6. Platform SaaS alt alan adları (örn: *.saas.com, panel.saas.com, ahmetoto.com):
    if (host.endsWith('.saas.com') || host === 'saas.com') {
      return true;
    }

    // 7. Bulut barındırma etki alanları (Render, Vercel, Netlify):
    if (
      host.endsWith('.onrender.com') ||
      host.endsWith('.vercel.app') ||
      host.endsWith('.netlify.app')
    ) {
      return true;
    }
  } catch (e) {}

  return false;
}

const corsOptionsDelegate = function (req, callback) {
  const origin = req.header('Origin');
  if (isAllowedOrigin(origin)) {
    const isLocalFile = (origin === 'null' || origin === 'file://');
    return callback(null, {
      origin: isLocalFile ? '*' : (origin || true),
      credentials: !isLocalFile,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
      allowedHeaders: [
        'Content-Type',
        'content-type',
        'Authorization',
        'authorization',
        'X-Tenant-Id',
        'x-tenant-id',
        'Tenant-ID',
        'tenant-id',
        'X-Tenant-Id',
        'x-tenant-id',
        'Tenant-ID',
        'tenant-id',
        'X-Tenant-Slug',
        'x-tenant-slug',
        'X-Tenant-API-Key',
        'x-tenant-api-key',
        'X-API-Key',
        'x-api-key',
        'Accept',
        'accept',
        'Origin',
        'origin',
        'X-Requested-With',
        'x-requested-with',
        'Cache-Control',
        'cache-control',
        'Pragma',
        'pragma'
      ],
      exposedHeaders: [
        'Content-Range',
        'X-Content-Range',
        'X-Tenant-Slug',
        'x-tenant-slug',
        'X-Tenant-API-Key',
        'x-tenant-api-key'
      ],
      optionsSuccessStatus: 200,
      maxAge: 86400
    });
  }

  // Yetkisiz harici kökenler (örn: evil-competitor.com, malicious-hacker-site.ru) katı bir şekilde engellenir
  const corsError = new Error(`CORS politika engeli: '${origin}' kökeninden gelen isteklere izin verilmemektedir.`);
  corsError.status = 403;
  corsError.isCorsError = true;
  return callback(corsError, { origin: false });
};

// 1. DÜZELTME: CORS ARA YAZILIMI VE PREFLIGHT HANDLER EN TEPEDE ÇAĞRILIR
app.use(cors(corsOptionsDelegate));
app.options('*', cors(corsOptionsDelegate));
app.options(/(.*)/, cors(corsOptionsDelegate));

// ----------------------------------------------------------------------------
// 2. DİĞER TEMEL ARA YAZILIMLAR (MIDDLEWARES)
// ----------------------------------------------------------------------------
// Güvenlik Başlıkları (OWASP Security Headers)
app.use(securityHeaders);

if (compressionMiddleware) {
  app.use(compressionMiddleware);
}

// Payload Boyut Sınırı (DoS Koruması)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Harici Bayiler ve Entegrasyonlar için X-Tenant-API-Key Denetleyicisi
app.use(tenantApiKeyInterceptor);

// Medya Yüklemeleri Statik Sunumu (Yalnızca ürün ve logo görselleri, HTML sunulmaz)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

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
// Global API Hız Sınırlayıcı (DDoS, Bot ve Scraper Koruması)
app.use('/api', apiLimiter);

// A. Kimlik Doğrulama: Giriş yapma, şifre kontrolü ve JWT üretimi
// POST /api/auth/login, POST /auth/login, GET /api/auth/me
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

// B. Süper Admin: Bayi oluşturma (Transaction), bayi listeleme, parça havuzu yönetimi
// POST & GET /api/admin/tenants, POST & GET /api/admin/products, /admin/tenants
app.use('/api/admin', superAdminRoutes);
app.use('/admin', superAdminRoutes);
app.use(['/api/tenants', '/tenants'], (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.url === '/' || req.url === '') {
    req.url = '/tenants';
  } else if (!req.url.startsWith('/tenants')) {
    req.url = '/tenants' + req.url;
  }
  return superAdminRoutes(req, res, next);
});

// B.1 Doğrudan Onay Bekleyen Bayi Listeleme Köprüsü (GET /api/pending-tenants & /pending-tenants)
app.use(['/api/pending-tenants', '/pending-tenants'], (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.url === '/' || req.url === '') {
    req.url = '/pending-tenants';
  } else if (!req.url.startsWith('/pending-tenants')) {
    req.url = '/pending-tenants' + req.url;
  }
  return superAdminRoutes(req, res, next);
});

// C. Bayi (Tenant) Operasyonları: Kendi kataloğunu yönetme, gelen siparişler, sipariş onaylama
// POST & GET /api/tenant/catalog, GET & PATCH /api/tenant/orders
app.use('/api/tenant', tenantRoutes);

// C.1 Bayi ve Vitrin Doğrudan Rota Köprüleri (/api/orders, /api/products, /api/customers, /api/discounts, /api/returns, /api/dashboard-stats)
const directTenantBridgeRoutes = [
  { path: '/api/products', alias: '/products', target: '/products' },
  { path: '/api/orders', alias: '/orders', target: '/orders' },
  { path: '/api/customers', alias: '/customers', target: '/customers' },
  { path: '/api/discounts', alias: '/discounts', target: '/discounts' },
  { path: '/api/returns', alias: '/returns', target: '/returns' },
  { path: '/api/dashboard-stats', alias: '/dashboard-stats', target: '/dashboard-stats' }
];

directTenantBridgeRoutes.forEach(({ path: routePath, alias, target }) => {
  app.use([routePath, alias], (req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    let isTenantAdminOrSuper = false;
    let isCustomer = false;

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, config.JWT_SECRET);
        if (decoded) {
          if (decoded.role === 'TENANT_ADMIN' || decoded.role === 'SUPER_ADMIN') {
            isTenantAdminOrSuper = true;
          } else if (decoded.role === 'CUSTOMER') {
            isCustomer = true;
          }
        }
      } catch (e) {}
    }

    const subPath = req.url === '/' ? '' : req.url;
    req.url = target + subPath;

    if (isCustomer && (target === '/products' || target === '/orders')) {
      return storeRoutes(req, res, next);
    }

    return tenantRoutes(req, res, next);
  });
});

// D. B2B Vitrin (Otoservis/Tamirci): İskonto hesaplanmış ürün listesi (finalPrice) ve sipariş verme (Transaction)
// GET /api/store/products, POST /api/store/orders
app.use('/api/store', storeRoutes);

// E. Parts Catalogs: OE/OEM Numarası ile Parça Detayı Arama
// GET /api/catalog/search-oe/:oeNumber
app.use('/api/catalog', catalogRoutes);
app.use('/catalog', catalogRoutes);

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

// Doğrudan 'node app.js' ile başlatıldığında sunucuyu dinlemeye al
if (require.main === module) {
  require('./server');
}

module.exports = app;
