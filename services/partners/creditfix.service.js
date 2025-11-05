const axios = require('axios');
const { httpsAgent } = require('../../config/axios-config');
require('dotenv').config();

/**
 * Service pentru comunicare cu CreditFix API
 * Trimite lead-uri complete (nume, telefon, email, CNP) către sistemul CreditFix
 */

// Configurație CreditFix din .env
const CREDITFIX_CONFIG = {
  API_URL: 'https://account.creditfix.ro/api/v2/affapi',
  AFF_ID: process.env.CREDITFIX_AFF_ID,
  USERNAME: process.env.CREDITFIX_USERNAME,
  PASSWORD: process.env.CREDITFIX_PASSWORD,
  TIMEOUT: 20000  // 20 secunde timeout
};

/**
 * Generează header Basic Auth din username și password
 */
function getBasicAuthHeader() {
  const credentials = `${CREDITFIX_CONFIG.USERNAME}:${CREDITFIX_CONFIG.PASSWORD}`;
  const base64Credentials = Buffer.from(credentials).toString('base64');
  return `Basic ${base64Credentials}`;
}

/**
 * Generează o sumă random pentru împrumut: 3000-7000 RON (pas 50 RON)
 */
function generateLoanAmount() {
  const min = 3000;
  const max = 7000;
  const step = 50;

  const steps = (max - min) / step;  // 80 steps
  const randomStep = Math.floor(Math.random() * (steps + 1));  // 0-80
  const amount = min + (randomStep * step);

  return amount;  // Examples: 3000, 3050, 3100... 6950, 7000
}

/**
 * Trimite un lead la CreditFix
 *
 * @param {Object} leadData - Date lead
 * @param {string} leadData.cnp - CNP (OBLIGATORIU)
 * @param {string} leadData.email - Email (OBLIGATORIU)
 * @param {string} leadData.phone - Telefon (OBLIGATORIU)
 * @param {string} leadData.cashingMethod - "Cash" sau "Card" (OBLIGATORIU)
 * @param {string} leadData.clickId - Click ID (opțional)
 * @returns {Promise<Object>} Răspuns de la CreditFix API
 */
async function sendLead(leadData) {
  // Validare input
  if (!leadData.cnp || !leadData.email || !leadData.phone) {
    throw new Error('CNP, email și telefon sunt obligatorii');
  }

  // Generează sumă random
  const amount = generateLoanAmount();

  // Construiește payload CreditFix
  const payload = {
    aff: CREDITFIX_CONFIG.AFF_ID,           // Affiliate ID
    cid: leadData.clickId || null,           // Click ID (optional)
    cnp: leadData.cnp,                       // CNP
    eml: leadData.email,                     // Email
    tel: leadData.phone,                     // Phone
    amt: amount,                             // Amount (random 3000-7000)
    vir: 'Da',                               // Venit recurring (hardcoded "Da")
    tpv: leadData.cashingMethod || 'Card'    // Cashing method ("Card" sau "Cash")
  };

  console.log(`\n📤 [CREDITFIX] Trimit lead:`);
  console.log(`   CNP: ${leadData.cnp}`);
  console.log(`   Email: ${leadData.email}`);
  console.log(`   Telefon: ${leadData.phone}`);
  console.log(`   Sumă: ${amount} RON`);
  console.log(`   Metodă încasare: ${leadData.cashingMethod}`);

  try {
    // Trimite la CreditFix API cu Basic Auth
    const response = await axios.post(
      `${CREDITFIX_CONFIG.API_URL}/create`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getBasicAuthHeader()
        },
        timeout: CREDITFIX_CONFIG.TIMEOUT,
        httpsAgent: httpsAgent
      }
    );

    const result = response.data;

    // Raw response pentru succes
    console.log('[CREDITFIX] Raw Response Success:', result);

    // Procesare răspuns CreditFix
    const status = result.status;
    const uid = result.uid;
    const message = result.message;
    const errors = result.errors;

    // Success - Lead created (verifică BOTH status și message)
    if (status === 'success' || message === 'success') {
      return {
        success: true,
        uid: uid,
        message: message,
        status: 'created'
      };
    }

    // Existing client
    if (status === 'existing client') {
      return {
        success: false,
        uid: uid,
        message: 'Client existent',
        status: 'existing'
      };
    }

    // Duplicate lead (verifică în status SAU message)
    if (status === 'previously transmitted client' || message === 'previously transmitted client') {
      return {
        success: false,
        uid: uid,
        message: 'Lead duplicat',
        status: 'duplicate'
      };
    }

    // Validation errors
    if (errors && Array.isArray(errors) && errors.length > 0) {
      return {
        success: false,
        uid: null,
        message: errors.join(', '),
        status: 'validation_error',
        errors: errors
      };
    }

    // Other error responses
    return {
      success: false,
      uid: uid || null,
      message: message || 'Răspuns neașteptat de la CreditFix',
      status: status || 'unknown',
      rawResponse: result
    };

  } catch (error) {
    console.log('[CREDITFIX] Raw Response Error:', error);

    // Authentication error (401/403)
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      return {
        success: false,
        uid: null,
        message: 'Eroare autentificare - verifică username/password',
        status: 'auth_error',
        error: error.message
      };
    }

    // Timeout
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        uid: null,
        message: 'Timeout - CreditFix nu răspunde',
        status: 'timeout'
      };
    }

    // Other errors
    return {
      success: false,
      uid: null,
      message: error.message,
      status: 'error',
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
  generateLoanAmount
};
