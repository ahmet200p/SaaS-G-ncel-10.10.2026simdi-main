// ============================================================================
// Multi-Tenant B2B SaaS - Analitik API Rotaları (routes/analytics.routes.js)
// prompt.md: POST /api/analytics/no-hit
// ============================================================================

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

// 1. Kayıp Arama (No-Hit) Kaydı: POST /api/analytics/no-hit ve /analytics/no-hit
// Frontend arama sonucu '0' olduğunda sessizce tetiklenir (Public / 200 OK)
router.post('/no-hit', analyticsController.recordNoHitLog);
router.post('/', analyticsController.recordNoHitLog);

// 2. Kayıp Arama Raporlama & Analiz: GET /api/analytics/no-hit ve /analytics/no-hit
router.get('/no-hit', analyticsController.getNoHitLogs);
router.get('/', analyticsController.getNoHitLogs);

module.exports = router;
