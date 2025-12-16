const { sendLead } = require('../../services/partners/bccreditrapid.service');
const { addToQueue, setProcessHandler } = require('../../utils/bccreditrapid-queue.service');
const { BOARD_CONFIG } = require('../../config/board-config');
const { fetchItemDetails, extractColumnValue } = require('../../services/monday.service');
const { sendPartnerNotification } = require('../../services/slack.service');

/**
 * Controller pentru BC Credit Rapid
 * Webhook Monday → Queue → BC Credit Rapid API (ADSY)
 */

// Slack webhook pentru notificări
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_BCCREDITRAPID;

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
    const fullName = item.name;
    const email = extractColumnValue(item, boardConfig.columns.email);
    const phone = extractColumnValue(item, boardConfig.columns.phone);
    const employer = extractColumnValue(item, boardConfig.columns.employer);
    const income = extractColumnValue(item, boardConfig.columns.income);
    const amount = extractColumnValue(item, boardConfig.columns.amount);

    // Split nume in firstName si lastName
    const nameParts = fullName?.trim().split(' ') || [];
    const lastName = nameParts.pop() || '';  // Ultimul cuvant = nume familie
    const firstName = nameParts.join(' ') || '';  // Restul = prenume

    // Validare date obligatorii
    if (!firstName || !lastName || !email || !phone || !employer || !income || !amount) {
      console.log(`   ❌ Date incomplete - SKIP`);
      console.log(`   Prenume: ${firstName || 'LIPSĂ'}`);
      console.log(`   Nume: ${lastName || 'LIPSĂ'}`);
      console.log(`   Email: ${email || 'LIPSĂ'}`);
      console.log(`   Telefon: ${phone || 'LIPSĂ'}`);
      console.log(`   Angajator: ${employer || 'LIPSĂ'}`);
      console.log(`   Salariu: ${income || 'LIPSĂ'}`);
      console.log(`   Sumă dorită: ${amount || 'LIPSĂ'}`);

      // Notificare Slack pentru date incomplete
      await sendPartnerNotification({
        webhookUrl: SLACK_WEBHOOK,
        partnerName: 'BC Credit Rapid',
        status: 'invalid_data',
        leadData: {
          firstName: firstName || 'LIPSĂ',
          lastName: lastName || 'LIPSĂ',
          email: email,
          phone: phone,
          employer: employer,
          income: income,
          amount: amount,
          boardName: boardConfig.boardName
        },
        result: {
          message: 'Date incomplete - verifică toate câmpurile obligatorii'
        },
        leadNumber: currentNumber
      });

      return;
    }

    console.log(`   Prenume: ${firstName}`);
    console.log(`   Nume: ${lastName}`);
    console.log(`   Email: ${email}`);
    console.log(`   Telefon: ${phone}`);
    console.log(`   Angajator: ${employer}`);
    console.log(`   Salariu: ${income}`);
    console.log(`   Sumă dorită: ${amount}`);

    // Trimite la BC Credit Rapid
    const result = await sendLead({
      firstName,
      lastName,
      email,
      phone,
      employer,
      income: parseInt(income),
      amount: parseInt(amount)
    });

    // Determină status-ul pentru Slack
    let slackStatus;
    if (result.success && result.status === 'inserted') {
      slackStatus = 'success';
    } else if (result.status === 'skipped') {
      slackStatus = 'duplicate';
    } else if (result.status === 'invalid') {
      slackStatus = 'invalid_data';
    } else {
      slackStatus = 'error';
    }

    // Notificare Slack
    await sendPartnerNotification({
      webhookUrl: SLACK_WEBHOOK,
      partnerName: 'BC Credit Rapid',
      status: slackStatus,
      leadData: {
        firstName,
        lastName,
        email,
        phone,
        employer,
        income,
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

// Inițializare handler pentru coadă BC Credit Rapid
setProcessHandler(processBCCreditRapidFromQueue);

module.exports = {
  handleBCCreditRapidWebhook,
  processBCCreditRapidFromQueue
};
