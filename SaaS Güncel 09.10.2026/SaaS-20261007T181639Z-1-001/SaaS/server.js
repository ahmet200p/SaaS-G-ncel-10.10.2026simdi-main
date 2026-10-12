// ============================================================================
// Multi-Tenant B2B Yedek Parça SaaS - Sunucu Başlatıcı (server.js)
// ============================================================================

const app = require('./app');
const prisma = require('./lib/prisma');
const config = require('./config');

const PORT = config.PORT;

// Başlangıç Veritabanı Bütünlük Kontrolü (Veri Sıfırlamadan Eksikleri Tamamlama)
const ensureInitialData = async () => {
  try {
    const adminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
    if (adminCount === 0) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('123456', 10);
      await prisma.user.create({
        data: {
          email: 'admin@sistem.com',
          password: hash,
          role: 'SUPER_ADMIN'
        }
      });
      console.log('👑 Varsayılan Süper Admin (admin@sistem.com) veritabanına eklendi.');
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
      const hash = await bcrypt.hash('123456', 10);
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
  }
};

// Sunucuyu Dinlemeye Başla
const server = app.listen(PORT, async () => {
  await ensureInitialData();
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

// Graceful Shutdown (Veritabanı bağlantısını temiz kapatma)
const handleShutdown = async (signal) => {
  console.log(`\n${signal} sinyali alındı, sunucu güvenli bir şekilde kapatılıyor...`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Prisma veritabanı bağlantısı başarıyla kapatıldı. Çıkış yapıldı.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = server;
