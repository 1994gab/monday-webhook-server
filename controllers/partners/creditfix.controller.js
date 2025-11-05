const axios = require('axios');
const { sendLead, generateLoanAmount } = require('../../services/partners/creditfix.service');
const { addToQueue, setProcessHandler } = require('../../utils/creditfix-queue.service');
const { BOARD_CONFIG } = require('../../config/board-config');
const { fetchItemDetails, extractColumnValue } = require('../../services/monday.service');
const { httpsAgent } = require('../../config/axios-config');

/**
 * Controller pentru CreditFix
 * Webhook Monday → Queue → CreditFix API
 */

// Slack webhook pentru notificări
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_CREDITFIX;

/**
 * Trimite notificare pe Slack despre rezultatul trimiterii la CreditFix
 */
async function sendSlackNotification(leadData, result) {
  if (!SLACK_WEBHOOK) return;

  try {
    let mainText;
    const leadNumber = `#${leadData.leadNumber || '1'}`;
    const boardInfo = leadData.boardName ? `\nBoard: ${leadData.boardName}` : '';

    // Success
    if (result.success) {
      mainText = `✅ Lead trimis cu succes către CreditFix (${leadNumber})${boardInfo}
Nume: ${leadData.name}
Email: ${leadData.email}
Telefon: ${leadData.phone}
CNP: ${leadData.cnp}
Sumă: ${leadData.amount} RON
Metodă încasare: ${leadData.cashingMethod}
UID CreditFix: ${result.uid}`;
    }

    // Existing client
    else if (result.status === 'existing') {
      mainText = `🔄 Client existent în CreditFix (${leadNumber})${boardInfo}
Nume: ${leadData.name}
Email: ${leadData.email}
Telefon: ${leadData.phone}`;
    }

    // Duplicate lead
    else if (result.status === 'duplicate') {
      mainText = `🔄 Lead duplicat în CreditFix (${leadNumber})${boardInfo}
Nume: ${leadData.name}
Email: ${leadData.email}
Telefon: ${leadData.phone}`;
    }

    // Incomplete data
    else if (result.status === 'incomplete') {
      mainText = `⚠️ Lead NU trimis - Date incomplete (${leadNumber})${boardInfo}
Nume: ${leadData.name || 'LIPSĂ'}
Email: ${leadData.email || 'LIPSĂ'}
Telefon: ${leadData.phone || 'LIPSĂ'}
CNP: ${leadData.cnp || 'LIPSĂ'}
Metodă încasare: ${leadData.cashingMethod || 'LIPSĂ'}`;
    }

    // Other errors
    else {
      mainText = `❌ Lead respins de CreditFix (${leadNumber})${boardInfo}
Nume: ${leadData.name}
Email: ${leadData.email}
Telefon: ${leadData.phone}
CNP: ${leadData.cnp}
Motiv: ${result.message}`;
    }

    await axios.post(SLACK_WEBHOOK, { text: mainText }, { httpsAgent });
  } catch (error) {
    console.error(`   ❌ Eroare Slack: ${error.message}`);
  }
}

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
      await sendSlackNotification(
        {
          name: name || 'NECUNOSCUT',
          email: email,
          phone: phoneOriginal,
          cnp: cnp,
          cashingMethod: cashingMethod,
          boardName: boardConfig.boardName,
          leadNumber: currentNumber
        },
        {
          success: false,
          status: 'incomplete'
        }
      );

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

    // Notificare Slack cu rezultatul
    await sendSlackNotification(
      {
        name,
        email,
        phone: phoneOriginal,
        cnp,
        cashingMethod,
        amount,
        boardName: boardConfig.boardName,
        leadNumber: currentNumber
      },
      result
    );

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
