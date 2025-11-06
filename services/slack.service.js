const fetch = require('node-fetch');

/**
 * Funcție generică pentru trimitere mesaj către Slack
 * @param {string} webhookUrl - URL-ul webhook-ului Slack
 * @param {string} message - Mesajul de trimis
 */
async function sendToSlack(webhookUrl, message) {
  if (!webhookUrl) {
    console.log('⚠️ Webhook URL Slack nu este configurat');
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
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
 * FUNCȚIE UNIFORMĂ pentru notificări către parteneri
 * Gestionează toate tipurile: succes, duplicat, eroare, date invalide
 *
 * @param {Object} config - Configurație notificare
 * @param {string} config.webhookUrl - URL webhook Slack
 * @param {string} config.partnerName - Nume partener (ex: "FLEX", "Credius")
 * @param {string} config.status - Status: 'success' | 'duplicate' | 'error' | 'invalid_data'
 * @param {Object} config.leadData - Date lead
 * @param {string} config.leadData.name - Nume complet
 * @param {string} config.leadData.phone - Telefon (normalizat)
 * @param {string} config.leadData.originalPhone - Telefon original (opțional)
 * @param {string} config.leadData.email - Email (opțional)
 * @param {string} config.leadData.cnp - CNP (opțional)
 * @param {string} config.leadData.employer - Angajator (opțional)
 * @param {number} config.leadData.income - Salariu (opțional)
 * @param {number} config.leadData.amount - Sumă dorită (opțional)
 * @param {string} config.leadData.cashingMethod - Metodă încasare (opțional)
 * @param {string} config.leadData.boardName - Nume board Monday (opțional)
 * @param {Object} config.result - Răspuns de la API partener
 * @param {boolean} config.result.success - Succes sau nu
 * @param {string} config.result.message - Mesaj de la API
 * @param {string|number} config.result.id - ID lead în sistemul partener (opțional)
 * @param {string|number} config.result.uid - UID lead (opțional)
 * @param {string|number} config.result.leadId - Lead ID (opțional)
 * @param {Object} config.result.errors - Erori de validare (opțional)
 * @param {number} config.leadNumber - Numărul leadului în coadă
 */
async function sendPartnerNotification(config) {
  const {
    webhookUrl,
    partnerName,
    status,
    leadData,
    result,
    leadNumber
  } = config;

  if (!webhookUrl) {
    console.log(`⚠️ Webhook Slack nu este configurat pentru ${partnerName}`);
    return;
  }

  try {
    const leadNum = `#${leadNumber || '1'}`;
    const boardInfo = leadData.boardName ? `\nBoard: *${leadData.boardName}*` : '';

    let message = '';

    // ===== SUCCES =====
    if (status === 'success') {
      // ID-ul leadului din sistemul partener (poate fi id, uid, leadId)
      const partnerId = result.id || result.uid || result.leadId;
      const partnerIdInfo = partnerId ? `\nID ${partnerName}: *${partnerId}*` : '';

      // Info telefon (arată diferența dacă există)
      let phoneInfo = '';
      if (leadData.phone) {
        if (leadData.originalPhone && leadData.originalPhone !== leadData.phone) {
          phoneInfo = `\nTelefon Monday: *${leadData.originalPhone}*\nTelefon trimis: *${leadData.phone}*`;
        } else {
          phoneInfo = `\nTelefon: *${leadData.phone}*`;
        }
      }

      // Info suplimentare (email, CNP, etc.)
      let extraInfo = '';
      if (leadData.email) extraInfo += `\nEmail: *${leadData.email}*`;
      if (leadData.cnp) extraInfo += `\nCNP: *${leadData.cnp}*`;
      if (leadData.employer) extraInfo += `\nAngajator: *${leadData.employer}*`;
      if (leadData.income) extraInfo += `\nSalariu: *${leadData.income} RON*`;
      if (leadData.amount) extraInfo += `\nSumă dorită: *${leadData.amount} RON*`;
      if (leadData.cashingMethod) extraInfo += `\nMetodă: *${leadData.cashingMethod}*`;

      message = `✅ *Lead trimis cu succes către ${partnerName}* (${leadNum})${boardInfo}\nNume: *${leadData.name}*${phoneInfo}${extraInfo}${partnerIdInfo}`;
    }

    // ===== DUPLICAT =====
    else if (status === 'duplicate') {
      let phoneInfo = '';
      if (leadData.phone) {
        if (leadData.originalPhone && leadData.originalPhone !== leadData.phone) {
          phoneInfo = `\nTelefon Monday: *${leadData.originalPhone}*\nTelefon trimis: *${leadData.phone}*`;
        } else {
          phoneInfo = `\nTelefon: *${leadData.phone}*`;
        }
      }

      let extraInfo = '';
      if (leadData.email) extraInfo += `\nEmail: *${leadData.email}*`;

      const reason = result.reason || result.message || 'Lead duplicat';

      message = `🔄 *Lead duplicat în ${partnerName}* (${leadNum})${boardInfo}\nNume: *${leadData.name}*${phoneInfo}${extraInfo}\nMotiv: ${reason}`;
    }

    // ===== DATE INVALIDE / INCOMPLETE =====
    else if (status === 'invalid_data') {
      let dataInfo = `\nNume: *${leadData.name || 'LIPSĂ'}*`;
      if (leadData.phone !== undefined) dataInfo += `\nTelefon: *${leadData.phone || 'LIPSĂ'}*`;
      if (leadData.email !== undefined) dataInfo += `\nEmail: *${leadData.email || 'LIPSĂ'}*`;
      if (leadData.cnp !== undefined) dataInfo += `\nCNP: *${leadData.cnp || 'LIPSĂ'}*`;
      if (leadData.employer !== undefined) dataInfo += `\nAngajator: *${leadData.employer || 'LIPSĂ'}*`;
      if (leadData.income !== undefined) dataInfo += `\nSalariu: *${leadData.income || 'LIPSĂ'}*`;
      if (leadData.amount !== undefined) dataInfo += `\nSumă dorită: *${leadData.amount || 'LIPSĂ'}*`;

      // Erori de validare (dacă există)
      let errorDetails = '';
      if (result.errors && typeof result.errors === 'object') {
        const errorMessages = Object.entries(result.errors)
          .map(([field, messages]) => `  • ${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
          .join('\n');
        errorDetails = `\nErori:\n${errorMessages}`;
      }

      const reason = result.message || 'Date invalide sau incomplete';

      message = `⚠️ *Lead NU trimis - Date invalide* (${leadNum})${boardInfo}${dataInfo}\nMotiv: ${reason}${errorDetails}`;
    }

    // ===== EROARE =====
    else if (status === 'error') {
      let phoneInfo = '';
      if (leadData.phone) {
        if (leadData.originalPhone && leadData.originalPhone !== leadData.phone) {
          phoneInfo = `\nTelefon Monday: *${leadData.originalPhone}*\nTelefon trimis: *${leadData.phone}*`;
        } else {
          phoneInfo = `\nTelefon: *${leadData.phone}*`;
        }
      }

      let extraInfo = '';
      if (leadData.email) extraInfo += `\nEmail: *${leadData.email}*`;

      const errorMessage = result.message || 'Eroare necunoscută';

      message = `❌ *Lead respins de ${partnerName}* (${leadNum})${boardInfo}\nNume: *${leadData.name}*${phoneInfo}${extraInfo}\nEroare: ${errorMessage}`;
    }

    // Trimite mesajul
    await sendToSlack(webhookUrl, message);

  } catch (error) {
    console.error(`❌ Eroare la trimiterea notificării Slack pentru ${partnerName}:`, error.message);
  }
}

/**
 * Notificare Slack pentru avertismente generale (board neconfigurat, etc.)
 */
async function sendWarning(webhookUrl, warningMessage) {
  if (!webhookUrl) return;
  await sendToSlack(webhookUrl, warningMessage);
}

module.exports = {
  sendPartnerNotification,
  sendWarning
};
