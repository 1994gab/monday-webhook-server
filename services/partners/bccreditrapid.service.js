const axios = require('axios');
const { httpsAgent } = require('../../config/axios-config');
require('dotenv').config();

/**
 * Service pentru comunicare cu BC Credit Rapid (prin ADSY API v2)
 * Trimite lead-uri bulk către sistemul BC Credit Rapid
 *
 * API folosește Bearer token pentru autentificare
 * Toate lead-urile sunt marcate ca "salariat" (income_type)
 */

// Configurație BC Credit Rapid din .env
const BCCREDITRAPID_CONFIG = {
  API_URL: process.env.BCCREDITRAPID_API_URL || 'https://formular-dev.adsy.ro/api/v2/leads/bulk',
  WEBSITE_SECRET: process.env.BCCREDITRAPID_WEBSITE_SECRET,
  WEBSITE_CODE: process.env.BCCREDITRAPID_WEBSITE_CODE,
  TIMEOUT: 30000  // 30 secunde timeout
};

/**
 * Normalizează numărul de telefon la formatul cerut: +40XXXXXXXXX
 * Acceptă doar numere românești mobile
 * @param {string} phone - Numărul de telefon în orice format
 * @returns {string|null} Numărul normalizat sau null dacă nu e număr românesc valid
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Elimină toate caracterele non-numerice
  let cleaned = phone.replace(/\D/g, '');

  // Elimină prefixul de țară dacă există
  if (cleaned.startsWith('40')) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('0040')) {
    cleaned = cleaned.substring(4);
  }

  // Elimină 0 de la început dacă există (07XXXXXXXX → 7XXXXXXXX)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // Validare: trebuie să fie 9 cifre și să înceapă cu 7 (mobile românesc)
  if (cleaned.length !== 9) {
    return null;
  }

  if (!cleaned.startsWith('7')) {
    return null;
  }

  // Returnează în format internațional: +40XXXXXXXXX
  return '+40' + cleaned;
}

/**
 * Validează și sanitizează income (salariu)
 * BC Credit Rapid cere între 4 și 7 cifre
 * @param {number|string} income - Salariul
 * @returns {number|null} Valoare validă sau null
 */
function validateIncome(income) {
  if (!income) return null;

  const num = parseInt(income);
  if (isNaN(num)) return null;

  // Între 1000 și 9999999 (4-7 cifre)
  if (num < 1000 || num > 9999999) return null;

  return num;
}

/**
 * Validează și sanitizează amount (suma dorită)
 * BC Credit Rapid cere între 4 și 8 cifre
 * @param {number|string} amount - Suma dorită
 * @returns {number|null} Valoare validă sau null
 */
function validateAmount(amount) {
  if (!amount) return null;

  const num = parseInt(amount);
  if (isNaN(num)) return null;

  // Între 1000 și 99999999 (4-8 cifre)
  if (num < 1000 || num > 99999999) return null;

  return num;
}

/**
 * Trimite un lead la BC Credit Rapid
 * @param {Object} leadData - Date lead
 * @param {string} leadData.name - Nume complet
 * @param {string} leadData.email - Email valid
 * @param {string} leadData.phone - Telefon (va fi normalizat la 07XXXXXXXX)
 * @param {string} leadData.employer - Angajator
 * @param {number} leadData.income - Salariu (4-7 cifre)
 * @param {number} leadData.amount - Suma dorită (4-8 cifre)
 * @returns {Promise<Object>} Răspuns de la BC Credit Rapid API
 */
async function sendLead(leadData) {
  // Validare input
  if (!leadData.name || !leadData.email || !leadData.phone || !leadData.employer) {
    throw new Error('Numele, email, telefon și angajator sunt obligatorii');
  }

  // Normalizează numărul de telefon
  const normalizedPhone = normalizePhoneNumber(leadData.phone);

  if (!normalizedPhone) {
    return {
      success: false,
      status: 'invalid',
      message: 'Număr de telefon invalid sau nu este mobil românesc (trebuie să înceapă cu 07/+407)',
      errors: { phone: ['Număr mobil românesc invalid'] }
    };
  }

  // Validează income
  const validIncome = validateIncome(leadData.income);
  if (!validIncome) {
    return {
      success: false,
      status: 'invalid',
      message: 'Salariu invalid (trebuie între 1000 și 9999999)',
      errors: { income: ['Între 1000 și 9999999 RON'] }
    };
  }

  // Validează amount
  const validAmount = validateAmount(leadData.amount);
  if (!validAmount) {
    return {
      success: false,
      status: 'invalid',
      message: 'Sumă dorită invalidă (trebuie între 1000 și 99999999)',
      errors: { amount: ['Între 1000 și 99999999 RON'] }
    };
  }

  // Construiește payload pentru BC Credit Rapid (bulk cu 1 item)
  const payload = {
    items: [
      {
        website_code: BCCREDITRAPID_CONFIG.WEBSITE_CODE,
        name: leadData.name,
        email: leadData.email,
        phone: normalizedPhone,
        employer: leadData.employer,
        income_type: 'salariat',  // Hardcoded - toți sunt salariați
        income: validIncome,
        amount: validAmount,
        agree_gdpr: true,
        agree_policy: true,
        agree_anaf: true
        // source: opțional, omis deocamdată
      }
    ]
  };

  try {
    console.log(`\n📤 [BC CREDIT RAPID] Trimit lead:`);
    console.log(`   Nume: ${leadData.name}`);
    console.log(`   Email: ${leadData.email}`);
    console.log(`   Telefon: ${leadData.phone} → ${normalizedPhone}`);
    console.log(`   Angajator: ${leadData.employer}`);
    console.log(`   Salariu: ${validIncome} RON`);
    console.log(`   Sumă dorită: ${validAmount} RON`);

    const response = await axios.post(BCCREDITRAPID_CONFIG.API_URL, payload, {
      headers: {
        'Authorization': `Bearer ${BCCREDITRAPID_CONFIG.WEBSITE_SECRET}`,
        'Content-Type': 'application/json'
      },
      timeout: BCCREDITRAPID_CONFIG.TIMEOUT,
      httpsAgent: httpsAgent
    });

    const result = response.data;

    console.log(`\n✅ [BC CREDIT RAPID] Raw Response:`, JSON.stringify(result, null, 2));

    // Procesează răspunsul BC Credit Rapid
    const summary = result.summary || {};
    const items = result.items || [];

    // Primul (și singurul) item din răspuns
    const itemResult = items[0] || {};

    if (itemResult.status === 'inserted') {
      return {
        success: true,
        status: 'inserted',
        id: itemResult.id,
        message: 'Lead trimis cu succes către BC Credit Rapid'
      };
    } else if (itemResult.status === 'skipped') {
      return {
        success: false,
        status: 'skipped',
        reason: itemResult.reason,
        message: itemResult.reason === 'duplicate_30_days'
          ? 'Lead duplicat (există deja în ultimele 30 zile)'
          : 'Lead duplicat'
      };
    } else if (itemResult.status === 'invalid') {
      return {
        success: false,
        status: 'invalid',
        message: 'Date invalide',
        errors: itemResult.errors || {}
      };
    } else {
      return {
        success: false,
        status: 'unknown',
        message: 'Răspuns neașteptat de la BC Credit Rapid',
        rawResponse: result
      };
    }

  } catch (error) {
    console.error(`\n❌ [BC CREDIT RAPID] Eroare:`, error.message);

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
  validateIncome,
  validateAmount
};
