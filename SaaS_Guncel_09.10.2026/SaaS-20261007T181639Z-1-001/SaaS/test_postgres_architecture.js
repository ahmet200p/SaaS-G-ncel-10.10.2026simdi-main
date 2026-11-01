// ============================================================================
// Multi-Tenant B2B SaaS - PostgreSQL Kalıcı Veritabanı Mimarisi Testi
// (test_postgres_architecture.js)
// prompt.md içindeki 4 Adımı Uçtan Uca Doğrular:
// 1. ADIM: Prisma Şemasında PostgreSQL Sağlayıcısı (provider = "postgresql")
// 2. ADIM: .env ve .env.example Dosyalarında PostgreSQL Senkronizasyonu
// 3. ADIM: Eski SQLite ve dev.db Kalıntılarının Temizlenmesi
// 4. ADIM: PostgreSQL Migrasyon Dosyaları ve Prisma Client Uyumluluğu
// ============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const prisma = require('./lib/prisma');

console.log('================================================================');
console.log('🐘 POSTGRESQL KALICI VERİTABANI MİMARİSİ TESTLERİ');
console.log('================================================================');

let passed = 0;
let total = 0;

function check(condition, message) {
  total++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Test başarısız: ${message}`);
  }
}

async function runTests() {
  try {
    const baseDir = __dirname;

    // ========================================================================
    // 1. ADIM: Prisma Şemasının (Schema) Güncellenmesi
    // ========================================================================
    console.log('\n--- 1. ADIM: Prisma Şeması (schema.prisma) Denetimi ---');
    const schemaPath = path.join(baseDir, 'prisma', 'schema.prisma');
    check(fs.existsSync(schemaPath), 'prisma/schema.prisma dosyası mevcut');

    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    check(schemaContent.includes('provider = "postgresql"'), 'datasource db provider = "postgresql" olarak tanımlandı');
    check(!schemaContent.includes('provider = "sqlite"'), 'Eski provider = "sqlite" tanımı tamamen kaldırıldı');
    check(schemaContent.includes('url      = env("DATABASE_URL")'), 'Bağlantı adresi url = env("DATABASE_URL") ile ortam değişkeninden besleniyor');

    // ========================================================================
    // 2. ADIM: Ortam Değişkenlerinin (.env ve .env.example) Senkronizasyonu
    // ========================================================================
    console.log('\n--- 2. ADIM: Ortam Değişkenleri (.env & .env.example) Denetimi ---');
    const envPath = path.join(baseDir, '.env');
    const envExamplePath = path.join(baseDir, '.env.example');

    check(fs.existsSync(envPath), '.env dosyası mevcut');
    check(fs.existsSync(envExamplePath), '.env.example dosyası mevcut');

    const envContent = fs.readFileSync(envPath, 'utf8');
    const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');

    check(envContent.includes('postgresql://'), '.env içindeki DATABASE_URL PostgreSQL protokolünü (postgresql://) kullanıyor');
    check(envContent.includes('saas_admin'), '.env kullanıcı adı Docker Compose postgres servisiyle (saas_admin) eşleşiyor');
    check(envContent.includes('5432'), '.env veritabanı portu PostgreSQL varsayılan portuyla (5432) eşleşiyor');
    check(envContent.includes('saas_db'), '.env veritabanı adı Docker Compose (saas_db) ile eşleşiyor');

    check(envExampleContent.includes('postgresql://'), '.env.example şablonu PostgreSQL formatında');
    check(envExampleContent.includes('your_secure_postgres_password_here'), '.env.example jenerik yer tutucu içeriyor');

    // ========================================================================
    // 3. ADIM: Eski (SQLite) Kalıntılarının Temizlenmesi
    // ========================================================================
    console.log('\n--- 3. ADIM: Eski SQLite ve dev.db Kalıntılarının Temizliği ---');
    check(!fs.existsSync(path.join(baseDir, 'dev.db')), 'Kök dizinde dev.db dosyası bulunmuyor (silindi)');
    check(!fs.existsSync(path.join(baseDir, 'sqlite.db')), 'Kök dizinde sqlite.db dosyası bulunmuyor');
    check(!fs.existsSync(path.join(baseDir, 'prisma', 'dev.db')), 'prisma/dev.db dosyası bulunmuyor (silindi)');
    check(!fs.existsSync(path.join(baseDir, 'prisma', 'sqlite.db')), 'prisma/sqlite.db dosyası bulunmuyor');

    // ========================================================================
    // 4. ADIM: Yeni PostgreSQL Migrasyon Dosyaları ve Prisma Client
    // ========================================================================
    console.log('\n--- 4. ADIM: PostgreSQL Migrasyon ve Prisma Client Doğrulaması ---');
    const migrationsDir = path.join(baseDir, 'prisma', 'migrations');
    check(fs.existsSync(migrationsDir), 'prisma/migrations klasörü mevcut');

    const lockFile = path.join(migrationsDir, 'migration_lock.toml');
    check(fs.existsSync(lockFile), 'prisma/migrations/migration_lock.toml mevcut');
    const lockContent = fs.readFileSync(lockFile, 'utf8');
    check(lockContent.includes('provider = "postgresql"'), 'migration_lock.toml sağlayıcısı provider = "postgresql" olarak mühürlendi');

    // PostgreSQL DDL SQL dosyasının varlığı ve tipleri
    const migrationSqlPath = path.join(migrationsDir, '20261014180000_init_postgres', 'migration.sql');
    check(fs.existsSync(migrationSqlPath), 'PostgreSQL init_postgres migration.sql dosyası mevcut');
    const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');
    check(migrationSql.includes('TIMESTAMP(3)'), 'migration.sql PostgreSQL TIMESTAMP(3) tipini içeriyor');
    check(migrationSql.includes('DOUBLE PRECISION'), 'migration.sql PostgreSQL DOUBLE PRECISION tipini içeriyor');
    check(migrationSql.includes('CONSTRAINT "User_pkey" PRIMARY KEY'), 'migration.sql PostgreSQL PRIMARY KEY kısıtlamalarını içeriyor');

    // ========================================================================
    // 5. ADIM: Canlı PostgreSQL Sorgusu ve Tablo Bütünlüğü
    // ========================================================================
    console.log('\n--- 5. ADIM: Canlı PostgreSQL Veritabanı ve Tablo Sorgulama ---');
    const superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    check(Boolean(superAdmin), 'Canlı PostgreSQL veritabanında Süper Admin kullanıcısı başarıyla sorgulandı');
    check(superAdmin.email === 'admin@sistem.com', 'Süper Admin e-postası admin@sistem.com olarak doğrulandı');

    const tenant = await prisma.tenant.findUnique({ where: { subdomain: 'ahmetoto' } });
    check(Boolean(tenant), 'Canlı PostgreSQL veritabanında Varsayılan Bayi (Ahmet Oto) doğrulandı');

    console.log('\n================================================================');
    console.log(`🎉 POSTGRESQL KALICI VERİTABANI TESTLERİ BAŞARIYLA TAMAMLANDI! (${passed}/${total})`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ Test yürütme sırasında hata:', err.message);
    process.exitCode = 1;
  }
}

runTests();
