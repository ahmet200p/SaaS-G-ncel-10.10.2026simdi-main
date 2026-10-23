// ============================================================================
// Multi-Tenant B2B SaaS - Merkezi Konfigürasyon Dosyası (config/index.js)
// Ortam değişkenleri (.env) ve kritik sistem ayarlarının tek kaynak noktası
// ============================================================================

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend-api/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

// 3. ADIM: JWT Anahtarı İçin Çalışma Zamanı (Runtime) Koruması (Fail-Safe)
const EXPOSED_WEAK_SECRETS = [
  'saas_b2b_ultra_secure_jwt_secret_key_2026_auto',
  'your_super_secret_key_here',
  'secret',
  '123456',
  'jwt_secret',
  'default_secret',
  'change_me'
];

function validateJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length < 16 || EXPOSED_WEAK_SECRETS.includes(secret.trim())) {
    console.error('Kritik Hata: Güçlü bir JWT_SECRET ortam değişkeni tanımlanmadı');
    process.exit(1);
  }
  return secret.trim();
}

const validatedJwtSecret = validateJwtSecret();

function validateDatabaseUrl() {
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || typeof dbUrl !== 'string' || (!dbUrl.trim().startsWith('postgresql://') && !dbUrl.trim().startsWith('postgres://'))) {
    console.error('Kritik Hata: Geçerli bir DATABASE_URL tanımlanmadı');
    process.exit(1);
  }
  dbUrl = dbUrl.trim();

  // 1. Neon ve PostgreSQL için 'postgres://' protokolünü standart 'postgresql://' protokolüne dönüştür
  if (dbUrl.startsWith('postgres://')) {
    dbUrl = 'postgresql://' + dbUrl.slice('postgres://'.length);
  }

  // 2. Neon Cloud bağlantılarında SSL zorunludur. sslmode parametresi yoksa otomatik ekle
  if (dbUrl.includes('.neon.tech') && !dbUrl.includes('sslmode=')) {
    const separator = dbUrl.includes('?') ? '&' : '?';
    dbUrl += `${separator}sslmode=require`;
  }

  process.env.DATABASE_URL = dbUrl;
  return dbUrl;
}

const validatedDatabaseUrl = validateDatabaseUrl();

const config = {
  PORT: parseInt(process.env.PORT, 10) || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: validatedDatabaseUrl,
  JWT_SECRET: validatedJwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 dakika
  RATE_LIMIT_MAX_ATTEMPTS: 10,           // Maksimum 10 deneme
  DEFAULT_VAT_RATE: 20.00,               // %20 Standart KDV Oranı
  validateJwtSecret,
  validateDatabaseUrl,
  EXPOSED_WEAK_SECRETS
};

module.exports = config;
