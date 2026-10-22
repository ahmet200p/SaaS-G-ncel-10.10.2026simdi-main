// ============================================================================
// Multi-Tenant B2B Yedek Parça SaaS - Sunucu Başlatıcı (server.js)
// ============================================================================

const config = require('./config');
// Çalışma zamanı Fail-Safe denetimleri (JWT & DATABASE_URL)
config.validateJwtSecret();
config.validateDatabaseUrl();

const app = require('./app');
const prisma = require('./lib/prisma');

const PORT = config.PORT;

// Başlangıç Veritabanı Bütünlük Kontrolü (Veri Sıfırlamadan Eksikleri Tamamlama)
const ensureInitialData = async () => {
  // 1. KURAL: Üretim (Production) Ortamı Koruması
  // Otomatik başlangıç hesabı oluşturma SADECE process.env.NODE_ENV === 'development' ortamında çalışır.
  if (process.env.NODE_ENV !== 'development') {
    console.log(`[SECURITY] Ortam: "${process.env.NODE_ENV || 'production'}". Üretim ortamında otomatik başlangıç hesabı oluşturma engellendi.`);
    return;
  }

  // 2. KURAL: Sabit (Hardcoded) Parolaların Kaldırılması
  // Parolalar MUTLAKA .env dosyasından (DEFAULT_ADMIN_PASSWORD) okunmalıdır.
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD;
  if (!adminPassword || adminPassword.trim() === '') {
    throw new Error('[SECURITY_ERROR] .env dosyasında DEFAULT_ADMIN_PASSWORD tanımlanmamış! Sistem güvenliği için otomatik hesap oluşturma reddedildi.');
  }

  const forbiddenWeakPasswords = ['123456', 'admin', 'test', 'password', '12345678', 'qwerty', '12345'];
  if (forbiddenWeakPasswords.includes(adminPassword.toLowerCase())) {
    throw new Error(`[SECURITY_ERROR] DEFAULT_ADMIN_PASSWORD zayıf veya tahmin edilebilir bir parola ("${adminPassword}") olamaz! Lütfen güçlü bir parola belirleyin.`);
  }

  const dealerPassword = process.env.DEFAULT_DEALER_PASSWORD || adminPassword;
  if (!dealerPassword || forbiddenWeakPasswords.includes(dealerPassword.toLowerCase())) {
    throw new Error('[SECURITY_ERROR] DEFAULT_DEALER_PASSWORD zayıf veya tanımlanmamış!');
  }

  try {
    const adminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
    if (adminCount === 0) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(adminPassword, 10);

      await prisma.user.create({
        data: {
          email: 'admin@sistem.com',
          password: hash,
          role: 'SUPER_ADMIN'
        }
      });

      console.log('====================================================');
      console.log('👑 İLK KURULUM: Yeni Süper Admin Hesabı Oluşturuldu');
      console.log(`📧 E-posta: admin@sistem.com`);
      console.log('🔑 Parola .env (DEFAULT_ADMIN_PASSWORD) üzerinden güvenle yapılandırıldı.');
      console.log('====================================================');
    }

    const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      await prisma.systemSettings.create({
        data: {
          id: 1,
          adminEmail: 'admin@sistem.com',
          tecdocApiKey: 'tc_live_demo_984182938472',
          tecdocEndpoint: 'https://api.tecalliance.net/v2/catalog',
          defaultB2BDiscount: 20.0,
          defaultTaxRate: 20.0,
          platformCurrency: 'TRY'
        }
      });
      console.log('⚙️ Varsayılan Sistem Ayarları yapılandırıldı.');
    }

    // Varsayılan Bayi (Ahmet Oto) ve Bayi Yöneticisi (ahmet@ahmetoto.com)
    let tenant = await prisma.tenant.findUnique({ where: { subdomain: 'ahmetoto' } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'Ahmet Oto',
          subdomain: 'ahmetoto',
          themeColor: '#f97316',
          isActive: true
        }
      });
      console.log('🏪 Varsayılan Bayi (Ahmet Oto) veritabanına eklendi.');
    }

    const tenantAdmin = await prisma.user.findUnique({ where: { email: 'ahmet@ahmetoto.com' } });
    if (!tenantAdmin) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(dealerPassword, 10);
      await prisma.user.create({
        data: {
          email: 'ahmet@ahmetoto.com',
          password: hash,
          role: 'TENANT_ADMIN',
          tenantId: tenant.id
        }
      });
      console.log('👔 Varsayılan Bayi Yöneticisi (ahmet@ahmetoto.com) veritabanına eklendi.');
    }
  } catch (err) {
    console.error('[DB_INIT_CHECK]:', err.message);
    throw err;
  }
};

let server = null;
let secondaryServer = null;

async function bootstrap() {
  try {
    // 1. KURAL: Geliştirme Ortamı İzolasyonu (dev_pg_server)
    // SADECE process.env.NODE_ENV === 'development' ortamında dev_pg_server başlatılır.
    // Production (veya development harici) ortamda bu modül tamamen bypass edilir.
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEV_MODE] Geliştirme ortamı algılandı: dev_pg_server ve başlangıç tohumlama başlatılıyor...');
      const { startServer } = require('./dev_pg_server');
      await startServer();
      await ensureInitialData();
    } else {
      console.log(`[PRODUCTION_MODE] Ortam: "${process.env.NODE_ENV || 'production'}". dev_pg_server ve otomatik tohumlama tamamen bypass edildi.`);
    }
  } catch (e) {
    console.error('[BOOTSTRAP_ERROR]:', e);
  }

  server = app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Multi-Tenant B2B SaaS Sunucusu Başarıyla Başlatıldı!`);
    console.log(`📡 Port:        ${PORT}`);
    console.log(`🔑 Auth API:    http://localhost:${PORT}/api/auth/login`);
    console.log(`👑 Admin API:   http://localhost:${PORT}/api/admin/tenants`);
    console.log(`🏪 Tenant API:  http://localhost:${PORT}/api/tenant/catalog`);
    console.log(`🛒 Store API:   http://localhost:${PORT}/api/store/products`);
    console.log(`🩺 Health:      http://localhost:${PORT}/api/health`);
    console.log(`====================================================`);
  });

  if (PORT !== 3000) {
    try {
      secondaryServer = app.listen(3000, () => {
        console.log(`📡 Secondary API Port: http://localhost:3000/api/store/products`);
      });
      secondaryServer.on('error', (err) => {
        console.log(`[SECONDARY_PORT_NOTICE]: Port 3000 dinlenemedi (${err.message}), Port ${PORT} aktif.`);
      });
    } catch (e) {
      console.log('[SECONDARY_PORT_ERROR]:', e.message);
    }
  }
}

bootstrap();

// Graceful Shutdown (Veritabanı bağlantısını temiz kapatma)
const handleShutdown = async (signal) => {
  console.log(`\n${signal} sinyali alındı, sunucu güvenli bir şekilde kapatılıyor...`);
  if (secondaryServer) {
    try { secondaryServer.close(); } catch (e) {}
  }
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Prisma veritabanı bağlantısı başarıyla kapatıldı. Çıkış yapıldı.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = {
  get server() { return server; },
  ensureInitialData,
  bootstrap
};
