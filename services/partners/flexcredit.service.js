const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

/**
 * Service pentru comunicare cu FlexCredit API
 * Trimite lead-uri către sistemul FlexCredit
 */

// Configurație FlexCredit din .env
const FLEXCREDIT_CONFIG = {
  URL: process.env.FLEXCREDIT_API_URL,
  API_KEY: process.env.FLEXCREDIT_API_KEY,
  CALLBACK_URL: process.env.FLEXCREDIT_CALLBACK_URL || 'https://interius-in.onrender.com/api/flexcredit/callback',
  TIMEOUT: 30000  // 30 secunde timeout
};

// Configurație default pentru loan (poate veni din Monday în viitor)
const DEFAULT_LOAN_CONFIG = {
  PRODUCT_ID: 52,
  AMOUNT: 5000,
  INSTALLMENTS: 5
};

/**
 * Normalizează numărul de telefon la formatul cerut de FlexCredit: 07XXXXXXXX
 * @param {string} phone - Numărul de telefon în orice format
 * @returns {string|null} Numărul normalizat sau null dacă invalid
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Elimină toate caracterele non-numerice
  let cleaned = phone.replace(/\D/g, '');

  // Elimină prefixul de țară +40 dacă există
  if (cleaned.startsWith('40') && cleaned.length > 10) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('0040')) {
    cleaned = cleaned.substring(4);
  }

  // Dacă nu începe cu 0 și are 9 cifre (7XXXXXXXX), adaugă 0
  if (!cleaned.startsWith('0') && cleaned.length === 9 && cleaned.startsWith('7')) {
    cleaned = '0' + cleaned;
  }

  // Validare: trebuie să fie 10 cifre și să înceapă cu 07/02/03
  if (cleaned.length !== 10) {
    return null;
  }

  if (!cleaned.startsWith('07') && !cleaned.startsWith('02') && !cleaned.startsWith('03')) {
    return null;
  }

  return cleaned;
}

/**
 * Splitează numele complet în first_name și last_name
 * Format așteptat: "Popescu Ion" sau "Ion Popescu"
 * @param {string} fullName - Numele complet
 * @returns {Object} { firstName, lastName }
 */
function splitName(fullName) {
  if (!fullName) {
    return { firstName: '', lastName: '' };
  }

  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  // Presupunem format "Prenume Nume" (primul e prenume, restul e nume)
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  return { firstName, lastName };
}

/**
 * Trimite un lead la FlexCredit
 * @param {Object} leadData - Datele lead-ului
 * @param {string} leadData.name - Numele complet
 * @param {string} leadData.phone - Numărul de telefon
 * @param {string} leadData.email - Email-ul
 * @param {string} leadData.cnp - CNP-ul (personal_id)
 * @param {number} leadData.amount - Suma dorită (opțional)
 * @returns {Promise<Object>} Răspuns de la FlexCredit API
 */
async function sendLead(leadData) {
  const { name, phone, email, cnp, amount } = leadData;

  // Validare input obligatoriu
  if (!name || !phone || !email || !cnp) {
    return {
      success: false,
      requestId: null,
      message: 'Date incomplete - nume, telefon, email și CNP sunt obligatorii',
      rawResponse: null
    };
  }

  // Normalizează telefonul
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return {
      success: false,
      requestId: null,
      message: 'Număr de telefon invalid sau nu este românesc',
      rawResponse: `Original: ${phone}`
    };
  }

  // Split nume în first_name și last_name
  const { firstName, lastName } = splitName(name);

  // Generează UUID unic pentru request
  const requestId = crypto.randomUUID();

  // Construiește payload
  const payload = {
    request_id: requestId,
    loan: {
      product_id: DEFAULT_LOAN_CONFIG.PRODUCT_ID,
      amount: amount || DEFAULT_LOAN_CONFIG.AMOUNT,
      installments: DEFAULT_LOAN_CONFIG.INSTALLMENTS
    },
    client: {
      personal_id: cnp,
      first_name: firstName,
      last_name: lastName,
      phone_number: normalizedPhone,
      email: email
    },
    callback_url: FLEXCREDIT_CONFIG.CALLBACK_URL
  };

  console.log(`\n📤 [FLEXCREDIT] Trimit lead:`);
  console.log(`   Request ID: ${requestId}`);
  console.log(`   Nume: ${firstName} ${lastName}`);
  console.log(`   Telefon: ${normalizedPhone}`);
  console.log(`   Email: ${email}`);
  console.log(`   CNP: ${cnp.substring(0, 4)}****`);
  console.log(`   Sumă: ${payload.loan.amount} RON`);

  try {
    const response = await axios.post(
      `${FLEXCREDIT_CONFIG.URL}/requests`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': FLEXCREDIT_CONFIG.API_KEY
        },
        timeout: FLEXCREDIT_CONFIG.TIMEOUT
      }
    );

    const result = response.data;
    console.log('[FLEXCREDIT] Raw Response:', result);

    // Verifică răspunsul
    if (result.status === 'accepted' || result.status === 'Accept') {
      return {
        success: true,
        requestId: result.request_id || requestId,
        message: 'Lead acceptat cu succes',
        url: result.url || null,
        rawResponse: result
      };
    } else if (result.status === 'Rejected' || result.status === 'rejected') {
      return {
        success: false,
        requestId: result.request_id || requestId,
        message: 'Lead respins de FlexCredit',
        rawResponse: result
      };
    } else {
      return {
        success: false,
        requestId: result.request_id || requestId,
        message: result.message || 'Răspuns neașteptat',
        rawResponse: result
      };
    }

  } catch (error) {
    console.error('[FLEXCREDIT] Raw Response Error:', error.response?.data || error.message);

    // Verifică dacă e eroare de validare
    if (error.response?.data) {
      const errorData = error.response.data;
      let errorMessage = 'Eroare FlexCredit';

      // Parse erori de validare
      if (typeof errorData === 'object') {
        const errorMessages = [];
        for (const [field, messages] of Object.entries(errorData)) {
          if (Array.isArray(messages)) {
            errorMessages.push(`${field}: ${messages.join(', ')}`);
          }
        }
        if (errorMessages.length > 0) {
          errorMessage = errorMessages.join('; ');
        }
      }

      return {
        success: false,
        requestId: null,
        message: errorMessage,
        error: {
          status: error.response.status,
          data: errorData
        }
      };
    }

    return {
      success: false,
      requestId: null,
      message: error.message,
      error: {
        code: error.code,
        message: error.message
      }
    };
  }
}

module.exports = {
  sendLead,
  normalizePhoneNumber,
  splitName
};
