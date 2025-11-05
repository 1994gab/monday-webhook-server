const axios = require('axios');
const { httpsAgent } = require('../../config/axios-config');
require('dotenv').config();

/**
 * Service pentru comunicare cu iCredit API
 * Trimite lead-uri (nume + telefon) către sistemul iCredit
 *
 * IMPORTANT: iCredit cere telefon cu 9 cifre (FĂRĂ 0 la început!)
 */

// Configurație iCredit din .env
const ICREDIT_CONFIG = {
  API_URL: process.env.ICREDIT_API_URL || 'https://icredit.ro/api/affiliates/application/create',
  AUTH_TOKEN: process.env.ICREDIT_AUTH_TOKEN,
  AFFILIATE_ID: process.env.ICREDIT_AFFILIATE_ID,
  TIMEOUT: 20000  // 20 secunde timeout
};

/**
 * Normalizează numărul de telefon la formatul cerut de iCredit: 712345678 (9 cifre)
 * IMPORTANT: iCredit NU vrea 0 la început!
 *
 * @param {string} phone - Numărul de telefon în orice format
 * @returns {string|null} Numărul normalizat (9 cifre) sau null dacă invalid
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Elimină spații, liniuțe, paranteze
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  // Elimină prefixul +40
  if (cleaned.startsWith('+40')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('40')) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('0040')) {
    cleaned = cleaned.substring(4);
  }

  // Elimină 0 de la început (CRITICAL pentru iCredit!)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  return cleaned;  // Returns 9 digits: 712345678
}

/**
 * Validează numărul de telefon (exact 9 cifre)
 */
function validatePhone(phone) {
  const phoneRegex = /^[0-9]{9}$/;  // Exact 9 cifre
  return phoneRegex.test(phone);
}

/**
 * Validează numele (doar litere și spații, max 190 caractere)
 */
function validateName(name) {
  if (!name || name.length > 190) return false;

  // Doar litere (inclusiv diacritice românești) și spații
  const nameRegex = /^[a-zA-ZăâîșțĂÂÎȘȚ\s]+$/;
  return nameRegex.test(name);
}

/**
 * Trimite un lead la iCredit
 *
 * @param {Object} leadData - Date lead
 * @param {string} leadData.name - Nume complet
 * @param {string} leadData.phone - Telefon (va fi normalizat la 9 cifre)
 * @returns {Promise<Object>} Răspuns de la iCredit API
 */
async function sendLead(leadData) {
  // Validare input
  if (!leadData.name || !leadData.phone) {
    throw new Error('Numele și telefonul sunt obligatorii');
  }

  // Normalizează numărul de telefon la 9 cifre
  const normalizedPhone = normalizePhoneNumber(leadData.phone);

  // Validare nume
  if (!validateName(leadData.name)) {
    return {
      success: false,
      status: 'invalid_data',
      message: `Nume invalid - trebuie doar litere și spații, max 190 caractere (primit: ${leadData.name})`
    };
  }

  // Validare telefon (exact 9 cifre)
  if (!validatePhone(normalizedPhone)) {
    return {
      success: false,
      status: 'invalid_data',
      message: `Telefon invalid - trebuie exact 9 cifre (primit: ${normalizedPhone || 'null'} din ${leadData.phone})`
    };
  }

  // Construiește payload iCredit (doar 2 câmpuri!)
  const payload = {
    name: leadData.name,
    telephone: normalizedPhone  // 9 cifre, fără 0
  };

  console.log(`\n📤 [ICREDIT] Trimit lead:`);
  console.log(`   Nume: ${leadData.name}`);
  console.log(`   Telefon original: ${leadData.phone}`);
  console.log(`   Telefon normalizat: ${normalizedPhone} (9 cifre)`);

  try {
    // Trimite la iCredit API cu X-Auth-Token header
    const response = await axios.post(
      ICREDIT_CONFIG.API_URL,
      payload,
      {
        headers: {
          'X-Auth-Token': ICREDIT_CONFIG.AUTH_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: ICREDIT_CONFIG.TIMEOUT,
        httpsAgent: httpsAgent
      }
    );

    const result = response.data;

    // Success - Lead created
    if (result.success === true || result.payload?.ID) {
      const leadId = result.payload?.ID || result.id || 'unknown';
      console.log(`   ✅ Lead trimis cu succes! ID: ${leadId}`);
      return {
        success: true,
        id: leadId,
        status: 'created',
        message: `Lead creat cu succes - ID: ${leadId}`
      };
    }

    // Other response
    return {
      success: false,
      status: 'unknown',
      message: result.message || 'Răspuns neașteptat de la iCredit',
      rawResponse: result
    };

  } catch (error) {
    console.error(`\n   ❌ [ICREDIT] Eroare: ${error.message}`);

    // Auth error (401/403)
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      return {
        success: false,
        status: 'auth_error',
        message: error.response.status === 401
          ? 'Token de autentificare lipsește'
          : 'Token de autentificare invalid'
      };
    }

    // Validation error (422)
    if (error.response && error.response.status === 422) {
      return {
        success: false,
        status: 'validation_error',
        message: error.response.data?.message || 'Erori de validare',
        errors: error.response.data?.errors || []
      };
    }

    // Rate limit (429)
    if (error.response && error.response.status === 429) {
      return {
        success: false,
        status: 'rate_limit',
        message: 'Too many requests - așteptare necesară'
      };
    }

    // Timeout
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        status: 'timeout',
        message: 'Timeout - iCredit nu răspunde'
      };
    }

    // Other errors
    return {
      success: false,
      status: 'error',
      message: error.message,
      error: {
        code: error.code,
        message: error.message,
        response: error.response ? {
          status: error.response.status,
          data: error.response.data
        } : null
      }
    };
  }
}

module.exports = {
  sendLead,
  normalizePhoneNumber,
  validatePhone,
  validateName
};
