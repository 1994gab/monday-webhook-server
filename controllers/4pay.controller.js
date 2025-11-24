const fourPayService = require('../services/4pay.service');
const slackService = require('../services/slack.service');

/**
 * POST /api/4pay/send-sms
 *
 * Trimite un SMS prin 4Pay
 *
 * Body: {
 *   phone: "0722123456" sau "+40722123456",
 *   message: "Textul mesajului",
 *   externalMessageId: "optional-id-123"
 * }
 */
async function sendSMS(req, res) {
  try {
    console.log('\n📱 [4PAY CONTROLLER] Request primit...');

    const { phone, message, externalMessageId } = req.body;

    // Validare input
    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: 'Phone și message sunt obligatorii'
      });
    }

    // Trimite SMS
    const result = await fourPayService.sendSMS({
      phone,
      message,
      externalMessageId
    });

    // Log rezultat
    if (result.success) {
      console.log(`✅ [4PAY] SMS trimis cu succes către ${result.phone} - msgID: ${result.msgId}`);
    } else {
      console.log(`❌ [4PAY] Eroare trimitere SMS: ${result.message}`);
    }

    // Response
    return res.status(result.success ? 200 : 400).json(result);

  } catch (error) {
    console.error('❌ [4PAY CONTROLLER] Eroare:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Eroare server la trimitere SMS',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * POST /api/4pay/send-template-sms
 *
 * Trimite un SMS folosind un template predefinit
 *
 * Body: {
 *   phone: "0722123456",
 *   template: "LEAD_RECEIVED" | "CREDIT_APPROVED" | "CREDIT_REJECTED" | "GENERIC",
 *   data: {
 *     name: "Ion Popescu",   // pentru LEAD_RECEIVED, CREDIT_APPROVED, CREDIT_REJECTED
 *     amount: "5000",         // pentru CREDIT_APPROVED
 *     message: "Text custom"  // pentru GENERIC
 *   },
 *   externalMessageId: "optional-id-123"
 * }
 */
async function sendTemplateSMS(req, res) {
  try {
    console.log('\n📱 [4PAY CONTROLLER] Request template SMS...');

    const { phone, template, data, externalMessageId } = req.body;

    // Validare input
    if (!phone || !template || !data) {
      return res.status(400).json({
        success: false,
        error: 'Phone, template și data sunt obligatorii'
      });
    }

    // Trimite SMS cu template
    const result = await fourPayService.sendTemplatedSMS(
      phone,
      template,
      data,
      externalMessageId
    );

    // Log rezultat
    if (result.success) {
      console.log(`✅ [4PAY] SMS template trimis cu succes către ${result.phone} - msgID: ${result.msgId}`);
    } else {
      console.log(`❌ [4PAY] Eroare trimitere SMS template: ${result.message}`);
    }

    // Response
    return res.status(result.success ? 200 : 400).json(result);

  } catch (error) {
    console.error('❌ [4PAY CONTROLLER] Eroare template:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Eroare server la trimitere SMS template',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * POST /api/4pay/delivery-status (Webhook DSN)
 *
 * Primește notificări de livrare de la 4Pay
 *
 * Body: {
 *   event_type: "RX-DSN",
 *   msgID: "987654321",
 *   servID: 5873,
 *   external_messageID: "optional-id",
 *   msg_src: "1234",
 *   msg_dst: "0722000111",
 *   msg_network: "V",
 *   dlv_date: "2023-10-30 00:00:00",
 *   dlv_status: "D",  // D=delivered, F=failed, E=error, T=in transit, B=buffered
 *   dlv_error: "OK"
 * }
 */
async function handleDeliveryStatus(req, res) {
  try {
    console.log('\n📬 [4PAY DSN] Notificare de livrare primită...');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const { event_type, msgID, dlv_status, msg_dst, msg_network, dlv_error, external_messageID } = req.body;

    // Verificare event type
    if (event_type !== 'RX-DSN') {
      console.log(`⚠️ [4PAY DSN] Event type incorect: ${event_type}`);
      return res.sendStatus(200); // Răspundem OK oricum
    }

    // Map status codes
    const statusNames = {
      'D': 'Livrat',
      'F': 'Eșuat',
      'E': 'Eroare',
      'T': 'În tranzit',
      'B': 'În buffer'
    };

    // Map network codes
    const networkNames = {
      'O': 'Orange',
      'V': 'Vodafone',
      'C': 'Telekom Mobile',
      'R': 'RDS/Digi',
      'I': 'International',
      'L': 'Lycamobile',
      'T': 'Telekom'
    };

    const statusName = statusNames[dlv_status] || dlv_status;
    const networkName = networkNames[msg_network] || msg_network;

    console.log(`📨 [4PAY DSN] SMS ${msgID} către ${msg_dst} (${networkName}): ${statusName} - ${dlv_error}`);

    // Trimite notificare Slack
    const slackService = require('../services/slack.service');
    const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_IFN_SMS;

    if (SLACK_WEBHOOK) {
      let slackMessage = '';

      if (dlv_status === 'D') {
        // SMS livrat cu succes
        slackMessage = `✅ *SMS livrat cu succes*\n` +
          `Telefon: *${msg_dst}*\n` +
          `Rețea: *${networkName}*\n` +
          `msgID: ${msgID}\n` +
          `Status: ${dlv_error}`;
      } else if (dlv_status === 'F' || dlv_status === 'E') {
        // SMS eșuat
        slackMessage = `❌ *SMS eșuat*\n` +
          `Telefon: *${msg_dst}*\n` +
          `Rețea: *${networkName}*\n` +
          `msgID: ${msgID}\n` +
          `Eroare: ${dlv_error}`;
      } else {
        // Alte statusuri (în tranzit, buffer)
        slackMessage = `📨 *SMS ${statusName}*\n` +
          `Telefon: *${msg_dst}*\n` +
          `Rețea: *${networkName}*\n` +
          `msgID: ${msgID}\n` +
          `Status: ${dlv_error}`;
      }

      await slackService.sendPartnerNotification({
        webhookUrl: SLACK_WEBHOOK,
        partnerName: 'IFN-SMS (DSN)',
        status: dlv_status === 'D' ? 'success' : 'error',
        leadData: {
          phone: msg_dst,
          name: 'DSN Notification'
        },
        result: {
          success: dlv_status === 'D',
          message: slackMessage,
          msgId: msgID,
          network: networkName
        },
        leadNumber: 1
      });
    }

    // Răspuns OK către 4Pay (obligatoriu!)
    return res.sendStatus(200);

  } catch (error) {
    console.error('❌ [4PAY DSN] Eroare procesare notificare:', error.message);

    // Răspundem OK oricum ca să nu mai încerce 4Pay
    return res.sendStatus(200);
  }
}

/**
 * POST /api/4pay/receive-sms (Webhook MO)
 *
 * Primește SMS-uri de la clienți (dacă aveți număr scurt)
 *
 * Body: {
 *   event_type: "RX-MSG-MO",
 *   msgID: "1234567",
 *   servID: 5873,
 *   keyword: "",
 *   msg_src: "0722000111",
 *   msg_dst: "1234",
 *   msg_network: "V",
 *   msg_coding: "T7",
 *   msg_text: "test mesaj",
 *   msg_RXdate: "2023-10-30 07:28:53"
 * }
 */
async function handleReceiveSMS(req, res) {
  try {
    console.log('\n📩 [4PAY MO] SMS primit de la client...');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const { event_type, msgID, msg_src, msg_text, msg_RXdate } = req.body;

    // Verificare event type
    if (event_type !== 'RX-MSG-MO') {
      console.log(`⚠️ [4PAY MO] Event type incorect: ${event_type}`);
      return res.sendStatus(200);
    }

    console.log(`📨 [4PAY MO] SMS ${msgID} de la ${msg_src}: "${msg_text}"`);

    // TODO: Procesează SMS primit (salvează în DB, notifică pe Slack, etc.)

    // Răspuns OK către 4Pay (obligatoriu!)
    return res.sendStatus(200);

  } catch (error) {
    console.error('❌ [4PAY MO] Eroare procesare SMS:', error.message);

    // Răspundem OK oricum
    return res.sendStatus(200);
  }
}

module.exports = {
  sendSMS,
  sendTemplateSMS,
  handleDeliveryStatus,
  handleReceiveSMS
};
