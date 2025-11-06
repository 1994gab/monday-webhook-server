const { sendLead } = require('../../services/partners/credius.service');
const { addToQueue, setProcessHandler } = require('../../utils/credius-queue.service');
const { BOARD_CONFIG } = require('../../config/board-config');
const { fetchItemDetails, extractColumnValue } = require('../../services/monday.service');
const { sendPartnerNotification } = require('../../services/slack.service');

/**
 * Controller pentru Credius
 * Webhook Monday → Queue → Credius API
 */

// Slack webhook pentru notificări
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_CREDIUS;

/**
 * Webhook handler pentru Credius Board
 * Se activează când cineva schimbă status-ul unui lead
 * Preia numele și telefonul, apoi trimite la Credius API
 */
async function handleCrediusWebhook(req, res) {
  // Validare challenge pentru Monday
  if (req.body && req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Procesăm event-ul
  if (req.body && req.body.event) {
    const { event } = req.body;
    const itemId = event.pulseId;
    const boardId = event.boardId;

    console.log(`\n🎯 [CREDIUS] Webhook primit - Item: ${itemId}, Board: ${boardId}`);

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
 * Procesează un lead Credius din coadă
 */
async function processCrediusFromQueue(queueItem, currentNumber, totalCount) {
  const { itemId, boardId } = queueItem;

  try {
    console.log(`\n📋 [CREDIUS] Procesare lead #${currentNumber}/${totalCount}`);

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

    // Validare date
    if (!name || !phoneOriginal) {
      console.log(`   ❌ Date incomplete - SKIP (Nume: ${name || 'LIPSĂ'}, Telefon: ${phoneOriginal || 'LIPSĂ'})`);
      return;
    }

    console.log(`   Nume: ${name}, Telefon: ${phoneOriginal}`);

    // Trimite la Credius (service face normalizarea internă)
    const result = await sendLead(name, phoneOriginal);

    // Normalizează numărul pentru Slack notification
    const { normalizePhoneNumber } = require('../../services/partners/credius.service');
    const normalizedPhone = normalizePhoneNumber(phoneOriginal);

    // Determină status-ul pentru Slack
    let slackStatus;
    if (result.success) {
      slackStatus = 'success';
    } else if (result.message === 'Lead Duplicat') {
      slackStatus = 'duplicate';
    } else {
      slackStatus = 'error';
    }

    // Notificare Slack
    await sendPartnerNotification({
      webhookUrl: SLACK_WEBHOOK,
      partnerName: 'Credius',
      status: slackStatus,
      leadData: {
        name,
        phone: normalizedPhone || phoneOriginal,
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

// Inițializare handler pentru coadă Credius
setProcessHandler(processCrediusFromQueue);

module.exports = {
  handleCrediusWebhook,
  processCrediusFromQueue
};
