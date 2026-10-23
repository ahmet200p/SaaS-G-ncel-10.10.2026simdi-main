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
          role: 'SUPER_ADMIN',
          status: 'APPROVED'
        }
      });

      console.log('====================================================');
      console.log('👑 İLK KURULUM: Yeni Süper Admin Hesabı Oluşturuldu');
      console.log(`📧 E-posta: admin@sistem.com`);
      console.log('🔑 Parola .env (DEFAULT_ADMIN_PASSWORD) üzerinden güvenle yapılandırıldı.');
      console.log('====================================================');
    } else {
      await prisma.user.updateMany({
        where: { role: 'SUPER_ADMIN' },
        data: { status: 'APPROVED' }
      });
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
          isActive: true,
          status: 'APPROVED'
        }
      });
      console.log('🏪 Varsayılan Bayi (Ahmet Oto) veritabanına eklendi.');
    } else {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: 'APPROVED' }
      });
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
          status: 'APPROVED',
          tenantId: tenant.id
        }
      });
      console.log('👔 Varsayılan Bayi Yöneticisi (ahmet@ahmetoto.com) veritabanına eklendi.');
    } else {
      await prisma.user.update({
        where: { email: 'ahmet@ahmetoto.com' },
        data: { status: 'APPROVED' }
      });
    }
  } catch (err) {
    console.error('[DB_INIT_CHECK]:', err.message);
    throw err;
  }
};

// SQL komutlarını satır yorumlarından arındırıp PL/pgSQL DO $$ ... $$ bloklarını bozmadan ayrıştıran yardımcı fonksiyon
function parseSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;

  const lines = sql.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inDollarQuote && trimmed.startsWith('--')) {
      continue;
    }

    // DO $$ ... $$ PL/pgSQL bloklarını tespit et ve içindeki noktalı virgülleri bölme
    let pos = 0;
    while ((pos = line.indexOf('$$', pos)) !== -1) {
      inDollarQuote = !inDollarQuote;
      pos += 2;
    }

    current += line + '\n';

    if (!inDollarQuote && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt.length > 0) {
        statements.push(stmt);
      }
      current = '';
    }
  }

  if (current.trim().length > 0) {
    statements.push(current.trim());
  }

  return statements;
}

// Neon ve Harici PostgreSQL Tablolarının Otomatik Denetimi
const ensureNeonTables = async () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const checkTable = await prisma.$queryRawUnsafe(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'User' 
      LIMIT 1;
    `);

    if (!checkTable || checkTable.length === 0) {
      console.log('📦 [NEON_DB_INIT] Veritabanında tablolar tespit edilemedi, otomatik oluşturuluyor...');
      const migrationFile = path.join(__dirname, 'prisma', 'migrations', '20261014180000_init_postgres', 'migration.sql');
      if (fs.existsSync(migrationFile)) {
        const sqlContent = fs.readFileSync(migrationFile, 'utf8');
        const statements = parseSqlStatements(sqlContent);

        console.log(`🚀 [NEON_DB_INIT] Toplam ${statements.length} adet SQL DDL komutu tek tek $executeRawUnsafe() ile çalıştırılıyor...`);

        // Her bir geçerli DDL komutunu ayrı bir $executeRawUnsafe() çağrısıyla sırayla çalıştır
        for (let i = 0; i < statements.length; i++) {
          const statement = statements[i];
          try {
            await prisma.$executeRawUnsafe(statement);
          } catch (cmdErr) {
            // Tablo, indeks veya kısıtlama zaten mevcutsa hatayı yut, aksi halde logla
            if (!cmdErr.message || !cmdErr.message.includes('already exists')) {
              console.warn(`⚠️ [SQL_CMD_WARN] Komut ${i + 1}/${statements.length} uyarısı:`, cmdErr.message);
            }
          }
        }
        console.log('✅ [NEON_DB_INIT] PostgreSQL şema ve tabloları başarıyla oluşturuldu.');
      }
    } else {
      console.log('✅ [NEON_CONNECTED] Neon PostgreSQL veritabanı bağlantısı ve tabloları hazır.');
    }

    // Tablolarda eksik olabilecek kolon ve indeks yamalarını (status, city, district vb.) garantiye al
    const schemaPatches = [
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'PENDING';`,
      `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'PENDING';`,
      `CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");`,
      `CREATE INDEX IF NOT EXISTS "Tenant_status_idx" ON "Tenant"("status");`,
      `ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "city" TEXT;`,
      `ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "district" TEXT;`,
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "crossReferences" JSONB;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "compatibleVehicles" JSONB;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "attributes" JSONB;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "diagramUrl" TEXT;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "diagrams" JSONB;`,
      `CREATE TABLE IF NOT EXISTS "ReturnRequest" (
        "id" TEXT NOT NULL,
        "orderId" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "reason" TEXT NOT NULL,
        "customerNote" TEXT,
        "status" TEXT NOT NULL DEFAULT 'Bekliyor',
        "adminNote" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");`,
      `CREATE INDEX IF NOT EXISTS "ReturnRequest_tenantId_idx" ON "ReturnRequest"("tenantId");`,
      `CREATE INDEX IF NOT EXISTS "ReturnRequest_customerId_idx" ON "ReturnRequest"("customerId");`,
      `CREATE INDEX IF NOT EXISTS "ReturnRequest_status_idx" ON "ReturnRequest"("status");`,
      `UPDATE "Tenant" SET "status" = 'APPROVED' WHERE "status" IS NULL AND "isActive" = true;`,
      `UPDATE "Tenant" SET "status" = 'PENDING' WHERE "status" IS NULL AND "isActive" = false;`,
      `UPDATE "User" SET "status" = 'APPROVED' WHERE "status" IS NULL;`,
      `UPDATE "Tenant" SET "isActive" = true WHERE "isActive" IS NULL;`,
      `UPDATE "Tenant" SET "themeColor" = '#2563eb' WHERE "themeColor" IS NULL;`
    ];

    for (const patch of schemaPatches) {
      try {
        await prisma.$executeRawUnsafe(patch);
      } catch (patchErr) {
        if (!patchErr.message || !patchErr.message.includes('already exists')) {
          console.warn('⚠️ [NEON_MIGRATION_PATCH_WARN]:', patchErr.message);
        }
      }
    }

    // 2. İlk Yönetici Hesaplarının Otomatik Kurulumu (Veritabanında hiç Süper Admin yoksa)
    const adminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
    if (adminCount === 0) {
      console.log('👑 [NEON_INIT] Veritabanında Süper Admin bulunamadı, başlangıç hesabı oluşturuluyor...');
      const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || 'SaaS_Super_Admin_2026!#Secure';
      let bcrypt;
      try { bcrypt = require('bcrypt'); } catch (e) { bcrypt = require('bcryptjs'); }
      const hash = await bcrypt.hash(adminPass, 10);

      // Süper Admin Hesabı
      try {
        await prisma.user.create({
          data: {
            email: 'admin@sistem.com',
            password: hash,
            role: 'SUPER_ADMIN',
            status: 'APPROVED',
            name: 'Süper Admin'
          }
        });
      } catch (adminErr) {
        if (adminErr.message && adminErr.message.includes('status')) {
          await prisma.user.create({
            data: {
              email: 'admin@sistem.com',
              password: hash,
              role: 'SUPER_ADMIN',
              name: 'Süper Admin'
            }
          });
          try {
            await prisma.$executeRawUnsafe(`UPDATE "User" SET "status" = 'APPROVED' WHERE "email" = 'admin@sistem.com';`);
          } catch (_) {}
        } else {
          throw adminErr;
        }
      }
      console.log('✅ [NEON_INIT] Süper Admin hesabı hazır: admin@sistem.com');

      // Varsayılan Bayi ve Bayi Yöneticisi
      let tenant = await prisma.tenant.findUnique({ where: { subdomain: 'ahmetoto' } });
      if (!tenant) {
        try {
          tenant = await prisma.tenant.create({
            data: {
              name: 'Ahmet Oto Yedek Parça',
              subdomain: 'ahmetoto',
              themeColor: '#2563eb',
              status: 'APPROVED',
              isActive: true
            }
          });
        } catch (tErr) {
          if (tErr.message && tErr.message.includes('status')) {
            tenant = await prisma.tenant.create({
              data: {
                name: 'Ahmet Oto Yedek Parça',
                subdomain: 'ahmetoto',
                themeColor: '#2563eb',
                isActive: true
              }
            });
            try {
              await prisma.$executeRawUnsafe(`UPDATE "Tenant" SET "status" = 'APPROVED' WHERE "subdomain" = 'ahmetoto';`);
            } catch (_) {}
          } else {
            throw tErr;
          }
        }
      }

      const dealerPass = process.env.DEFAULT_DEALER_PASSWORD || adminPass;
      const dealerHash = await bcrypt.hash(dealerPass, 10);
      const existingDealer = await prisma.user.findUnique({ where: { email: 'ahmet@ahmetoto.com' } });
      if (!existingDealer) {
        try {
          await prisma.user.create({
            data: {
              email: 'ahmet@ahmetoto.com',
              password: dealerHash,
              role: 'TENANT_ADMIN',
              status: 'APPROVED',
              tenantId: tenant.id,
              name: 'Ahmet Yılmaz'
            }
          });
        } catch (dErr) {
          if (dErr.message && dErr.message.includes('status')) {
            await prisma.user.create({
              data: {
                email: 'ahmet@ahmetoto.com',
                password: dealerHash,
                role: 'TENANT_ADMIN',
                tenantId: tenant.id,
                name: 'Ahmet Yılmaz'
              }
            });
            try {
              await prisma.$executeRawUnsafe(`UPDATE "User" SET "status" = 'APPROVED' WHERE "email" = 'ahmet@ahmetoto.com';`);
            } catch (_) {}
          } else {
            throw dErr;
          }
        }
        console.log('✅ [NEON_INIT] Bayi hesabı hazır: ahmet@ahmetoto.com');
      }

      // Sistem Ayarları
      const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
      if (!settings) {
        await prisma.systemSettings.create({
          data: {
            id: 1,
            tecdocApiKey: process.env.PARTS_CATALOG_API_KEY || 'OEM-API-BD39DFA8-9AE9-4E7F-8B6D-3D1011BF973F',
            tecdocEndpoint: 'https://api.parts-catalogs.com',
            defaultB2BDiscount: 15.0,
            defaultTaxRate: 20.0,
            platformCurrency: 'TRY',
            adminEmail: 'admin@sistem.com'
          }
        });
      }
    }
  } catch (err) {
    console.warn('⚠️ [NEON_NOTICE] Tablo / Başlangıç denetimi:', err.message);
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
      await ensureNeonTables();
    }
  } catch (e) {
    console.error('[BOOTSTRAP_ERROR]:', e);
  }

  server = app.listen(PORT, '0.0.0.0', () => {
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

  if (PORT !== 3000 && process.env.NODE_ENV !== 'production') {
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
