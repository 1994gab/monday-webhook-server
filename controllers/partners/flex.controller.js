const { sendLead } = require('../../services/partners/flex.service');
const { addToQueue, setProcessHandler } = require('../../utils/flex-queue.service');
const { BOARD_CONFIG } = require('../../config/board-config');
const { fetchItemDetails, extractColumnValue } = require('../../services/monday.service');
const { normalizePhoneNumber } = require('../../utils/phone-normalizer');
const { sendPartnerNotification } = require('../../services/slack.service');

/**
 * Controller pentru FLEX (Mediatel)
 * Webhook Monday → Queue → Mediatel API
 */

// Slack webhook pentru notificări
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

/**
 * Webhook handler pentru FLEX Board
 * Se activează când cineva schimbă status-ul unui lead
 * Preia numele și telefonul, apoi trimite la Mediatel API
 */
async function handleFlexWebhook(req, res) {
  // Validare challenge pentru Monday
  if (req.body && req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Procesăm event-ul
  if (req.body && req.body.event) {
    const { event } = req.body;
    const itemId = event.pulseId;
    const boardId = event.boardId;

    console.log(`\n🎯 [FLEX] Webhook primit - Item: ${itemId}, Board: ${boardId}`);

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
 * Procesează un lead FLEX din coadă
 */
async function processFlexFromQueue(queueItem, currentNumber, totalCount) {
  const { itemId, boardId } = queueItem;

  try {
    console.log(`\n📋 [FLEX] Procesare lead #${currentNumber}/${totalCount}`);

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
        partnerName: 'FLEX',
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

    // Construiește lead data
    const leadData = {
      id: itemId,
      name: name,
      phone: phone,
      originalPhone: phoneOriginal,
      boardName: boardConfig.boardName
    };

    // Trimite la Mediatel
    const result = await sendLead(leadData);

    // Log rezultat
    if (result.success) {
      console.log(`   ✅ Lead trimis cu succes!`);
    } else {
      console.log(`   ❌ Lead respins: ${result.message}`);
    }

    // Determină status-ul pentru Slack
    let slackStatus;
    if (result.success) {
      slackStatus = 'success';
    } else if (result.message && result.message.toLowerCase().includes('duplicat')) {
      slackStatus = 'duplicate';
    } else {
      slackStatus = 'error';
    }

    // Notificare Slack cu rezultatul
    await sendPartnerNotification({
      webhookUrl: SLACK_WEBHOOK,
      partnerName: 'FLEX',
      status: slackStatus,
      leadData: {
        name,
        phone,
        originalPhone: phoneOriginal,
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

// Inițializare handler pentru coadă FLEX
setProcessHandler(processFlexFromQueue);

module.exports = {
  handleFlexWebhook,
  processFlexFromQueue
};
