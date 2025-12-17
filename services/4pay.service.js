const axios = require('axios');
const { httpsAgent } = require('../config/axios-config');
require('dotenv').config();

/**
 * Service pentru trimitere SMS prin 4Pay API
 *
 * Documentație: https://sms.4pay.ro
 * Endpoint: https://sms.4pay.ro/smsapi/api.send_sms
 */

// Configurație 4Pay din .env
const FOURPAY_CONFIG = {
  API_URL: process.env.FOURPAY_API_URL || 'https://sms.4pay.ro/smsapi/api.send_sms',
  SERV_ID: process.env.FOURPAY_SERV_ID,
  PASSWORD: process.env.FOURPAY_PASSWORD,
  TIMEOUT: 30000  // 30 secunde timeout
};

// Debug: verifică dacă credențialele sunt încărcate
console.log('🔐 [4PAY CONFIG] servID:', FOURPAY_CONFIG.SERV_ID);
console.log('🔐 [4PAY CONFIG] password:', FOURPAY_CONFIG.PASSWORD ? '***' + FOURPAY_CONFIG.PASSWORD.slice(-3) : 'MISSING');

/**
 * Normalizează numărul de telefon la formatul cerut de 4Pay
 * Acceptă: +40722123456, 0722123456, 722123456
 * Returnează: 0722123456 (format standard românesc)
 *
 * @param {string} phone - Numărul de telefon în orice format
 * @returns {string|null} Numărul normalizat sau null dacă invalid
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Elimină spații, liniuțe, paranteze, puncte
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  // Elimină prefixul +40
  if (cleaned.startsWith('+40')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('0040')) {
    cleaned = cleaned.substring(4);
  } else if (cleaned.startsWith('40')) {
    cleaned = cleaned.substring(2);
  }

  // Adaugă 0 la început dacă lipsește
  if (!cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }

  // Validare: trebuie să aibă 10 cifre și să înceapă cu 07
  if (!/^07[0-9]{8}$/.test(cleaned)) {
    return null;
  }

  return cleaned;  // Returns: 0722123456
}

/**
 * Template-uri predefinite pentru mesaje SMS
 */
const SMS_TEMPLATES = {
    // Lead nou primit
    LEAD_RECEIVED: ({ name }) =>
      `Bună ${name}! Cererea ta de credit a fost primită. Vei fi contactat în curând de un agent Fidem.`,

    // Aprobare credit
    CREDIT_APPROVED: ({ name, amount }) =>
      `Felicitări ${name}! Ai fost aprobat pentru un credit de ${amount} RON. Te vom contacta pentru finalizare.`,

    // Respingere credit
    CREDIT_REJECTED: ({ name }) =>
      `Bună ${name}. Din păcate, cererea ta de credit nu a fost aprobată momentan. Te vom contacta cu detalii.`,

    // Link Credilink + Ocean pentru formulare
    CREDILINK: ({ url }) =>
      `Buna ziua,\nIn urma convorbirii telefonice, va transmitem link-ul catre partenerii nostri:\n${'https://fidem.ro/pr/'}`,

    // Mesaj generic
    GENERIC: ({ message }) => message
  };

/**
 * Trimite un SMS prin 4Pay API
 *
 * @param {Object} smsData - Date SMS
 * @param {string} smsData.phone - Telefon destinatar (va fi normalizat)
 * @param {string} smsData.message - Textul mesajului (max 160 caractere = 1 segment)
 * @param {string} smsData.externalMessageId - ID mesaj extern (optional, pentru tracking)
 * @returns {Promise<Object>} Răspuns de la 4Pay API
 */
async function sendSMS(smsData) {
  // Validare input
  if (!smsData.phone || !smsData.message) {
    throw new Error('Telefon și mesaj sunt obligatorii');
  }

  // Normalizează numărul de telefon
  const normalizedPhone = normalizePhoneNumber(smsData.phone);

  // Validare telefon
  if (!normalizedPhone) {
    return {
      success: false,
      status: 'invalid_phone',
      message: `Telefon invalid: ${smsData.phone}`
    };
  }

  // Validare lungime mesaj (160 caractere = 1 segment SMS)
  if (smsData.message.length > 160) {
    console.log(`⚠️ [4PAY] Mesaj lung (${smsData.message.length} caractere) - va fi trimis în ${Math.ceil(smsData.message.length / 160)} segmente`);
  }

  // Construiește parametrii
  const params = {
    servID: FOURPAY_CONFIG.SERV_ID,
    password: FOURPAY_CONFIG.PASSWORD,
    msg_dst: normalizedPhone,
    msg_text: smsData.message
  };

  // Adaugă external_messageID dacă există
  if (smsData.externalMessageId) {
    params.external_messageID = smsData.externalMessageId;
  }

  try {
    console.log(`📱 [4PAY] Trimit SMS către ${normalizedPhone}...`);
    console.log(`📤 [4PAY] Request: servID=${params.servID}, phone=${params.msg_dst}`);
    console.log(`📤 [4PAY] Full params:`, JSON.stringify(params, null, 2));

    // ÎNCERCARE: Trimite parametrii în QUERY STRING (ca în exemplele GET din doc)
    const response = await axios.get(
      FOURPAY_CONFIG.API_URL,
      {
        params: params,  // Parametrii în query string
        timeout: FOURPAY_CONFIG.TIMEOUT,
        httpsAgent: httpsAgent
      }
    );

    const result = response.data;

    console.log('[4PAY] Raw Response:', result);

    // Parse răspuns
    // Succes: "OK network=V msgID=987654321"
    // Eroare: "ERROR ERROR_SERV_NOT_FOUND"

    if (typeof result === 'string' && result.startsWith('OK')) {
      // Extract network și msgID din răspuns
      const networkMatch = result.match(/network=([OVCRIL])/);
      const msgIdMatch = result.match(/msgID=(\d+)/);

      const network = networkMatch ? networkMatch[1] : 'unknown';
      const msgId = msgIdMatch ? msgIdMatch[1] : 'unknown';

      // Map network codes
      const networkNames = {
        'O': 'Orange',
        'V': 'Vodafone',
        'C': 'Telekom Mobile',
        'R': 'RDS/Digi',
        'I': 'International',
        'L': 'Lycamobile',
        'T': 'Telekom'
      };

      return {
        success: true,
        msgId: msgId,
        network: networkNames[network] || network,
        phone: normalizedPhone,
        message: `SMS trimis cu succes către ${normalizedPhone} (${networkNames[network]})`
      };
    }

    // Eroare
    if (typeof result === 'string' && result.startsWith('ERROR')) {
      const errorCode = result.replace('ERROR ', '').trim();

      // Map error codes
      const errorMessages = {
        'ERROR_SERV_NOT_FOUND': 'Credențiale invalide (servID sau password greșite)',
        'ERROR_SERV_CFG_ERROR': 'Eroare configurare serviciu 4Pay',
        'ERROR_DEST_PARAMETER_INVALID': 'Număr telefon conține caractere invalide',
        'ERROR_DEST_NOT_FOUND': 'Număr telefon nu aparține unei rețele cunoscute',
        'ERROR_NO_ROUTE': 'Destinația nu este permisă',
        'ERROR_LIMIT_EXCEEDED': 'Limită depășită',
        'ERROR_IP_ACL': 'IP-ul nu este permis pentru trimitere',
        'ERROR_PARAM_VALIDITY_INVALID': 'Parametru msg_validity invalid'
      };

      return {
        success: false,
        status: 'api_error',
        errorCode: errorCode,
        message: errorMessages[errorCode] || `Eroare 4Pay: ${errorCode}`,
        rawResponse: result
      };
    }

    // Răspuns neașteptat
    return {
      success: false,
      status: 'unknown_response',
      message: 'Răspuns neașteptat de la 4Pay',
      rawResponse: result
    };

  } catch (error) {
    console.error('❌ [4PAY] Eroare trimitere SMS:', error.message);

    // Timeout
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        status: 'timeout',
        message: 'Timeout - 4Pay nu răspunde'
      };
    }

    // Network error
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        success: false,
        status: 'network_error',
        message: 'Nu se poate conecta la serverul 4Pay'
      };
    }

    // Alte erori
    return {
      success: false,
      status: 'error',
      message: error.message,
      error: {
        code: error.code,
        message: error.message
      }
    };
  }
}

/**
 * Trimite SMS folosind un template predefinit
 *
 * @param {string} phone - Telefon destinatar
 * @param {string} templateName - Nume template (LEAD_RECEIVED, CREDIT_APPROVED, etc.)
 * @param {Object} templateData - Date pentru template (name, amount, etc.)
 * @param {string} externalMessageId - ID mesaj extern (optional)
 * @returns {Promise<Object>} Răspuns de la 4Pay
 */
async function sendTemplatedSMS(phone, templateName, templateData = {}, externalMessageId = null) {
  const template = SMS_TEMPLATES[templateName];

  if (!template) {
    throw new Error(`Template necunoscut: ${templateName}`);
  }

  const message = template(templateData);

  return sendSMS({
    phone,
    message,
    externalMessageId
  });
}

module.exports = {
  sendSMS,
  sendTemplatedSMS,
  normalizePhoneNumber,
  SMS_TEMPLATES
};
