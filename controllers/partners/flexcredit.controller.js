const { sendLead, normalizePhoneNumber } = require('../../services/partners/flexcredit.service');
const { addToQueue, setProcessHandler } = require('../../utils/flexcredit-queue.service');
const { BOARD_CONFIG } = require('../../config/board-config');
const { fetchItemDetails, extractColumnValue } = require('../../services/monday.service');
const { sendPartnerNotification } = require('../../services/slack.service');

/**
 * Controller pentru FlexCredit
 * Webhook Monday → Queue → FlexCredit API
 */

// Slack webhook pentru notificări
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_FLEXCREDIT;

/**
 * Webhook handler pentru FlexCredit
 * Se activează când cineva schimbă status-ul unui lead
 */
async function handleFlexCreditWebhook(req, res) {
  // Validare challenge pentru Monday
  if (req.body && req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Procesăm event-ul
  if (req.body && req.body.event) {
    const { event } = req.body;
    const itemId = event.pulseId;
    const boardId = event.boardId;

    console.log(`\n🎯 [FLEXCREDIT] Webhook primit - Item: ${itemId}, Board: ${boardId}`);

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
 * Procesează un lead FlexCredit din coadă
 */
async function processFlexCreditFromQueue(queueItem, currentNumber, totalCount) {
  const { itemId, boardId } = queueItem;

  try {
    console.log(`\n📋 [FLEXCREDIT] Procesare lead #${currentNumber}/${totalCount}`);

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

    // Extrage date din Monday
    const name = item.name;
    const phoneOriginal = extractColumnValue(item, boardConfig.columns.phone);
    const email = extractColumnValue(item, boardConfig.columns.email);
    const cnp = extractColumnValue(item, boardConfig.columns.cnp);
    const amount = extractColumnValue(item, boardConfig.columns.amount);

    // Validare date obligatorii
    if (!name || !phoneOriginal || !email || !cnp) {
      console.log(`   ❌ Date incomplete - SKIP`);
      console.log(`      Nume: ${name || 'LIPSĂ'}`);
      console.log(`      Telefon: ${phoneOriginal || 'LIPSĂ'}`);
      console.log(`      Email: ${email || 'LIPSĂ'}`);
      console.log(`      CNP: ${cnp || 'LIPSĂ'}`);

      // Notificare Slack pentru date incomplete
      await sendPartnerNotification({
        webhookUrl: SLACK_WEBHOOK,
        partnerName: 'FlexCredit',
        status: 'invalid_data',
        leadData: {
          name: name || 'LIPSĂ',
          phone: phoneOriginal || 'LIPSĂ',
          email: email || 'LIPSĂ',
          cnp: cnp || 'LIPSĂ',
          boardName: boardConfig.boardName
        },
        result: {
          message: 'Date incomplete - verifică nume, telefon, email și CNP'
        },
        leadNumber: currentNumber
      });

      return;
    }

    console.log(`   Nume: ${name}`);
    console.log(`   Telefon: ${phoneOriginal}`);
    console.log(`   Email: ${email}`);
    console.log(`   CNP: ${cnp.substring(0, 4)}****`);
    console.log(`   Sumă: ${amount || 'default'}`);

    // Trimite la FlexCredit
    const result = await sendLead({
      name,
      phone: phoneOriginal,
      email,
      cnp,
      amount: amount ? parseInt(amount) : null
    });

    // Normalizează numărul pentru Slack notification
    const normalizedPhone = normalizePhoneNumber(phoneOriginal);

    // Determină status-ul pentru Slack
    let slackStatus;
    if (result.success) {
      slackStatus = 'success';
    } else if (result.message && result.message.includes('respins')) {
      slackStatus = 'duplicate';
    } else {
      slackStatus = 'error';
    }

    // Notificare Slack
    await sendPartnerNotification({
      webhookUrl: SLACK_WEBHOOK,
      partnerName: 'FlexCredit',
      status: slackStatus,
      leadData: {
        name,
        phone: normalizedPhone || phoneOriginal,
        originalPhone: phoneOriginal,
        email,
        cnp: cnp ? `${cnp.substring(0, 4)}****` : 'N/A',
        amount: amount || 'default',
        boardName: boardConfig.boardName
      },
      result: {
        ...result,
        leadId: result.requestId
      },
      leadNumber: currentNumber
    });

  } catch (error) {
    console.error(`   ❌ Eroare procesare: ${error.message}`);
    throw error;
  }
}

// Inițializare handler pentru coadă FlexCredit
setProcessHandler(processFlexCreditFromQueue);

module.exports = {
  handleFlexCreditWebhook,
  processFlexCreditFromQueue
};
