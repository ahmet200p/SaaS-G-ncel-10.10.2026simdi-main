// ============================================================================
// Multi-Tenant B2B Yedek Parça SaaS - Ana Uygulama (app.js)
// Tüm modüler API rotalarını (Auth, Süper Admin, Bayi, B2B Vitrin) birleştiren ana dosya
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Modüler Rota İçe Aktarımları
const authRoutes = require('./routes/auth.routes');
const superAdminRoutes = require('./routes/superAdmin');
const tenantRoutes = require('./routes/tenant');
const storeRoutes = require('./routes/store');
const securityHeaders = require('./middleware/security');

let compressionMiddleware = null;
try {
  const compression = require('compression');
  compressionMiddleware = compression();
} catch (e) {
  compressionMiddleware = null;
}

const app = express();

// ----------------------------------------------------------------------------
// 1. TEMEL ARA YAZILIMLAR (MIDDLEWARES)
// ----------------------------------------------------------------------------
// Güvenlik Başlıkları (OWASP Security Headers)
app.use(securityHeaders);

if (compressionMiddleware) {
  app.use(compressionMiddleware);
}

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statik Dosya Sunumu (Frontend HTML, CSS, JS dosyaları)
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
  console.error('[UNHANDLED_ERROR]:', err);
  res.status(500).json({
    success: false,
    message: 'Sunucuda beklenmeyen bir hata meydana geldi.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;
