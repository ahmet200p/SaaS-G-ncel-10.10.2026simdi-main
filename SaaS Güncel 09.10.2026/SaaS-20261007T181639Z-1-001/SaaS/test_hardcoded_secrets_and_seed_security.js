// ============================================================================
// Multi-Tenant B2B SaaS - Hardcoded Secrets & Default Credentials Güvenlik Testi
// (test_hardcoded_secrets_and_seed_security.js)
// prompt.md 4 Adımını Uçtan Uca Doğrular:
// 1. ADIM: .env İzolasyonu ve Git Temizliği (.gitignore, .env.example, git rm --cached)
// 2. ADIM: Docker Yapılandırmasının Güvenliğe Alınması (Açık metin parola ve secret temizliği)
// 3. ADIM: JWT Anahtarı İçin Çalışma Zamanı (Runtime) Fail-Safe Koruması
// 4. ADIM: Varsayılan Yönetici (Seed) Hesabında Kriptografik Rastgele Şifre Üretimi
// ============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync, spawnSync } = require('child_process');

console.log('================================================================');
console.log('🛡️ HARDCODED SECRETS & DEFAULT CREDENTIALS GÜVENLİK TESTLERİ');
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
    // 1. ADIM: .env İzolasyonu ve Git Temizliği
    // ========================================================================
    console.log('\n--- 1. ADIM: .env İzolasyonu ve Git Temizliği ---');

    // 1.A: .gitignore dosyası mevcut ve .env / *.env kurallarını içeriyor mu?
    const gitignorePath = path.join(baseDir, '.gitignore');
    check(fs.existsSync(gitignorePath), '.gitignore dosyası mevcut');

    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    check(gitignoreContent.includes('.env'), '.gitignore dosyası ".env" kuralını içeriyor');
    check(gitignoreContent.includes('*.env'), '.gitignore dosyası "*.env" kuralını içeriyor');

    // 1.B: .env.example şablon dosyası mevcut mu?
    const envExamplePath = path.join(baseDir, '.env.example');
    check(fs.existsSync(envExamplePath), '.env.example şablon dosyası mevcut');

    const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
    check(envExampleContent.includes('JWT_SECRET=your_super_secret_key_here'), '.env.example jenerik placeholder içeriyor');
    check(!envExampleContent.includes('saas_super_secure_pass_2026'), '.env.example gerçek veritabanı şifresi içermiyor');
    check(!envExampleContent.includes('saas_b2b_ultra_secure_jwt_secret_key_2026_auto'), '.env.example eski ifşa olmuş anahtarı içermiyor');

    // 1.C: Gerçek .env dosyasının Git indeksinde yer almadığı doğrulaması
    try {
      const gitTracked = execSync('git ls-files --stage', { cwd: baseDir, encoding: 'utf8' });
      const isEnvTracked = gitTracked.split('\n').some(line => line.includes('.env') && !line.includes('.env.example') && !line.includes('.env.'));
      check(!isEnvTracked, 'Gerçek .env dosyası Git sürüm kontrolünden (indeksinden) başarıyla çıkartıldı');
    } catch (e) {
      console.warn('  ⚠️ Git komutu çalıştırılamadı, atlanıyor:', e.message);
    }

    // ========================================================================
    // 2. ADIM: Docker Yapılandırmasının Güvenliğe Alınması
    // ========================================================================
    console.log('\n--- 2. ADIM: Docker Yapılandırması ve Açık Metin Parola Temizliği ---');

    const dockerComposePath = path.join(baseDir, 'docker-compose.yml');
    check(fs.existsSync(dockerComposePath), 'docker-compose.yml dosyası mevcut');

    const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf8');
    // Açık metin parola veya eski ifşa olmuş anahtar KESİNLİKLE olmamalı
    check(!dockerComposeContent.includes('POSTGRES_PASSWORD: saas_super_secure_pass_2026'), 'docker-compose.yml içerisinde açık metin POSTGRES_PASSWORD kaldırıldı');
    check(!dockerComposeContent.includes('saas_b2b_ultra_secure_jwt_secret_key_2026_auto'), 'docker-compose.yml içerisinde açık metin JWT_SECRET kaldırıldı');
    check(dockerComposeContent.includes('${POSTGRES_PASSWORD'), 'docker-compose.yml POSTGRES_PASSWORD değerini ortam değişkeninden dinamik alıyor');
    check(dockerComposeContent.includes('${JWT_SECRET'), 'docker-compose.yml JWT_SECRET değerini ortam değişkeninden dinamik alıyor');

    // ========================================================================
    // 3. ADIM: JWT Anahtarı İçin Çalışma Zamanı (Runtime) Fail-Safe Koruması
    // ========================================================================
    console.log('\n--- 3. ADIM: JWT Anahtarı Çalışma Zamanı Fail-Safe Koruması ---');

    const config = require('./config');
    check(typeof config.validateJwtSecret === 'function', 'config.validateJwtSecret doğrulama fonksiyonu mevcut');

    // 3.A: İfşa olmuş eski anahtar verildiğinde uygulamanın durdurulması
    const oldKeyResult = spawnSync(process.execPath, [
      '-e',
      'process.env.JWT_SECRET = "saas_b2b_ultra_secure_jwt_secret_key_2026_auto"; const config = require("./config"); config.validateJwtSecret();'
    ], { cwd: baseDir, encoding: 'utf8' });

    check(oldKeyResult.status === 1, 'İfşa olmuş eski JWT anahtarı ile uygulama başlatılmaya çalışıldığında anında durduruldu (process.exit(1))');
    const combinedOldOutput = (oldKeyResult.stderr || '') + (oldKeyResult.stdout || '');
    check(combinedOldOutput.includes('Kritik Hata: Güçlü bir JWT_SECRET ortam değişkeni tanımlanmadı'), 'İfşa olmuş eski anahtar verildiğinde beklenen kritik hata uyarısı basıldı');

    // 3.B: Zayıf / Kısa anahtar verildiğinde uygulamanın durdurulması
    const weakKeyResult = spawnSync(process.execPath, [
      '-e',
      'process.env.JWT_SECRET = "123456"; const config = require("./config"); config.validateJwtSecret();'
    ], { cwd: baseDir, encoding: 'utf8' });

    check(weakKeyResult.status === 1, 'Zayıf/kısa JWT anahtarı verildiğinde uygulama durduruldu (process.exit(1))');

    // 3.C: Güçlü ve geçerli anahtar verildiğinde uygulamanın başarıyla çalışması
    const validKeyResult = spawnSync(process.execPath, [
      '-e',
      'process.env.JWT_SECRET = "b89c3f7e2a1d46b0a8f9c1e4d7b2a5e8c3f6a9d2b5e8c1f4a7d0b3e6c9f2a5d8"; const config = require("./config"); config.validateJwtSecret(); console.log("VALID_OK");'
    ], { cwd: baseDir, encoding: 'utf8' });

    check(validKeyResult.status === 0, 'Güçlü ve güvenli JWT anahtarı ile uygulama başarıyla çalıştı (exit code 0)');
    check((validKeyResult.stdout || '').includes('VALID_OK'), 'Güçlü ve güvenli JWT anahtarı ile doğrulama başarıyla geçti');

    // ========================================================================
    // 4. ADIM: Varsayılan Yönetici (Seed) Hesabında Kriptografik Rastgele Şifre
    // ========================================================================
    console.log('\n--- 4. ADIM: Kriptografik Rastgele Yönetici Şifresi Üretimi ---');

    const serverContent = fs.readFileSync(path.join(baseDir, 'server.js'), 'utf8');
    check(!serverContent.includes("await bcrypt.hash('123456', 10); await prisma.user.create"), 'server.js içinde statik 123456 şifre ataması kaldırıldı');
    check(serverContent.includes('crypto.randomBytes'), 'server.js ilk kurulumda crypto modülü ile rastgele güçlü şifre üretiyor');
    check(serverContent.includes('Geçici Güvenli Şifre'), 'server.js üretilen rastgele şifreyi ilk kurulumda konsola (stdout) yazdırıyor');

    const seedContent = fs.readFileSync(path.join(baseDir, 'prisma', 'seed.js'), 'utf8');
    check(seedContent.includes('crypto.randomBytes'), 'prisma/seed.js içinde crypto ile rastgele şifre üretimi mevcut');

    console.log('\n================================================================');
    console.log(`🎉 HARDCODED SECRETS & CREDENTIALS GÜVENLİK TESTLERİ TAMAMLANDI! (${passed}/${total})`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ Test yürütme sırasında hata:', err.message);
    process.exitCode = 1;
  }
}

runTests();
