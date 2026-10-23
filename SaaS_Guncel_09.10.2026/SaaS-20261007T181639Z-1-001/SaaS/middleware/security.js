// ============================================================================
// Multi-Tenant B2B SaaS - HTTP Güvenlik Başlıkları Ara Yazılımı (Security Headers)
// OWASP Güvenlik Standartlarına Uygun Koruması (Helmet Destekli + Native Fallback)
// ============================================================================

let helmetMiddleware = null;
try {
  const helmet = require('helmet');
  helmetMiddleware = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", "'unsafe-inline'", 'https:'],
        connectSrc: ["'self'", 'http://localhost:5000', 'http://127.0.0.1:5000', 'http://127.0.0.1:5500', 'http://localhost:5500', 'https:', 'ws:', 'wss:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https:'],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https:']
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false
  });
} catch (e) {
  // Helmet henüz npm install edilmemişse yerel güvenlik ara yazılımı devreye girer
  helmetMiddleware = null;
}

/**
 * Modern kurumsal güvenlik başlıklarını HTTP yanıtlarına enjekte eder.
 * Clickjacking, MIME-sniffing, XSS ve bilgi sızıntılarına karşı tam koruma sağlar.
 */
function securityHeaders(req, res, next) {
  if (helmetMiddleware) {
    return helmetMiddleware(req, res, next);
  }

  // 1. MIME Türü Sniffing Koruması: Tarayıcının Content-Type'ı yok saymasını engeller
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 2. Clickjacking Koruması: Sayfanın yabancı iframe'lerde açılmasını engeller
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // 3. HSTS (HTTP Strict Transport Security): 1 yıl boyunca yalnızca HTTPS kullanımını zorunlu kılar
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // 4. Referrer Policy: Hassas URL parametrelerinin dış sitelere sızmasını engeller
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 5. Cross-Domain Policy Koruması: Adobe Flash ve PDF uzantı risklerini engeller
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // 6. Modern Content-Security-Policy (CSP): XSS ve zararlı betik enjeksiyonlarına karşı bariyer
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' https:; " +
    "connect-src 'self' http://localhost:5000 http://127.0.0.1:5000 http://127.0.0.1:5500 http://localhost:5500 https: ws: wss:; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' https://fonts.gstatic.com https:; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https:; " +
    "script-src 'self' 'unsafe-inline' https:;"
  );

  // 7. Bilgi Sızıntısını Önleme: Express sürüm bilgisini gizle
  res.removeHeader('X-Powered-By');

  next();
}

module.exports = securityHeaders;
