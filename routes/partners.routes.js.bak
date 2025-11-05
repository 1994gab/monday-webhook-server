const express = require('express');
const router = express.Router();

// Import controllere parteneri
const flexController = require('../controllers/partners/flex.controller');

/**
 * RUTE WEBHOOK-URI PARTENERI
 * Toate rutele sunt relative la /webhook/monday
 */

// ===== FLEX (Mediatel) =====
router.post('/flex', flexController.handleFlexWebhook);

// ===== CREDIUS (viitor) =====
// router.post('/credius', crediusController.handleCrediusWebhook);

// ===== CREDIT FIX (viitor) =====
// router.post('/creditfix', creditfixController.handleCreditFixWebhook);

// ===== ICREDIT (viitor) =====
// router.post('/icredit', icreditController.handleIcreditWebhook);

module.exports = router;
