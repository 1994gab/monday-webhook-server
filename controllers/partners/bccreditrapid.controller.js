const axios = require('axios');
const { sendLead } = require('../../services/partners/bccreditrapid.service');
const { addToQueue, setProcessHandler } = require('../../utils/bccreditrapid-queue.service');
const { BOARD_CONFIG } = require('../../config/board-config');
const { fetchItemDetails, extractColumnValue } = require('../../services/monday.service');
const { httpsAgent } = require('../../config/axios-config');

/**
 * Controller pentru BC Credit Rapid
 * Webhook Monday → Queue → BC Credit Rapid API (ADSY)
 */

// Slack webhook pentru notificări
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_BCCREDITRAPID;

/**
 * Trimite notificare pe Slack despre rezultatul trimiterii la BC Credit Rapid
 */
async function sendSlackNotification(leadData, result) {
  if (!SLACK_WEBHOOK) return;

  try {
    let mainText;
    const leadNumber = `#${leadData.leadNumber || '1'}`;
    const boardInfo = leadData.boardName ? `\nBoard: ${leadData.boardName}` : '';

    // Success
    if (result.success) {
      mainText = `✅ Lead trimis cu succes către BC Credit Rapid (${leadNumber})${boardInfo}
Nume: ${leadData.name}
Email: ${leadData.email}
Telefon: ${leadData.phone}
Angajator: ${leadData.employer}
Salariu: ${leadData.income} RON
Sumă dorită: ${leadData.amount} RON
ID BC Credit Rapid: ${result.id}`;
    }

    // Skipped (duplicate)
    else if (result.status === 'skipped') {
      mainText = `🔄 Lead duplicat în BC Credit Rapid (${leadNumber})${boardInfo}
Nume: ${leadData.name}
Email: ${leadData.email}
Telefon: ${leadData.phone}
Motiv: ${result.message}`;
    }

    // Invalid data
    else if (result.status === 'invalid') {
      const errors = result.errors || {};
      const errorMessages = Object.entries(errors)
        .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
        .join('\n');

      mainText = `❌ Lead respins de BC Credit Rapid (${leadNumber})${boardInfo}
Nume: ${leadData.name || 'LIPSĂ'}
Email: ${leadData.email || 'LIPSĂ'}
Telefon: ${leadData.phone || 'LIPSĂ'}
Erori:
${errorMessages}`;
    }

    // Error
    else {
      mainText = `❌ Eroare trimitere către BC Credit Rapid (${leadNumber})${boardInfo}
Nume: ${leadData.name}
Motiv: ${result.message}`;
    }

    await axios.post(SLACK_WEBHOOK, { text: mainText }, { httpsAgent });
  } catch (error) {
    console.error(`   ❌ Eroare Slack: ${error.message}`);
  }
}

/**
 * Webhook handler pentru BC Credit Rapid
 * Se activează când cineva schimbă status-ul unui lead în Monday
 * Preia datele și trimite la BC Credit Rapid API
 */
async function handleBCCreditRapidWebhook(req, res) {
  // Validare challenge pentru Monday
  if (req.body && req.body.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Procesăm event-ul
  if (req.body && req.body.event) {
    const { event } = req.body;
    const itemId = event.pulseId;
    const boardId = event.boardId;

    console.log(`\n🎯 [BC CREDIT RAPID] Webhook primit - Item: ${itemId}, Board: ${boardId}`);

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
 * Procesează un lead BC Credit Rapid din coadă
 */
async function processBCCreditRapidFromQueue(queueItem, currentNumber, totalCount) {
  const { itemId, boardId } = queueItem;

  try {
    console.log(`\n📋 [BC CREDIT RAPID] Procesare lead #${currentNumber}/${totalCount}`);

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
    const email = extractColumnValue(item, boardConfig.columns.email);
    const phone = extractColumnValue(item, boardConfig.columns.phone);
    const employer = extractColumnValue(item, boardConfig.columns.employer);
    const income = extractColumnValue(item, boardConfig.columns.income);
    const amount = extractColumnValue(item, boardConfig.columns.amount);

    // Validare date obligatorii
    if (!name || !email || !phone || !employer || !income || !amount) {
      console.log(`   ❌ Date incomplete - SKIP`);
      console.log(`   Nume: ${name || 'LIPSĂ'}`);
      console.log(`   Email: ${email || 'LIPSĂ'}`);
      console.log(`   Telefon: ${phone || 'LIPSĂ'}`);
      console.log(`   Angajator: ${employer || 'LIPSĂ'}`);
      console.log(`   Salariu: ${income || 'LIPSĂ'}`);
      console.log(`   Sumă dorită: ${amount || 'LIPSĂ'}`);
      return;
    }

    console.log(`   Nume: ${name}`);
    console.log(`   Email: ${email}`);
    console.log(`   Telefon: ${phone}`);
    console.log(`   Angajator: ${employer}`);
    console.log(`   Salariu: ${income}`);
    console.log(`   Sumă dorită: ${amount}`);

    // Trimite la BC Credit Rapid
    const result = await sendLead({
      name,
      email,
      phone,
      employer,
      income: parseInt(income),
      amount: parseInt(amount)
    });

    // Notificare Slack
    await sendSlackNotification(
      {
        name,
        email,
        phone,
        employer,
        income,
        amount,
        boardName: boardConfig.boardName,
        itemId,
        leadNumber: currentNumber,
        totalLeads: totalCount
      },
      result
    );

  } catch (error) {
    console.error(`   ❌ Eroare procesare: ${error.message}`);
    throw error; // Re-throw pentru a fi prins de coadă
  }
}

// Inițializare handler pentru coadă BC Credit Rapid
setProcessHandler(processBCCreditRapidFromQueue);

module.exports = {
  handleBCCreditRapidWebhook,
  processBCCreditRapidFromQueue
};
