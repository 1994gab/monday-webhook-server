const fetch = require('node-fetch');
const AbortController = require('abort-controller');
const { httpAgent } = require('../../config/axios-config');
require('dotenv').config();

/**
 * Service pentru integrarea cu Mediatel API (FLEX)
 * Trimite lead-uri (nume + telefon) către sistemul Mediatel
 */

// Configurație Mediatel din .env
const MEDIATEL_CONFIG = {
  API_URL: process.env.FLEX_API_URL,
  AUTH_TOKEN: process.env.FLEX_AUTH_TOKEN,
  CAMPAIGN: process.env.FLEX_CAMPAIGN,
  SOURCE: process.env.FLEX_SOURCE,
  TIMEOUT: parseInt(process.env.FLEX_TIMEOUT) || 20000
};

/**
 * Trimite un lead către Mediatel API
 *
 * @param {Object} leadData - Date lead
 * @param {string} leadData.id - ID Monday item
 * @param {string} leadData.name - Nume complet
 * @param {string} leadData.phone - Telefon normalizat (07XXXXXXXX)
 * @param {string} leadData.originalPhone - Telefon original din Monday
 * @param {string} leadData.boardName - Nume board Monday
 * @returns {Promise<Object>} - { success: boolean, message: string, data?: any }
 */
async function sendLead(leadData) {
  try {
    // Prepare Mediatel API payload
    const mediatetPayload = [
      {
        "campaign": MEDIATEL_CONFIG.CAMPAIGN,
        "data": {
          "Name": leadData.name,
          "Sursa": MEDIATEL_CONFIG.SOURCE
        },
        "id": leadData.id,
        "phones": [
          {
            "phoneNo": leadData.phone,
            "phoneType": "main phone"
          }
        ]
      }
    ];

    // AbortController pentru timeout corect (node-fetch v2 compatibility)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MEDIATEL_CONFIG.TIMEOUT);

    // Send to Mediatel API
    const response = await fetch(MEDIATEL_CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MEDIATEL_CONFIG.AUTH_TOKEN}`
      },
      body: JSON.stringify(mediatetPayload),
      signal: controller.signal,
      agent: httpAgent  // Connection pooling pentru HTTP
    });

    clearTimeout(timeoutId);

    const responseData = await response.json();

    // Raw response pentru succes
    console.log('[FLEX] Raw Response Success:', responseData);

    if (!response.ok) {
      throw new Error(`Mediatel API error: ${response.status} - ${JSON.stringify(responseData)}`);
    }

    // Analizare răspuns Mediatel
    if (responseData.leadsImported === 1 && responseData.error === null) {
      return {
        success: true,
        message: 'Lead importat cu succes',
        data: responseData
      };
    } else if (responseData.leadsImported === 0 && responseData.error === null) {
      return {
        success: false,
        message: 'Lead duplicat sau validare eșuată',
        data: responseData
      };
    } else if (responseData.error !== null) {
      return {
        success: false,
        message: responseData.error,
        data: responseData
      };
    } else {
      return {
        success: false,
        message: 'Răspuns neașteptat de la Mediatel',
        data: responseData
      };
    }

  } catch (error) {
    console.log('[FLEX] Raw Response Error:', error);

    // Timeout
    if (error.code === 'ECONNABORTED' || error.type === 'request-timeout') {
      return {
        success: false,
        message: 'Request timeout după 20 secunde'
      };
    }

    // Alte erori
    return {
      success: false,
      message: error.message
    };
  }
}

module.exports = { sendLead };
