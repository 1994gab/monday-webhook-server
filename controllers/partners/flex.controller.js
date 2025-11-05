const axios = require('axios');
const { sendLead } = require('../../services/partners/flex.service');
const { addToQueue, setProcessHandler } = require('../../utils/flex-queue.service');
const { BOARD_CONFIG } = require('../../config/board-config');
const { fetchItemDetails, extractColumnValue } = require('../../services/monday.service');
const { normalizePhoneNumber } = require('../../utils/phone-normalizer');
const { httpsAgent } = require('../../config/axios-config');

/**
 * Controller pentru FLEX (Mediatel)
 * Webhook Monday → Queue → Mediatel API
 */

// Slack webhook pentru notificări
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

/**
 * Trimite notificare pe Slack despre rezultatul trimiterii la Mediatel
 */
async function sendSlackNotification(leadData, result) {
  if (!SLACK_WEBHOOK) return;

  try {
    let mainText;
    const leadNumber = `#${leadData.leadNumber || '1'}`;
    const phoneInfo = leadData.originalPhone !== leadData.phone
      ? `\nTelefon Monday: ${leadData.originalPhone}\nTelefon trimis: ${leadData.phone}`
      : `\nTelefon: ${leadData.phone}`;
    const boardInfo = leadData.boardName ? `\nBoard: ${leadData.boardName}` : '';

    if (result.success) {
      mainText = `✅ Lead trimis cu succes către Mediatel (${leadNumber})${boardInfo}\nNume: ${leadData.name}${phoneInfo}`;
    } else if (result.message && result.message.includes('duplicat')) {
      mainText = `⚠️ Lead nu a fost importat - posibil duplicat (${leadNumber})${boardInfo}\nNume: ${leadData.name}${phoneInfo}`;
    } else {
      mainText = `❌ Eroare trimitere lead către Mediatel (${leadNumber})${boardInfo}\nNume: ${leadData.name}${phoneInfo}\nMotiv: ${result.message}`;
    }

    await axios.post(SLACK_WEBHOOK, { text: mainText }, { httpsAgent });
  } catch (error) {
    console.error(`   ❌ Eroare Slack: ${error.message}`);
  }
}

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

      // Notificare Slack pentru telefon invalid
      if (!phone) {
        await sendSlackNotification(
          {
            name: name || 'NECUNOSCUT',
            phone: 'INVALID',
            originalPhone: phoneOriginal,
            boardName: boardConfig.boardName,
            leadNumber: currentNumber
          },
          {
            success: false,
            message: 'Număr de telefon invalid'
          }
        );
      }

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

    // Notificare Slack cu rezultatul
    await sendSlackNotification(
      {
        name,
        phone,
        originalPhone: phoneOriginal,
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

// Inițializare handler pentru coadă FLEX
setProcessHandler(processFlexFromQueue);

module.exports = {
  handleFlexWebhook,
  processFlexFromQueue
};
