// ============================================================================
// Multi-Tenant B2B SaaS - Müşteri Teklifi (Quote) API Rotaları (routes/quote.routes.js)
// prompt.md: POST /api/quotes/generate -> /quote/:uuid
// ============================================================================

const express = require('express');
const router = express.Router();
const quoteController = require('../controllers/quoteController');

// 1. Teklif Oluşturma: POST /api/quotes/generate ve POST /api/quotes
router.post('/generate', quoteController.generateQuote);
router.post('/', quoteController.generateQuote);

// 2. Teklif Detayı (Public WhatsApp Linki): GET /api/quotes/:id veya /quote/:uuid
router.get('/:id', quoteController.getQuoteById);

// 3. Teklif Listeleme: GET /api/quotes
router.get('/', quoteController.getQuotes);

module.exports = router;

