const { sendLead } = require('../../services/partners/icredit.service');
const { addToQueue, setProcessHandler } = require('../../utils/icredit-queue.service');
const { BOARD_CONFIG } = require('../../config/board-config');
const { fetchItemDetails, extractColumnValue } = require('../../services/monday.service');
const { sendPartnerNotification } = require('../../services/slack.service');

/**
 * Controller pentru iCredit
 * Webhook Monday → Queue → iCredit API
 */

// Slack webhook pentru notificări
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_ICREDIT;

/**
 * Webhook handler pentru iCredit Board
 */
async function handleIcreditWebhook(req, res) {
  // Validare challenge pentru Monday
  if (req.body && req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Procesăm event-ul
  if (req.body && req.body.event) {
    const { event } = req.body;
    const itemId = event.pulseId;
    const boardId = event.boardId;

    console.log(`\n🎯 [ICREDIT] Webhook primit - Item: ${itemId}, Board: ${boardId}`);

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
 * Procesează un lead iCredit din coadă
 */
async function processIcreditFromQueue(queueItem, currentNumber, totalCount) {
  const { itemId, boardId } = queueItem;

  try {
    console.log(`\n📋 [ICREDIT] Procesare lead #${currentNumber}/${totalCount}`);

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

    // Extrage date din Monday (doar nume + telefon pentru iCredit!)
    const name = item.name;
    const phoneOriginal = extractColumnValue(item, boardConfig.columns.phone);

    console.log(`   Nume: ${name}`);
    console.log(`   Telefon: ${phoneOriginal}`);

    // Validare STRICTĂ - ambele câmpuri obligatorii
    if (!name || !phoneOriginal) {
      console.log(`   ❌ Date incomplete - SKIP (nu trimitem la iCredit)`);
      console.log(`      Nume: ${name || 'LIPSĂ'}`);
      console.log(`      Telefon: ${phoneOriginal || 'LIPSĂ'}`);

      // Notificare Slack pentru date incomplete
      await sendPartnerNotification({
        webhookUrl: SLACK_WEBHOOK,
        partnerName: 'iCredit',
        status: 'invalid_data',
        leadData: {
          name: name || 'LIPSĂ',
          phone: phoneOriginal || 'LIPSĂ',
          boardName: boardConfig.boardName
        },
        result: {
          message: 'Date incomplete - nume sau telefon lipsă'
        },
        leadNumber: currentNumber
      });

      return;
    }

    // Trimite la iCredit
    const result = await sendLead({
      name: name,
      phone: phoneOriginal
    });

    // Determină status-ul pentru Slack
    let slackStatus;
    if (result.success) {
      slackStatus = 'success';
    } else if (result.status === 'invalid_data') {
      slackStatus = 'invalid_data';
    } else {
      slackStatus = 'error';
    }

    // Notificare Slack cu rezultatul
    await sendPartnerNotification({
      webhookUrl: SLACK_WEBHOOK,
      partnerName: 'iCredit',
      status: slackStatus,
      leadData: {
        name,
        phone: phoneOriginal,
        boardName: boardConfig.boardName
      },
      result,
      leadNumber: currentNumber
    });

  } catch (error) {
    console.error(`   ❌ Eroare procesare: ${error.message}`);
    throw error; // Re-throw pentru a fi prins de coadă
  }
}

// Inițializare handler pentru coadă iCredit
setProcessHandler(processIcreditFromQueue);

module.exports = {
  handleIcreditWebhook,
  processIcreditFromQueue
};
