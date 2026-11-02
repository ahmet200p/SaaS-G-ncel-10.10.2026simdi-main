// ============================================================================
// Multi-Tenant B2B SaaS - Bayi (BAYI) API Rotaları (routes/bayi.routes.js)
// prompt.md Kural 3: /api/bayi/products
// Sadece yetkili bayilerin kendi ürünlerini ekleyip/silebileceği CRUD işlemleri
// ============================================================================

const express = require('express');
const router = express.Router();
const { verifyBayi } = require('../middleware/auth');
const tenantRouter = require('./tenant');

// CORS Preflight (OPTIONS) istekleri güvenlik duvarına takılmadan doğrudan geçer
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }
  next();
});

// prompt.md Kural 2: verifyBayi adında role özel middleware
router.use(verifyBayi);

// Bayi CRUD & Yönetim Rotalarını doğrudan tenantRouter üzerinden bağla
// /api/bayi/products -> GET, POST
// /api/bayi/products/:id -> GET, PUT, PATCH, DELETE
// /api/bayi/orders, /api/bayi/customers vb.
router.use('/', tenantRouter);

module.exports = router;
