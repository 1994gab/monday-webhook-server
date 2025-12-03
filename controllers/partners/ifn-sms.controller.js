const { sendTemplatedSMS } = require('../../services/4pay.service');
const { addToQueue, setProcessHandler } = require('../../utils/ifn-sms-queue.service');
const { BOARD_CONFIG } = require('../../config/board-config');
const { fetchItemDetails, extractColumnValue } = require('../../services/monday.service');
const { normalizePhoneNumber } = require('../../utils/phone-normalizer');
const { sendPartnerNotification } = require('../../services/slack.service');

/**
 * Controller pentru IFN-SMS
 * Webhook Monday → Queue → 4Pay SMS API
 */

// Slack webhook pentru notificări IFN-SMS
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_IFN_SMS;

// Link Credilink (poate fi mutat în .env dacă se schimbă des)
const CREDILINK_URL = 'https://bit.ly/3WVKh8c';
const OCEAN = 'https://bit.ly/4pRKm9r';

// Mapping în memorie: msgID → {name, phone}
// Pentru a putea trimite notificări complete când primim webhook DSN
const smsMapping = new Map();

/**
 * Webhook handler pentru IFN-SMS
 * Se activează când agentul schimbă coloana "IFN-SMS" la "SEND SMS"
 */
async function handleIfnSmsWebhook(req, res) {
  // Validare challenge pentru Monday
  if (req.body && req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Procesăm event-ul
  if (req.body && req.body.event) {
    const { event } = req.body;
    const itemId = event.pulseId;
    const boardId = event.boardId;

    console.log(`\n🎯 [IFN-SMS] Webhook primit - Item: ${itemId}, Board: ${boardId}`);

    // Confirmăm primirea rapid (Monday timeout după 10 sec)
    res.status(200).json({ message: 'OK' });

    // Adaugă în coadă pentru procesare secvențială
    addToQueue({ itemId, boardId });

    return;
  }

  // Pentru orice alt request
  res.status(200).json({ message: 'OK' });
}

/**
 * Procesează un SMS IFN din coadă
 */
async function processIfnSmsFromQueue(queueItem, currentNumber, totalCount) {
  const { itemId, boardId } = queueItem;

  try {
    console.log(`\n📋 [IFN-SMS] Procesare SMS #${currentNumber}/${totalCount}`);

    // Verifică dacă board-ul este configurat
    const boardConfig = BOARD_CONFIG[boardId?.toString()];
    if (!boardConfig) {
      console.log(`   ⚠️ Board ${boardId} nu este configurat în BOARD_CONFIG`);
      return;
    }

    console.log(`   ✅ Board găsit: ${boardConfig.boardName}`);

    // Obține detaliile item-ului din Monday
    const item = await fetchItemDetails(itemId);

    if (!item) {
      console.log('   ❌ Item nu a fost găsit în Monday');
      return;
    }

    // Extrage date
    const name = item.name;
    const phoneOriginal = extractColumnValue(item, boardConfig.columns.phone);
    const phone = normalizePhoneNumber(phoneOriginal);

    // Validare date
    if (!name || !phone) {
      console.log(`   ❌ Date incomplete - SKIP (Nume: ${name || 'LIPSĂ'}, Telefon: ${phoneOriginal || 'LIPSĂ'})`);

      // Notificare Slack pentru date incomplete sau telefon invalid
      await sendPartnerNotification({
        webhookUrl: SLACK_WEBHOOK,
        partnerName: 'IFN-SMS',
        status: 'invalid_data',
        leadData: {
          name: name || 'LIPSĂ',
          phone: phoneOriginal || 'LIPSĂ',
          boardName: boardConfig.boardName
        },
        result: {
          message: !name && !phone
            ? 'Date incomplete - lipsesc nume și telefon'
            : !name
              ? 'Nume lipsă'
              : 'Număr de telefon invalid sau lipsă'
        },
        leadNumber: currentNumber
      });

      return;
    }

    console.log(`   Nume: ${name}, Telefon: ${phone}`);

    // Trimite SMS cu template CREDILINK
    console.log(`   📤 Trimit SMS Credilink...`);
    const result = await sendTemplatedSMS(
      phone,
      'CREDILINK',
      { CREDILINK_URL: CREDILINK_URL,  OCEAN: OCEAN },
      `monday-${itemId}`  // externalMessageId pentru tracking
    );

    // Log rezultat
    if (result.success) {
      console.log(`   ✅ SMS trimis cu succes! msgID: ${result.msgId}`);

      // Salvează în mapping pentru notificare DSN ulterioară
      smsMapping.set(result.msgId, {
        name: name,
        phone: phone,
        timestamp: Date.now()
      });

      console.log(`   📋 Salvat în mapping: msgID ${result.msgId} → ${name} (${phone})`);
      console.log(`   ⏳ Aștept webhook DSN pentru notificare Slack...`);

    } else {
      console.log(`   ❌ SMS eșuat: ${result.message}`);

      // Pentru erori, trimitem notificare imediată
      if (SLACK_WEBHOOK) {
        const fetch = require('node-fetch');
        const slackMessage = `❌ *SMS eșuat* (#${currentNumber})\n` +
          `Nume: *${name}*\n` +
          `Telefon: *${phone}*\n` +
          `Eroare: ${result.message}`;

        await fetch(SLACK_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: slackMessage })
        });

        console.log('📨 Notificare eroare trimisă la Slack');
      }
    }

  } catch (error) {
    console.error(`   ❌ Eroare procesare: ${error.message}`);
    throw error; // Re-throw pentru a fi prins de coadă
  }
}

// Inițializare handler pentru coadă IFN-SMS
setProcessHandler(processIfnSmsFromQueue);

/**
 * Obține datele din mapping pentru un msgID
 */
function getSmsData(msgId) {
  return smsMapping.get(msgId);
}

/**
 * Șterge msgID din mapping după procesare
 */
function deleteSmsData(msgId) {
  return smsMapping.delete(msgId);
}

module.exports = {
  handleIfnSmsWebhook,
  processIfnSmsFromQueue,
  getSmsData,
  deleteSmsData
};
