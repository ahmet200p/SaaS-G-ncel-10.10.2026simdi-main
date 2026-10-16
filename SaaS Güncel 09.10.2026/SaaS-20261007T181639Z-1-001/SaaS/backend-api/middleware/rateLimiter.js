/**
 * ============================================================================
 * Basit & Yüksek Performanslı Bellek İçi Hız Sınırlayıcı (Rate Limiter)
 * Dosya: middleware/rateLimiter.js
 * ============================================================================
 */

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 15, message = 'Çok fazla istek gönderildi. Lütfen bir süre sonra tekrar deneyin.' } = {}) {
  const requests = new Map();

  // Her 5 dakikada bir eski kayıtları temizle
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of requests.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        requests.delete(ip);
      } else {
        requests.set(ip, valid);
      }
    }
  }, 5 * 60 * 1000).unref();

  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || (typeof ip === 'string' && ip.includes('127.0.0.1'));
    if (process.env.NODE_ENV === 'test' || isLocalhost) {
      return next();
    }
    const now = Date.now();

    const timestamps = requests.get(ip) || [];
    const recent = timestamps.filter(t => now - t < windowMs);

    if (recent.length >= max) {
      const oldest = recent[0];
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        message: message,
        retryAfterSeconds: retryAfter
      });
    }

    recent.push(now);
    requests.set(ip, recent);
    next();
  };
}

const config = require('../config');

module.exports = {
  createRateLimiter,
  loginLimiter: createRateLimiter({
    windowMs: config.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 dakika
    max: config.RATE_LIMIT_MAX_ATTEMPTS || 10,               // 10 deneme
    message: 'Güvenlik Uyarısı: Çok fazla başarısız giriş denemesi yapıldı. Lütfen 15 dakika sonra tekrar deneyiniz.'
  }),
  registerLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 15,                  // 15 kayıt
    message: 'Güvenlik Uyarısı: Kısa süre içinde çok fazla üyelik başvurusu yapıldı. Lütfen daha sonra tekrar deneyiniz.'
  }),
  passwordResetLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 5,                   // 5 sıfırlama talebi
    message: 'Güvenlik Uyarısı: Çok fazla şifre sıfırlama isteği gönderildi. Lütfen 15 dakika sonra tekrar deneyiniz.'
  })
};
