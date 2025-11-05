const fetch = require('node-fetch');

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

/**
 * Funcție generică pentru trimitere mesaj către Slack
 */
async function sendToSlack(message) {
  if (!SLACK_WEBHOOK_URL) {
    console.log('⚠️ SLACK_WEBHOOK_URL nu este configurat în .env');
    return;
  }

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) {
      console.error('Slack responded with error:', await res.text());
    } else {
      console.log('📨 Mesaj trimis cu succes către Slack');
    }
  } catch (err) {
    console.error('❌ Eroare la trimiterea către Slack:', err.message);
  }
}

/**
 * Notificare Slack pentru lead trimis cu succes
 */
async function sendSuccessNotification(lead, leadNumber) {
  const phoneInfo = lead.originalPhone !== lead.phone
    ? `\n📱 Telefon Monday: *${lead.originalPhone}*\n✅ Telefon trimis: *${lead.phone}*`
    : `\nTelefon: *${lead.phone}*`;

  const boardInfo = lead.boardName ? `\n📋 Board: *${lead.boardName}*` : '';
  const integration = lead.integration ? ` către ${lead.integration.toUpperCase()}` : '';

  const message = `✅ Lead trimis cu succes${integration} (#${leadNumber})${boardInfo}\nNume: *${lead.name}*${phoneInfo}`;

  await sendToSlack(message);
}

/**
 * Notificare Slack pentru lead duplicat
 */
async function sendDuplicateNotification(lead, leadNumber) {
  const phoneInfo = lead.originalPhone !== lead.phone
    ? `\n📱 Telefon Monday: *${lead.originalPhone}*\n✅ Telefon trimis: *${lead.phone}*`
    : `\nTelefon: *${lead.phone}*`;

  const boardInfo = lead.boardName ? `\n📋 Board: *${lead.boardName}*` : '';
  const integration = lead.integration ? ` în ${lead.integration.toUpperCase()}` : '';

  const message = `❌ Lead nu a fost importat${integration} (posibil duplicat) (#${leadNumber})${boardInfo}\nNume: *${lead.name}*${phoneInfo}`;

  await sendToSlack(message);
}

/**
 * Notificare Slack pentru lead cu eroare
 */
async function sendErrorNotification(lead, errorMessage, leadNumber) {
  const phoneInfo = lead.originalPhone !== lead.phone
    ? `\n📱 Telefon Monday: *${lead.originalPhone}*\n✅ Telefon trimis: *${lead.phone}*`
    : `\nTelefon: *${lead.phone}*`;

  const boardInfo = lead.boardName ? `\n📋 Board: *${lead.boardName}*` : '';
  const integration = lead.integration ? ` către ${lead.integration.toUpperCase()}` : '';

  const message = `❌ Eroare la trimiterea leadului${integration} (#${leadNumber})${boardInfo}\nNume: *${lead.name}*${phoneInfo}\nEroare: ${errorMessage}`;

  await sendToSlack(message);
}

/**
 * Notificare Slack pentru avertismente (telefon invalid, board neconfigurat, etc.)
 */
async function sendWarning(warningMessage) {
  await sendToSlack(`⚠️ ${warningMessage}`);
}

module.exports = {
  sendSuccessNotification,
  sendDuplicateNotification,
  sendErrorNotification,
  sendWarning
};
