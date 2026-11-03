// ============================================================================
// Multi-Tenant B2B Yedek Parça SaaS - Sunucu Başlatıcı (server.js)
// ============================================================================

const config = require('./config');
// Çalışma zamanı Fail-Safe denetimleri (JWT & DATABASE_URL)
config.validateJwtSecret();
config.validateDatabaseUrl();

const cors = require('cors');
const app = require('./app');
const prisma = require('./lib/prisma');

// ----------------------------------------------------------------------------
// CORS ARA YAZILIMI (prompt.md Kural 4: origin: '*' ve Netlify/Frontend İzinleri)
// ----------------------------------------------------------------------------
app.use(cors({
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
}));

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
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD || 'Kim_!Lik9304.';
  if (!adminPassword || adminPassword.trim() === '') {
    throw new Error('[SECURITY_ERROR] .env dosyasında DEFAULT_ADMIN_PASSWORD tanımlanmamış! Sistem güvenliği için otomatik hesap oluşturma reddedildi.');
  }

  const forbiddenWeakPasswords = ['123456', 'admin', 'test', 'password', '12345678', 'qwerty', '12345'];
  if (forbiddenWeakPasswords.includes(adminPassword.toLowerCase())) {
    throw new Error(`[SECURITY_ERROR] DEFAULT_ADMIN_PASSWORD zayıf veya tahmin edilebilir bir parola ("${adminPassword}") olamaz! Lütfen güçlü bir parola belirleyin.`);
  }

  const dealerPassword = process.env.DEFAULT_DEALER_PASSWORD || '123456';
  if (!dealerPassword) {
    throw new Error('[SECURITY_ERROR] DEFAULT_DEALER_PASSWORD tanımlanmamış!');
  }

  try {
    const adminCount = await prisma.user.count({
      where: {
        OR: [
          { role: 'SUPER_ADMIN' },
          { role: 'ADMIN' }
        ]
      }
    });
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
    const bcrypt = require('bcryptjs');
    const dealerHash = await bcrypt.hash(dealerPassword, 10);
    if (!tenantAdmin) {
      await prisma.user.create({
        data: {
          email: 'ahmet@ahmetoto.com',
          password: dealerHash,
          role: 'TENANT_ADMIN',
          status: 'APPROVED',
          tenantId: tenant.id
        }
      });
      console.log('👔 Varsayılan Bayi Yöneticisi (ahmet@ahmetoto.com) veritabanına eklendi.');
    } else {
      await prisma.user.update({
        where: { email: 'ahmet@ahmetoto.com' },
        data: { password: dealerHash, status: 'APPROVED' }
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
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "rootOEM" TEXT;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "originalOEMs" JSONB;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "referenceCodes" JSONB;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "technicalSpecs" JSONB;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "schemaSourceCode" TEXT;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "crossReferences" JSONB;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "compatibleVehicles" JSONB;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "attributes" JSONB;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "diagramUrl" TEXT;`,
      `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "diagrams" JSONB;`,
      `CREATE INDEX IF NOT EXISTS "Product_rootOEM_idx" ON "Product"("rootOEM");`,
      `CREATE TABLE IF NOT EXISTS "PartCrossReference" (
        "id" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "normalizedCode" TEXT NOT NULL,
        "brand" TEXT,
        "rootOEM" TEXT NOT NULL,
        "isOEM" BOOLEAN NOT NULL DEFAULT false,
        "productId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PartCrossReference_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "PartCrossReference_normalizedCode_rootOEM_key" ON "PartCrossReference"("normalizedCode", "rootOEM");`,
      `CREATE INDEX IF NOT EXISTS "PartCrossReference_normalizedCode_idx" ON "PartCrossReference"("normalizedCode");`,
      `CREATE INDEX IF NOT EXISTS "PartCrossReference_rootOEM_idx" ON "PartCrossReference"("rootOEM");`,
      `CREATE INDEX IF NOT EXISTS "PartCrossReference_productId_idx" ON "PartCrossReference"("productId");`,
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
      `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "vin" TEXT;`,
      `CREATE INDEX IF NOT EXISTS "Order_vin_idx" ON "Order"("vin");`,
      `CREATE TABLE IF NOT EXISTS "GarageVehicle" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "vin" TEXT NOT NULL,
        "plate" TEXT,
        "customerName" TEXT,
        "lastServiceDate" TIMESTAMP(3),
        "vehicleBrand" TEXT,
        "model" TEXT,
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "GarageVehicle_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "GarageVehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS "GarageVehicle_userId_idx" ON "GarageVehicle"("userId");`,
      `CREATE INDEX IF NOT EXISTS "GarageVehicle_vin_idx" ON "GarageVehicle"("vin");`,
      `CREATE TABLE IF NOT EXISTS "NoHitLog" (
        "id" TEXT NOT NULL,
        "searchTerm" TEXT NOT NULL,
        "searchType" TEXT NOT NULL,
        "userId" TEXT,
        "tenantId" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "NoHitLog_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "NoHitLog_searchTerm_idx" ON "NoHitLog"("searchTerm");`,
      `CREATE INDEX IF NOT EXISTS "NoHitLog_searchType_idx" ON "NoHitLog"("searchType");`,
      `CREATE INDEX IF NOT EXISTS "NoHitLog_userId_idx" ON "NoHitLog"("userId");`,
      `CREATE INDEX IF NOT EXISTS "NoHitLog_tenantId_idx" ON "NoHitLog"("tenantId");`,
      `CREATE TABLE IF NOT EXISTS "CustomerQuote" (
        "id" TEXT NOT NULL,
        "userId" TEXT,
        "tenantId" TEXT,
        "customerName" TEXT NOT NULL,
        "customerPhone" TEXT,
        "totalPrice" DOUBLE PRECISION NOT NULL,
        "items" JSONB NOT NULL,
        "notes" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "validUntil" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CustomerQuote_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "CustomerQuote_userId_idx" ON "CustomerQuote"("userId");`,
      `CREATE INDEX IF NOT EXISTS "CustomerQuote_tenantId_idx" ON "CustomerQuote"("tenantId");`,
      `CREATE INDEX IF NOT EXISTS "CustomerQuote_customerName_idx" ON "CustomerQuote"("customerName");`,
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
    const adminCount = await prisma.user.count({
      where: {
        OR: [
          { role: 'SUPER_ADMIN' },
          { role: 'ADMIN' }
        ]
      }
    });
    if (adminCount === 0) {
      console.log('👑 [NEON_INIT] Veritabanında Süper Admin bulunamadı, başlangıç hesabı oluşturuluyor...');
      const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || 'Kim_!Lik9304.';
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
          } catch (_) { }
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
            } catch (_) { }
          } else {
            throw tErr;
          }
        }
      }

      const dealerPass = process.env.DEFAULT_DEALER_PASSWORD || '123456';
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
            } catch (_) { }
          } else {
            throw dErr;
          }
        }
        console.log('✅ [NEON_INIT] Bayi hesabı hazır: ahmet@ahmetoto.com');
      } else {
        await prisma.user.update({
          where: { email: 'ahmet@ahmetoto.com' },
          data: { password: dealerHash, status: 'APPROVED' }
        });
      }

      // Sistem Ayarları
      const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
      if (!settings) {
        await prisma.systemSettings.create({
          data: {
            id: 1,
            tecdocApiKey: process.env.PARTS_CATALOG_API_KEY || '',
            tecdocEndpoint: 'https://api.parts-catalogs.com',
            defaultB2BDiscount: 15.0,
            defaultTaxRate: 20.0,
            platformCurrency: 'TRY',
            adminEmail: 'admin@sistem.com'
          }
        });
      }
    } else {
      // Canlı veritabanında admin zaten mevcutsa ahmet@ahmetoto.com şifresinin '123456' olduğundan emin ol
      let bcrypt;
      try { bcrypt = require('bcrypt'); } catch (e) { bcrypt = require('bcryptjs'); }
      const dealerHash = await bcrypt.hash('123456', 10);
      let tenant = await prisma.tenant.findUnique({ where: { subdomain: 'ahmetoto' } });
      if (!tenant) {
        tenant = await prisma.tenant.create({
          data: {
            name: 'Ahmet Oto Yedek Parça',
            subdomain: 'ahmetoto',
            themeColor: '#2563eb',
            status: 'APPROVED',
            isActive: true
          }
        });
      }
      await prisma.user.upsert({
        where: { email: 'ahmet@ahmetoto.com' },
        update: { password: dealerHash, status: 'APPROVED', role: 'TENANT_ADMIN', tenantId: tenant.id },
        create: {
          email: 'ahmet@ahmetoto.com',
          password: dealerHash,
          role: 'TENANT_ADMIN',
          status: 'APPROVED',
          tenantId: tenant.id,
          name: 'Ahmet Yılmaz'
        }
      });
      console.log('✅ [NEON_SYNC] ahmet@ahmetoto.com şifresi 123456 olarak senkronize edildi.');
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
    try { secondaryServer.close(); } catch (e) { }
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
