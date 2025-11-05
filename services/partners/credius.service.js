const axios = require('axios');
const { httpsAgent } = require('../../config/axios-config');
require('dotenv').config();

/**
 * Service pentru comunicare cu Credius API
 * Trimite lead-uri (nume + telefon) către sistemul Credius
 */

// Configurație Credius din .env
const CREDIUS_CONFIG = {
  URL: process.env.CREDIUS_URL,
  USERNAME: process.env.CREDIUS_USERNAME,
  API_KEY: process.env.CREDIUS_API_KEY,
  DEFAULT_COUNTY: 'București',
  TIMEOUT: 30000      // 30 secunde timeout (Credius API e foarte lent)
};

/**
 * Normalizează numărul de telefon la formatul cerut de Credius: 07XXXXXXXX
 * Acceptă doar numere românești
 * @param {string} phone - Numărul de telefon în orice format
 * @returns {string|null} Numărul normalizat sau null dacă nu e număr românesc valid
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Elimină toate caracterele non-numerice
  let cleaned = phone.replace(/\D/g, '');

  // Elimină prefixul de țară +40 dacă există
  if (cleaned.startsWith('40')) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('0040')) {
    cleaned = cleaned.substring(4);
  }

  // Dacă nu începe cu 0 și are 9 cifre (7XXXXXXXX), adaugă 0
  if (!cleaned.startsWith('0') && cleaned.length === 9 && cleaned.startsWith('7')) {
    cleaned = '0' + cleaned;
  }

  // Validare: trebuie să fie 07XXXXXXXX sau 02XXXXXXXX (numere românești)
  if (cleaned.length !== 10) {
    return null;
  }

  if (!cleaned.startsWith('07') && !cleaned.startsWith('02') && !cleaned.startsWith('03')) {
    return null;
  }

  return cleaned;
}

/**
 * Trimite un lead la Credius
 * @param {string} name - Numele persoanei
 * @param {string} phone - Numărul de telefon
 * @returns {Promise<Object>} Răspuns de la Credius API
 */
async function sendLead(name, phone) {
  // Validare input
  if (!name || !phone) {
    throw new Error('Numele și telefonul sunt obligatorii');
  }

  // Normalizează numărul de telefon
  const normalizedPhone = normalizePhoneNumber(phone);

  if (!normalizedPhone) {
    return {
      success: false,
      leadId: 0,
      message: 'Număr de telefon invalid sau nu este românesc',
      rawResponse: `Original: ${phone}`
    };
  }

  // Construiește payload
  const payload = {
    UserName: CREDIUS_CONFIG.USERNAME,
    ApiKey: CREDIUS_CONFIG.API_KEY,
    terminalCounty: CREDIUS_CONFIG.DEFAULT_COUNTY,
    leadName: name,
    leadPhone: normalizedPhone,
    amount: null,
    leadcnp: null
  };

  try {
    const response = await axios.post(CREDIUS_CONFIG.URL, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: CREDIUS_CONFIG.TIMEOUT,
      httpsAgent: httpsAgent
    });

    const result = response.data;

    // Raw response pentru succes
    console.log(result);

    if (!result) {
      return {
        success: false,
        leadId: 0,
        message: 'Răspuns gol de la server',
        error: 'No data'
      };
    }

    const mesaj = result.Mesaj || result.message;
    const leadId = result.Id || result.lead_id;
    const isActuallySuccess = mesaj === "OK" && leadId > 0;
    const isDuplicate = mesaj === "Lead Existent";

    if (isActuallySuccess) {
      return {
        success: true,
        leadId: leadId,
        message: 'Lead creat cu succes',
        rawResponse: mesaj
      };
    } else if (isDuplicate) {
      return {
        success: false,
        leadId: 0,
        message: 'Lead Duplicat',
        rawResponse: mesaj
      };
    } else {
      return {
        success: false,
        leadId: leadId || 0,
        message: mesaj || 'Răspuns neașteptat',
        rawResponse: JSON.stringify(result)
      };
    }

  } catch (error) {
    console.log(error);

    return {
      success: false,
      leadId: 0,
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
  normalizePhoneNumber
};
