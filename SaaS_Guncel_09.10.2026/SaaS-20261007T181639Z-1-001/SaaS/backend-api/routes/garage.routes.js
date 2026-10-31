// ============================================================================
// B2B AFS Systems - Akıllı Garaj Rotaları (routes/garage.routes.js)
// Oto Servis & Usta Sadakat Modülü CRUD Rotaları
// ============================================================================

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  createGarageVehicle,
  getGarageVehicles,
  getGarageVehicleHistory,
  deleteGarageVehicle
} = require('../controllers/garageController');

// Tüm Akıllı Garaj işlemleri kimlik doğrulama (JWT Bearer Token) gerektirir
router.use(verifyToken);

/**
 * @route   POST /api/garage
 * @desc    Şasi arama sonucundan dönen bir aracı tek tıkla ustanın garajına kaydeder
 */
router.post('/', createGarageVehicle);

/**
 * @route   GET /api/garage
 * @desc    Ustanın kaydettiği tüm araçları listeler
 */
router.get('/', getGarageVehicles);

/**
 * @route   GET /api/garage/history/:vin
 * @desc    Belirli bir şasiye geçmişte bu usta tarafından hangi parçaların sipariş edildiğini listeler
 */
router.get('/history/:vin', getGarageVehicleHistory);
router.get('/history', getGarageVehicleHistory);

/**
 * @route   DELETE /api/garage/:id
 * @desc    Garajdan bir aracı kaldırır
 */
router.delete('/:id', deleteGarageVehicle);

module.exports = router;

