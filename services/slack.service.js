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
    const boardInfo = leadData.boardName ? `\n📋 Board: *${leadData.boardName}*` : '';

    let message = '';

    // ===== SUCCES =====
    if (status === 'success') {
      // ID-ul leadului din sistemul partener (poate fi id, uid, leadId)
      const partnerId = result.id || result.uid || result.leadId;
      const partnerIdInfo = partnerId ? `\n🆔 ID ${partnerName}: *${partnerId}*` : '';

      // Info telefon (arată diferența dacă există)
      let phoneInfo = '';
      if (leadData.phone) {
        if (leadData.originalPhone && leadData.originalPhone !== leadData.phone) {
          phoneInfo = `\n📱 Telefon Monday: *${leadData.originalPhone}*\n📱 Telefon trimis: *${leadData.phone}*`;
        } else {
          phoneInfo = `\n📱 Telefon: *${leadData.phone}*`;
        }
      }

      // Info suplimentare (email, CNP, etc.)
      let extraInfo = '';
      if (leadData.email) extraInfo += `\n📧 Email: *${leadData.email}*`;
      if (leadData.cnp) extraInfo += `\n🆔 CNP: *${leadData.cnp}*`;
      if (leadData.employer) extraInfo += `\n🏢 Angajator: *${leadData.employer}*`;
      if (leadData.income) extraInfo += `\n💰 Salariu: *${leadData.income} RON*`;
      if (leadData.amount) extraInfo += `\n💵 Sumă dorită: *${leadData.amount} RON*`;
      if (leadData.cashingMethod) extraInfo += `\n💳 Metodă: *${leadData.cashingMethod}*`;

      message = `✅ *Lead trimis cu succes către ${partnerName}* (${leadNum})${boardInfo}\n👤 Nume: *${leadData.name}*${phoneInfo}${extraInfo}${partnerIdInfo}`;
    }

    // ===== DUPLICAT =====
    else if (status === 'duplicate') {
      let phoneInfo = '';
      if (leadData.phone) {
        if (leadData.originalPhone && leadData.originalPhone !== leadData.phone) {
          phoneInfo = `\n📱 Telefon Monday: *${leadData.originalPhone}*\n📱 Telefon trimis: *${leadData.phone}*`;
        } else {
          phoneInfo = `\n📱 Telefon: *${leadData.phone}*`;
        }
      }

      let extraInfo = '';
      if (leadData.email) extraInfo += `\n📧 Email: *${leadData.email}*`;

      const reason = result.reason || result.message || 'Lead duplicat';

      message = `🔄 *Lead duplicat în ${partnerName}* (${leadNum})${boardInfo}\n👤 Nume: *${leadData.name}*${phoneInfo}${extraInfo}\n💬 Motiv: ${reason}`;
    }

    // ===== DATE INVALIDE / INCOMPLETE =====
    else if (status === 'invalid_data') {
      let dataInfo = `\n👤 Nume: *${leadData.name || 'LIPSĂ'}*`;
      if (leadData.phone !== undefined) dataInfo += `\n📱 Telefon: *${leadData.phone || 'LIPSĂ'}*`;
      if (leadData.email !== undefined) dataInfo += `\n📧 Email: *${leadData.email || 'LIPSĂ'}*`;
      if (leadData.cnp !== undefined) dataInfo += `\n🆔 CNP: *${leadData.cnp || 'LIPSĂ'}*`;
      if (leadData.employer !== undefined) dataInfo += `\n🏢 Angajator: *${leadData.employer || 'LIPSĂ'}*`;
      if (leadData.income !== undefined) dataInfo += `\n💰 Salariu: *${leadData.income || 'LIPSĂ'}*`;
      if (leadData.amount !== undefined) dataInfo += `\n💵 Sumă dorită: *${leadData.amount || 'LIPSĂ'}*`;

      // Erori de validare (dacă există)
      let errorDetails = '';
      if (result.errors && typeof result.errors === 'object') {
        const errorMessages = Object.entries(result.errors)
          .map(([field, messages]) => `  • ${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
          .join('\n');
        errorDetails = `\n⚠️ Erori:\n${errorMessages}`;
      }

      const reason = result.message || 'Date invalide sau incomplete';

      message = `⚠️ *Lead NU trimis - Date invalide* (${leadNum})${boardInfo}${dataInfo}\n💬 Motiv: ${reason}${errorDetails}`;
    }

    // ===== EROARE =====
    else if (status === 'error') {
      let phoneInfo = '';
      if (leadData.phone) {
        if (leadData.originalPhone && leadData.originalPhone !== leadData.phone) {
          phoneInfo = `\n📱 Telefon Monday: *${leadData.originalPhone}*\n📱 Telefon trimis: *${leadData.phone}*`;
        } else {
          phoneInfo = `\n📱 Telefon: *${leadData.phone}*`;
        }
      }

      let extraInfo = '';
      if (leadData.email) extraInfo += `\n📧 Email: *${leadData.email}*`;

      const errorMessage = result.message || 'Eroare necunoscută';

      message = `❌ *Lead respins de ${partnerName}* (${leadNum})${boardInfo}\n👤 Nume: *${leadData.name}*${phoneInfo}${extraInfo}\n💬 Eroare: ${errorMessage}`;
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
  await sendToSlack(webhookUrl, `⚠️ ${warningMessage}`);
}

module.exports = {
  sendPartnerNotification,
  sendWarning
};
