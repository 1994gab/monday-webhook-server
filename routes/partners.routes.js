const express = require('express');
const router = express.Router();

// Import controllere parteneri
const flexController = require('../controllers/partners/flex.controller');
const crediusController = require('../controllers/partners/credius.controller');
const creditfixController = require('../controllers/partners/creditfix.controller');
const icreditController = require('../controllers/partners/icredit.controller');

/**
 * RUTE WEBHOOK-URI PARTENERI
 * Toate rutele sunt relative la /webhook/monday
 */

// ===== FLEX (Mediatel) =====
router.post('/flex', flexController.handleFlexWebhook);

// ===== CREDIUS =====
router.post('/credius', crediusController.handleCrediusWebhook);

// ===== CREDITFIX =====
router.post('/creditfix', creditfixController.handleCreditFixWebhook);

// ===== ICREDIT =====
router.post('/icredit', icreditController.handleIcreditWebhook);

module.exports = router;
