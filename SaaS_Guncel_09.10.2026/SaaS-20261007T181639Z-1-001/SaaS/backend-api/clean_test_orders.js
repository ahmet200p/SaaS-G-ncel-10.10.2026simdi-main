/**
 * ============================================================================
 * Multi-Tenant B2B SaaS - Test Siparişleri ve Müşteri Temizleme Betiği
 * Dosya: backend-api/clean_test_orders.js
 * ============================================================================
 */

const { cleanArdaTestOrders } = require('../clean_test_orders');

if (require.main === module) {
  cleanArdaTestOrders()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { cleanArdaTestOrders };
