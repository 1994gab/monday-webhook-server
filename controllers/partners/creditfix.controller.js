const { sendLead, generateLoanAmount } = require('../../services/partners/creditfix.service');
const { addToQueue, setProcessHandler } = require('../../utils/creditfix-queue.service');
const { BOARD_CONFIG } = require('../../config/board-config');
const { fetchItemDetails, extractColumnValue } = require('../../services/monday.service');
const { sendPartnerNotification } = require('../../services/slack.service');

/**
 * Controller pentru CreditFix
 * Webhook Monday → Queue → CreditFix API
 */

// Slack webhook pentru notificări
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_CREDITFIX;

/**
 * Webhook handler pentru CreditFix Board
 */
async function handleCreditFixWebhook(req, res) {
  // Validare challenge pentru Monday
  if (req.body && req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Procesăm event-ul
  if (req.body && req.body.event) {
    const { event } = req.body;
    const itemId = event.pulseId;
    const boardId = event.boardId;

    console.log(`\n🎯 [CREDITFIX] Webhook primit - Item: ${itemId}, Board: ${boardId}`);

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
 * Procesează un lead CreditFix din coadă
 */
async function processCreditFixFromQueue(queueItem, currentNumber, totalCount) {
  const { itemId, boardId } = queueItem;

  try {
    console.log(`\n📋 [CREDITFIX] Procesare lead #${currentNumber}/${totalCount}`);

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
    const cashingMethodRaw = extractColumnValue(item, boardConfig.columns.cashingMethod);

    // Procesare cashingMethod
    // Cash sau empty → Cash
    // Orice altceva (BRD, ING, BCR, etc.) → Card
    let cashingMethod;
    if (!cashingMethodRaw || cashingMethodRaw.toLowerCase().trim() === 'cash') {
      cashingMethod = 'Cash';
    } else {
      cashingMethod = 'Card';  // Orice bancă = Card
    }

    console.log(`   Nume: ${name}`);
    console.log(`   Email: ${email}`);
    console.log(`   Telefon: ${phoneOriginal}`);
    console.log(`   CNP: ${cnp}`);
    console.log(`   Metodă încasare: ${cashingMethod} (raw: ${cashingMethodRaw})`);

    // Validare STRICTĂ - toate câmpurile obligatorii
    if (!name || !email || !phoneOriginal || !cnp) {
      console.log(`   ❌ Date incomplete - SKIP (nu trimitem la CreditFix)`);
      console.log(`      Nume: ${name || 'LIPSĂ'}`);
      console.log(`      Email: ${email || 'LIPSĂ'}`);
      console.log(`      Telefon: ${phoneOriginal || 'LIPSĂ'}`);
      console.log(`      CNP: ${cnp || 'LIPSĂ'}`);

      // Notificare Slack pentru date incomplete
      await sendPartnerNotification({
        webhookUrl: SLACK_WEBHOOK,
        partnerName: 'CreditFix',
        status: 'invalid_data',
        leadData: {
          name: name || 'NECUNOSCUT',
          email: email,
          phone: phoneOriginal,
          cnp: cnp,
          cashingMethod: cashingMethod,
          boardName: boardConfig.boardName
        },
        result: {
          message: 'Date incomplete - verifică CNP, email, telefon și metodă încasare'
        },
        leadNumber: currentNumber
      });

      return;
    }

    // Generează sumă pentru lead
    const amount = generateLoanAmount();

    // Trimite la CreditFix
    const result = await sendLead({
      cnp: cnp,
      email: email,
      phone: phoneOriginal,
      cashingMethod: cashingMethod,
      clickId: null  // Nu avem click ID din Monday
    });

    // Determină status-ul pentru Slack
    let slackStatus;
    if (result.success) {
      slackStatus = 'success';
    } else if (result.status === 'existing' || result.status === 'duplicate') {
      slackStatus = 'duplicate';
    } else {
      slackStatus = 'error';
    }

    // Notificare Slack cu rezultatul
    await sendPartnerNotification({
      webhookUrl: SLACK_WEBHOOK,
      partnerName: 'CreditFix',
      status: slackStatus,
      leadData: {
        name,
        email,
        phone: phoneOriginal,
        cnp,
        cashingMethod,
        amount,
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

// Inițializare handler pentru coadă CreditFix
setProcessHandler(processCreditFixFromQueue);

module.exports = {
  handleCreditFixWebhook,
  processCreditFixFromQueue
};
