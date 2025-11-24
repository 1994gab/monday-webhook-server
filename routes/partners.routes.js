const express = require('express');
const router = express.Router();

// Import controllere parteneri
const flexController = require('../controllers/partners/flex.controller');
const crediusController = require('../controllers/partners/credius.controller');
const creditfixController = require('../controllers/partners/creditfix.controller');
const icreditController = require('../controllers/partners/icredit.controller');
const bccreditrapidController = require('../controllers/partners/bccreditrapid.controller');
const flexcreditController = require('../controllers/partners/flexcredit.controller');
const ifnSmsController = require('../controllers/partners/ifn-sms.controller');
const simplucreditController = require('../controllers/partners/simplucredit.controller');

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

// ===== BC CREDIT RAPID =====
router.post('/bccreditrapid', bccreditrapidController.handleBCCreditRapidWebhook);

// ===== FLEXCREDIT =====
router.post('/flexcredit', flexcreditController.handleFlexCreditWebhook);

// ===== IFN-SMS (4Pay) =====
router.post('/ifn-sms', ifnSmsController.handleIfnSmsWebhook);

// ===== SIMPLU CREDIT =====
router.post('/simplucredit', simplucreditController.handleSimpluCreditWebhook);

module.exports = router;
