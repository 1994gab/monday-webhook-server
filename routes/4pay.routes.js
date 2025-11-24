const express = require('express');
const router = express.Router();
const fourPayController = require('../controllers/4pay.controller');

/**
 * Route-uri pentru 4Pay SMS
 */

// Trimitere SMS (simplu)
router.post('/send-sms', fourPayController.sendSMS);

// Trimitere SMS cu template
router.post('/send-template-sms', fourPayController.sendTemplateSMS);

// Webhook: Notificări de livrare (DSN) de la 4Pay
router.post('/delivery-status', fourPayController.handleDeliveryStatus);

// Webhook: Primire SMS de la clienți (MO)
router.post('/receive-sms', fourPayController.handleReceiveSMS);

module.exports = router;
