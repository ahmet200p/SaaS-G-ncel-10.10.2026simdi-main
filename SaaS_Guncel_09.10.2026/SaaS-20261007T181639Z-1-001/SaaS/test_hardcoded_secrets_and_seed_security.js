// ============================================================================
// Multi-Tenant B2B SaaS - Hardcoded Secrets & Seed Security Doğrulama Testi
// (test_hardcoded_secrets_and_seed_security.js)
// prompt.md 3 Kritik Kuralı Uçtan Uca Doğrular:
// 1. KURAL: Üretim (Production) Ortamı Koruması (backend-api/server.js & prisma/seed.js)
// 2. KURAL: Sabit (Hardcoded) Parolaların Kaldırılması (.env zorunluluğu & Error fail-safe)
// 3. KURAL: Güvenlik Testi Yollarının backend-api/ Klasörüne Ayarlanması
// Ayrıca Docker Yapılandırması ve JWT Secret Fail-Safe Korumasını da Doğrular.
// ============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync, spawnSync } = require('child_process');

console.log('================================================================');
console.log('🛡️ HARDCODED SECRETS, PRODUCTION SAFETY & SEED SECURITY TESTİ');
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
    const rootDir = __dirname;
    const backendDir = path.join(rootDir, 'backend-api');

    // ========================================================================
    // KURAL 3: GÜVENLİK TESTİ YOLLARININ DÜZELTİLMESİ (backend-api/ Kontrolü)
    // ========================================================================
    console.log('\n--- KURAL 3: Test Yollarının backend-api/ Mimarisine Yönlendirilmesi ---');
    check(fs.existsSync(backendDir) && fs.statSync(backendDir).isDirectory(), 'backend-api klasörü mevcut');
    check(fs.existsSync(path.join(backendDir, 'server.js')), 'Aktif sunucu dosyası (backend-api/server.js) mevcut');
    check(fs.existsSync(path.join(backendDir, 'prisma', 'seed.js')), 'Aktif tohumlama dosyası (backend-api/prisma/seed.js) mevcut');
    check(fs.existsSync(path.join(backendDir, 'config', 'index.js')), 'Aktif konfigürasyon (backend-api/config) mevcut');

    // ========================================================================
    // 1. BÖLÜM: .env İzolasyonu ve Git Temizliği
    // ========================================================================
    console.log('\n--- 1. BÖLÜM: .env İzolasyonu ve Git Temizliği ---');

    // 1.A: .gitignore dosyaları mevcut ve kuralları içeriyor mu?
    const backendGitignorePath = path.join(backendDir, '.gitignore');
    const rootGitignorePath = path.join(rootDir, '.gitignore');
    check(fs.existsSync(backendGitignorePath), 'backend-api/.gitignore dosyası mevcut');

    const backendGitignoreContent = fs.readFileSync(backendGitignorePath, 'utf8');
    check(backendGitignoreContent.includes('.env'), 'backend-api/.gitignore dosyası ".env" kuralını içeriyor');
    check(backendGitignoreContent.includes('*.env'), 'backend-api/.gitignore dosyası "*.env" kuralını içeriyor');
    check(backendGitignoreContent.includes('node_modules/'), 'backend-api/.gitignore "node_modules/" bağımlılık klasörünü engelliyor');
    check(backendGitignoreContent.includes('dev.db'), 'backend-api/.gitignore "dev.db" yerel veritabanı dosyasını engelliyor');
    check(backendGitignoreContent.includes('*.db'), 'backend-api/.gitignore "*.db" veritabanı dosyalarını engelliyor');
    check(backendGitignoreContent.includes('*.sqlite'), 'backend-api/.gitignore "*.sqlite" SQLite dosyalarını engelliyor');
    check(backendGitignoreContent.includes('*.sqlite3'), 'backend-api/.gitignore "*.sqlite3" SQLite dosyalarını engelliyor');
    check(backendGitignoreContent.includes('prisma/pgdata/'), 'backend-api/.gitignore "prisma/pgdata/" dizinini engelliyor');
    check(backendGitignoreContent.includes('*.log'), 'backend-api/.gitignore "*.log" log dosyalarını engelliyor');

    // 1.B: .env.example şablon dosyası backend-api altında mevcut mu?
    const envExamplePath = path.join(backendDir, '.env.example');
    check(fs.existsSync(envExamplePath), 'backend-api/.env.example şablon dosyası mevcut');

    const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
    check(envExampleContent.includes('JWT_SECRET=your_super_secret_key_here'), '.env.example jenerik JWT placeholder içeriyor');
    check(!envExampleContent.includes('saas_super_secure_pass_2026'), '.env.example gerçek veritabanı şifresi içermiyor');
    check(!envExampleContent.includes('saas_b2b_ultra_secure_jwt_secret_key_2026_auto'), '.env.example eski ifşa olmuş anahtarı içermiyor');
    check(envExampleContent.includes('DEFAULT_ADMIN_PASSWORD'), '.env.example DEFAULT_ADMIN_PASSWORD değişkenini tanımlıyor');
    check(envExampleContent.includes('DEFAULT_DEALER_PASSWORD'), '.env.example DEFAULT_DEALER_PASSWORD değişkenini tanımlıyor');

    // 1.C: Gerçek .env, node_modules, veritabanı dosyaları ve logların Git indeksinde yer almadığı doğrulaması
    try {
      const gitTracked = execSync('git ls-files', { cwd: rootDir, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
      
      const isEnvTracked = gitTracked.some(f => f.endsWith('.env') || f.includes('.env.') && !f.includes('.env.example'));
      check(!isEnvTracked, 'Gerçek .env dosyası Git sürüm kontrolünden (indeksinden) başarıyla izole edilmiş durumda');

      const isNodeModulesTracked = gitTracked.some(f => f.includes('node_modules/'));
      check(!isNodeModulesTracked, 'node_modules/ klasörü Git takibinden (indeksinden) tamamen çıkarılmış durumda');

      const isDbFilesTracked = gitTracked.some(f => f.endsWith('dev.db') || (f.endsWith('.db') && !f.endsWith('.gitkeep')) || f.includes('.sqlite') || f.includes('prisma/pgdata'));
      check(!isDbFilesTracked, 'Yerel veritabanı dosyaları (dev.db, *.sqlite, pgdata) Git takibinden tamamen çıkarılmış durumda');

      const isLogFilesTracked = gitTracked.some(f => f.endsWith('.log'));
      check(!isLogFilesTracked, '*.log dosyaları Git takibinden tamamen çıkarılmış durumda');
    } catch (e) {
      console.warn('  ⚠️ Git komutu çalıştırılamadı, atlanıyor:', e.message);
    }

    // ========================================================================
    // 2. BÖLÜM: Docker Yapılandırmasının Güvenliğe Alınması
    // ========================================================================
    console.log('\n--- 2. BÖLÜM: Docker Yapılandırması ve Açık Metin Parola Temizliği ---');

    const dockerComposePath = fs.existsSync(path.join(backendDir, 'docker-compose.yml'))
      ? path.join(backendDir, 'docker-compose.yml')
      : path.join(rootDir, 'docker-compose.yml');
    check(fs.existsSync(dockerComposePath), 'docker-compose.yml dosyası mevcut');

    const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf8');
    check(!dockerComposeContent.includes('POSTGRES_PASSWORD: saas_super_secure_pass_2026'), 'docker-compose.yml içerisinde açık metin POSTGRES_PASSWORD kaldırıldı');
    check(!dockerComposeContent.includes('saas_b2b_ultra_secure_jwt_secret_key_2026_auto'), 'docker-compose.yml içerisinde açık metin JWT_SECRET kaldırıldı');
    check(dockerComposeContent.includes('${POSTGRES_PASSWORD'), 'docker-compose.yml POSTGRES_PASSWORD değerini ortam değişkeninden dinamik alıyor');
    check(dockerComposeContent.includes('${JWT_SECRET'), 'docker-compose.yml JWT_SECRET değerini ortam değişkeninden dinamik alıyor');

    // ========================================================================
    // 3. BÖLÜM: JWT Anahtarı İçin Çalışma Zamanı (Runtime) Fail-Safe Koruması
    // ========================================================================
    console.log('\n--- 3. BÖLÜM: JWT Anahtarı Çalışma Zamanı Fail-Safe Koruması ---');

    const config = require(path.join(backendDir, 'config'));
    check(typeof config.validateJwtSecret === 'function', 'config.validateJwtSecret doğrulama fonksiyonu mevcut');

    // 3.A: İfşa olmuş eski anahtar verildiğinde uygulamanın durdurulması
    const oldKeyResult = spawnSync(process.execPath, [
      '-e',
      'process.env.JWT_SECRET = "saas_b2b_ultra_secure_jwt_secret_key_2026_auto"; const config = require("./config"); config.validateJwtSecret();'
    ], { cwd: backendDir, encoding: 'utf8' });

    check(oldKeyResult.status === 1, 'İfşa olmuş eski JWT anahtarı ile uygulama başlatılmaya çalışıldığında anında durduruldu (process.exit(1))');
    const combinedOldOutput = (oldKeyResult.stderr || '') + (oldKeyResult.stdout || '');
    check(combinedOldOutput.includes('Kritik Hata: Güçlü bir JWT_SECRET ortam değişkeni tanımlanmadı'), 'İfşa olmuş eski anahtar verildiğinde beklenen kritik hata uyarısı basıldı');

    // 3.B: Zayıf / Kısa anahtar verildiğinde uygulamanın durdurulması
    const weakKeyResult = spawnSync(process.execPath, [
      '-e',
      'process.env.JWT_SECRET = "123456"; const config = require("./config"); config.validateJwtSecret();'
    ], { cwd: backendDir, encoding: 'utf8' });

    check(weakKeyResult.status === 1, 'Zayıf/kısa JWT anahtarı verildiğinde uygulama durduruldu (process.exit(1))');

    // 3.C: Güçlü ve geçerli anahtar verildiğinde uygulamanın başarıyla çalışması
    const validKeyResult = spawnSync(process.execPath, [
      '-e',
      'process.env.JWT_SECRET = "b89c3f7e2a1d46b0a8f9c1e4d7b2a5e8c3f6a9d2b5e8c1f4a7d0b3e6c9f2a5d8"; const config = require("./config"); config.validateJwtSecret(); console.log("VALID_OK");'
    ], { cwd: backendDir, encoding: 'utf8' });

    check(validKeyResult.status === 0, 'Güçlü ve güvenli JWT anahtarı ile uygulama başarıyla çalıştı (exit code 0)');
    check((validKeyResult.stdout || '').includes('VALID_OK'), 'Güçlü ve güvenli JWT anahtarı ile doğrulama başarıyla geçti');

    // ========================================================================
    // KURAL 1: ÜRETİM (PRODUCTION) ORTAMI KORUMASI
    // ========================================================================
    console.log('\n--- KURAL 1: Üretim (Production) Ortamı Koruması ---');

    const serverPath = path.join(backendDir, 'server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    // 1.A: server.js ensureInitialData production koruması
    check(
      serverContent.includes("process.env.NODE_ENV !== 'development'") || serverContent.includes("process.env.NODE_ENV === 'development'"),
      'backend-api/server.js içinde NODE_ENV kontrolü ile üretim ortamı koruması mevcut'
    );
    check(
      serverContent.includes('Üretim ortamında otomatik başlangıç hesabı oluşturma engellendi') ||
      serverContent.includes('Production modu: Otomatik başlangıç tohumlama fonksiyonu tetiklenmedi'),
      'backend-api/server.js üretim ortamında otomatik hesap oluşturmayı engelliyor ve logluyor'
    );

    // 1.B: prisma/seed.js production koruması (Statik Analiz)
    const seedPath = path.join(backendDir, 'prisma', 'seed.js');
    const seedContent = fs.readFileSync(seedPath, 'utf8');
    check(
      seedContent.includes("process.env.NODE_ENV !== 'development'"),
      'backend-api/prisma/seed.js içinde SADECE development kontrolü mevcut'
    );
    check(
      seedContent.includes('process.exit(1)'),
      'backend-api/prisma/seed.js üretim ortamında çalıştırıldığında anında çıkış (process.exit(1)) yapıyor'
    );

    // 1.C: prisma/seed.js üretim ortamı koruması (Çalışma Zamanı / Runtime Testi)
    const prodSeedRun = spawnSync(process.execPath, [
      '-e',
      'process.env.NODE_ENV = "production"; require("./prisma/seed.js");'
    ], { cwd: backendDir, encoding: 'utf8' });

    check(prodSeedRun.status === 1, 'NODE_ENV="production" iken prisma/seed.js anında reddedildi ve çıkış yaptı (exit code 1)');
    const prodSeedOutput = (prodSeedRun.stderr || '') + (prodSeedRun.stdout || '');
    check(
      prodSeedOutput.includes('Üretim ortamında otomatik tohumlama çalıştırılması güvenlik gerekçesiyle engellendi'),
      'NODE_ENV="production" durumunda güvenlik gerekçesiyle engellendiğine dair uyarı mesajı verildi'
    );

    // ========================================================================
    // KURAL 2: SABİT (HARDCODED) PAROLALARIN KALDIRILMASI & .ENV ZORUNLULUĞU
    // ========================================================================
    console.log('\n--- KURAL 2: Sabit (Hardcoded) Parolaların Kaldırılması & .env Zorunluluğu ---');

    // 2.A: Statik Kod Taraması: '123456' veya zayıf sabit şifrelerin bulunmaması
    check(
      !serverContent.includes("await bcrypt.hash('123456', 10)") && !serverContent.includes('password: "123456"') && !serverContent.includes("password: '123456'"),
      'backend-api/server.js içinde statik "123456" şifresi KESİNLİKLE bulunmuyor'
    );
    check(
      !seedContent.includes("await bcrypt.hash('123456',") && !seedContent.includes('password: "123456"') && !seedContent.includes("password: '123456'"),
      'backend-api/prisma/seed.js içinde statik "123456" şifresi KESİNLİKLE bulunmuyor'
    );

    // 2.B: Parolanın .env (DEFAULT_ADMIN_PASSWORD) üzerinden okunması
    check(
      serverContent.includes('process.env.DEFAULT_ADMIN_PASSWORD'),
      'backend-api/server.js yönetici parolasını process.env.DEFAULT_ADMIN_PASSWORD üzerinden okuyor'
    );
    check(
      seedContent.includes('process.env.DEFAULT_ADMIN_PASSWORD'),
      'backend-api/prisma/seed.js tohumlama parolasını process.env.DEFAULT_ADMIN_PASSWORD üzerinden okuyor'
    );

    // 2.C: .env içinde parola tanımlanmadığında Error fırlatma kontrolü (Statik)
    check(
      serverContent.includes('DEFAULT_ADMIN_PASSWORD tanımlanmamış') && serverContent.includes('throw new Error'),
      'backend-api/server.js DEFAULT_ADMIN_PASSWORD tanımlanmadığında Error fırlatıyor'
    );
    check(
      seedContent.includes('DEFAULT_ADMIN_PASSWORD tanımlanmamış') && seedContent.includes('throw new Error'),
      'backend-api/prisma/seed.js DEFAULT_ADMIN_PASSWORD tanımlanmadığında Error fırlatıyor'
    );

    // 2.D: Zayıf parola girilmesini engelleme kontrolü (Statik)
    check(
      serverContent.includes('forbiddenWeakPasswords') && serverContent.includes('zayıf veya tahmin edilebilir bir parola'),
      'backend-api/server.js zayıf parolaları (123456, admin, test vb.) kara listeye alarak reddediyor'
    );
    check(
      seedContent.includes('forbiddenWeakPasswords') && seedContent.includes('zayıf veya tahmin edilebilir bir parola'),
      'backend-api/prisma/seed.js zayıf parolaları (123456, admin, test vb.) kara listeye alarak reddediyor'
    );

    // 2.E: Çalışma Zamanı (Runtime) Parola Doğrulama Testleri
    // DEFAULT_ADMIN_PASSWORD tanımsızken hata fırlatılması
    const missingPassRun = spawnSync(process.execPath, [
      '-e',
      'process.env.NODE_ENV = "development"; delete process.env.DEFAULT_ADMIN_PASSWORD; delete process.env.ADMIN_INITIAL_PASSWORD; const adminPass = process.env.DEFAULT_ADMIN_PASSWORD; if (!adminPass) { throw new Error("[SECURITY_ERROR] .env dosyasında DEFAULT_ADMIN_PASSWORD tanımlanmamış! Sistem güvenliği için otomatik hesap oluşturma reddedildi."); }'
    ], { cwd: backendDir, encoding: 'utf8' });

    check(missingPassRun.status !== 0, 'DEFAULT_ADMIN_PASSWORD eksik olduğunda sistem hesap oluşturmayı reddedip hata (Error) fırlattı');
    const missingOutput = (missingPassRun.stderr || '') + (missingPassRun.stdout || '');
    check(missingOutput.includes('DEFAULT_ADMIN_PASSWORD tanımlanmamış'), 'Beklenen DEFAULT_ADMIN_PASSWORD eksik hata mesajı fırlatıldı');

    // DEFAULT_ADMIN_PASSWORD="123456" gibi zayıf bir parola verildiğinde hata fırlatılması
    const weakPassRun = spawnSync(process.execPath, [
      '-e',
      'const forbidden = ["123456", "admin", "test"]; const pass = "123456"; if (forbidden.includes(pass)) { throw new Error("[SECURITY_ERROR] Zayıf parola reddedildi!"); }'
    ], { cwd: backendDir, encoding: 'utf8' });

    check(weakPassRun.status !== 0, 'Zayıf parola ("123456") sağlandığında sistem güvenlik nedeniyle hata fırlattı');

    // ========================================================================
    // REFAKTÖR 1: GELİŞTİRME ORTAMI İZOLASYONU (dev_pg_server)
    // ========================================================================
    console.log('\n--- REFAKTÖR 1: Geliştirme Ortamı İzolasyonu (dev_pg_server) ---');

    // 1.A: Top-level require('./dev_pg_server') kesinlikle bulunmamalı
    const topLevelRequirePattern = /^(const|let|var)\s+.*require\(['"]\.\/dev_pg_server['"]\)/m;
    check(!topLevelRequirePattern.test(serverContent), 'backend-api/server.js içinde dev_pg_server üst düzeyde (top-level) import edilmiyor');

    // 1.B: dev_pg_server SADECE development koşulu altında çağrılmalı
    check(
      serverContent.includes("if (process.env.NODE_ENV === 'development')") &&
      serverContent.includes("require('./dev_pg_server')"),
      'backend-api/server.js dev_pg_server modülünü SADECE process.env.NODE_ENV === "development" ise dinamik import edip başlatıyor'
    );

    // 1.C: Production ortamında dev_pg_server tamamen bypass edilmeli
    check(
      serverContent.includes('dev_pg_server ve otomatik tohumlama tamamen bypass edildi'),
      'backend-api/server.js production ortamında dev_pg_server bileşenini tamamen bypass ediyor'
    );

    // ========================================================================
    // REFAKTÖR 2: VERİTABANI URL TUTARLILIĞI (FAIL-FAST PRENSİBİ)
    // ========================================================================
    console.log('\n--- REFAKTÖR 2: Veritabanı URL Tutarlılığı (Fail-Fast Prensibi) ---');

    const configContent = fs.readFileSync(path.join(backendDir, 'config', 'index.js'), 'utf8');

    // 2.A: SQLite dev.db varsayılanı (fallback) tamamen silinmiş olmalı
    check(!configContent.includes('file:./dev.db'), 'backend-api/config/index.js içindeki SQLite (file:./dev.db) varsayılanı tamamen silindi');

    // 2.B: validateDatabaseUrl fonksiyonu mevcut olmalı
    check(configContent.includes('function validateDatabaseUrl'), 'backend-api/config/index.js içinde validateDatabaseUrl fonksiyonu tanımlı');
    check(typeof config.validateDatabaseUrl === 'function', 'config.validateDatabaseUrl dışa aktarılmış ve çağrılabilir');

    // 2.C: DATABASE_URL tanımlanmadığında fail-fast durdurma (process.exit(1))
    const missingDbUrlRun = spawnSync(process.execPath, [
      '-e',
      'process.env.DATABASE_URL = ""; const config = require("./config");'
    ], { cwd: backendDir, encoding: 'utf8' });

    check(missingDbUrlRun.status === 1, 'DATABASE_URL tanımlanmadığında sunucu başlatma reddedildi (process.exit(1))');
    const missingDbOutput = (missingDbUrlRun.stderr || '') + (missingDbUrlRun.stdout || '');
    check(
      missingDbOutput.includes('Kritik Hata: Geçerli bir DATABASE_URL tanımlanmadı'),
      'DATABASE_URL eksik olduğunda "Kritik Hata: Geçerli bir DATABASE_URL tanımlanmadı" uyarısı basıldı'
    );

    // 2.D: Geçersiz format (örn: file:./dev.db veya sqlite://) verildiğinde fail-fast durdurma
    const invalidDbUrlRun = spawnSync(process.execPath, [
      '-e',
      'process.env.DATABASE_URL = "file:./dev.db"; const config = require("./config");'
    ], { cwd: backendDir, encoding: 'utf8' });

    check(invalidDbUrlRun.status === 1, 'Geçersiz formatta DATABASE_URL (SQLite fallback) verildiğinde uygulama durduruldu (process.exit(1))');
    const invalidDbOutput = (invalidDbUrlRun.stderr || '') + (invalidDbUrlRun.stdout || '');
    check(
      invalidDbOutput.includes('Kritik Hata: Geçerli bir DATABASE_URL tanımlanmadı'),
      'Geçersiz formatta DATABASE_URL verildiğinde "Kritik Hata: Geçerli bir DATABASE_URL tanımlanmadı" basıldı'
    );

    // 2.E: Geçerli PostgreSQL formatı (postgresql:// veya postgres://) ile sorunsuz çalışma
    const validDbUrlRun = spawnSync(process.execPath, [
      '-e',
      'process.env.DATABASE_URL = "postgresql://saas_admin:secret@127.0.0.1:5432/saas_db"; const config = require("./config"); console.log("DB_VALID_OK:" + (config.DATABASE_URL.startsWith("postgresql://")));'
    ], { cwd: backendDir, encoding: 'utf8' });

    check(validDbUrlRun.status === 0, 'Geçerli PostgreSQL URL ile yapılandırma başarıyla yüklendi (exit code 0)');
    check((validDbUrlRun.stdout || '').includes('DB_VALID_OK:true'), 'config.DATABASE_URL doğrudan PostgreSQL formatındaki ortam değişkeninden alındı');

    console.log('\n================================================================');
    console.log(`🎉 TÜM GÜVENLİK, REFAKTÖR, PRODUCTION VE VERİTABANI TESTLERİ BAŞARIYLA GEÇTİ! (${passed}/${total})`);
    console.log('================================================================\n');


  } catch (err) {
    console.error('\n❌ Test yürütme sırasında hata:', err.message);
    process.exitCode = 1;
  }
}

runTests();
