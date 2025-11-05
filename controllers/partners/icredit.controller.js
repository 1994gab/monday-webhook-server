const axios = require('axios');
const { sendLead } = require('../../services/partners/icredit.service');
const { addToQueue, setProcessHandler } = require('../../utils/icredit-queue.service');
const { BOARD_CONFIG } = require('../../config/board-config');
const { fetchItemDetails, extractColumnValue } = require('../../services/monday.service');
const { httpsAgent } = require('../../config/axios-config');

/**
 * Controller pentru iCredit
 * Webhook Monday → Queue → iCredit API
 */

// Slack webhook pentru notificări
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_ICREDIT;

/**
 * Trimite notificare pe Slack despre rezultatul trimiterii la iCredit
 */
async function sendSlackNotification(leadData, result) {
  if (!SLACK_WEBHOOK) return;

  try {
    let mainText;
    const leadNumber = `#${leadData.leadNumber || '1'}`;
    const boardInfo = leadData.boardName ? `\nBoard: ${leadData.boardName}` : '';

    // Success
    if (result.success) {
      mainText = `✅ Lead trimis cu succes către iCredit (${leadNumber})${boardInfo}
Nume: ${leadData.name}
Telefon: ${leadData.phone}
ID iCredit: ${result.id}`;
    }

    // Invalid data
    else if (result.status === 'invalid_data') {
      mainText = `⚠️ Lead NU trimis - Date invalide (${leadNumber})${boardInfo}
Nume: ${leadData.name || 'LIPSĂ'}
Telefon: ${leadData.phone || 'LIPSĂ'}
Motiv: ${result.message}`;
    }

    // Auth error
    else if (result.status === 'auth_error') {
      mainText = `🔒 Eroare autentificare iCredit (${leadNumber})${boardInfo}
Motiv: ${result.message}`;
    }

    // Rate limit
    else if (result.status === 'rate_limit') {
      mainText = `⏸️ Rate limit iCredit (${leadNumber})${boardInfo}
Too many requests - așteptare necesară`;
    }

    // Validation error
    else if (result.status === 'validation_error') {
      mainText = `❌ Lead respins de iCredit (${leadNumber})${boardInfo}
Nume: ${leadData.name}
Telefon: ${leadData.phone}
Motiv: ${result.message}`;
    }

    // Other errors
    else {
      mainText = `❌ Eroare trimitere iCredit (${leadNumber})${boardInfo}
Nume: ${leadData.name}
Telefon: ${leadData.phone}
Motiv: ${result.message}`;
    }

    await axios.post(SLACK_WEBHOOK, { text: mainText }, { httpsAgent });
  } catch (error) {
    console.error(`   ❌ Eroare Slack: ${error.message}`);
  }
}

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
      await sendSlackNotification(
        {
          name: name || 'LIPSĂ',
          phone: phoneOriginal || 'LIPSĂ',
          boardName: boardConfig.boardName,
          leadNumber: currentNumber
        },
        {
          success: false,
          status: 'invalid_data',
          message: 'Date incomplete - nume sau telefon lipsă'
        }
      );

      return;
    }

    // Trimite la iCredit
    const result = await sendLead({
      name: name,
      phone: phoneOriginal
    });

    // Notificare Slack cu rezultatul
    await sendSlackNotification(
      {
        name,
        phone: phoneOriginal,
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

// Inițializare handler pentru coadă iCredit
setProcessHandler(processIcreditFromQueue);

module.exports = {
  handleIcreditWebhook,
  processIcreditFromQueue
};
