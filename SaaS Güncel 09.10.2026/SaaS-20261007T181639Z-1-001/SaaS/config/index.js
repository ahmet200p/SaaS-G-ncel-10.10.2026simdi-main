// ============================================================================
// Multi-Tenant B2B SaaS - Merkezi Konfigürasyon Dosyası (config/index.js)
// Ortam değişkenleri (.env) ve kritik sistem ayarlarının tek kaynak noktası
// ============================================================================

require('dotenv').config();

const config = {
  PORT: parseInt(process.env.PORT, 10) || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  JWT_SECRET: process.env.JWT_SECRET || 'saas_b2b_ultra_secure_jwt_secret_key_2026_auto',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 dakika
  RATE_LIMIT_MAX_ATTEMPTS: 10,           // Maksimum 10 deneme
  DEFAULT_VAT_RATE: 20.00                // %20 Standart KDV Oranı
};

module.exports = config;
