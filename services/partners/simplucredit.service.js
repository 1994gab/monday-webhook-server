const axios = require('axios');
const { httpsAgent } = require('../../config/axios-config');

/**
 * Service pentru trimitere lead-uri către Simplu Credit
 *
 * Documentație: https://api.partners.simplucredit.ro
 * Endpoint: POST /api/v1/lead
 */

const SIMPLU_CONFIG = {
  API_URL: process.env.SIMPLUCREDIT_API_URL || 'https://api.partners.simplucredit.ro/api/v1/lead',
  API_KEY: process.env.SIMPLUCREDIT_API_KEY,
  TIMEOUT: 60000  // 60 secunde
};

console.log('🔐 [SIMPLU CONFIG] API Key:', SIMPLU_CONFIG.API_KEY ? '***' + SIMPLU_CONFIG.API_KEY.slice(-8) : 'MISSING');

/**
 * Trimite un lead către Simplu Credit
 *
 * @param {Object} leadData
 * @param {string} leadData.name - Nume complet
 * @param {string} leadData.phone - Telefon normalizat (0722123456)
 * @param {string} leadData.originalPhone - Telefon original din Monday
 * @returns {Promise<Object>}
 */
async function sendLead(leadData) {
  const startTime = Date.now();

  try {
    console.log(`\n📤 [SIMPLU] Trimit lead: ${leadData.name} - ${leadData.phone}`);

    // Validare API Key
    if (!SIMPLU_CONFIG.API_KEY) {
      return {
        success: false,
        message: 'API Key Simplu Credit lipsește din configurare'
      };
    }

    // Asigură format telefon cu +40
    let phoneNumber = leadData.phone;
    if (!phoneNumber.startsWith('+')) {
      if (phoneNumber.startsWith('0')) {
        phoneNumber = '+40' + phoneNumber.substring(1);
      } else {
        phoneNumber = '+40' + phoneNumber;
      }
    }

    // Payload minim - doar telefon + nume
    const payload = {
      phoneNumber: phoneNumber,
      additionalData: {
        name: leadData.name
      }
    };

    console.log(`📋 [SIMPLU] Payload:`, JSON.stringify(payload, null, 2));

    // Trimite request
    const response = await axios.post(
      SIMPLU_CONFIG.API_URL,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${SIMPLU_CONFIG.API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: SIMPLU_CONFIG.TIMEOUT,
        httpsAgent: httpsAgent
      }
    );

    const duration = Date.now() - startTime;
    console.log(`✅ [SIMPLU] Răspuns primit în ${duration}ms`);
    console.log(`📋 [SIMPLU] Response:`, JSON.stringify(response.data, null, 2));

    // Răspuns de succes
    const data = response.data;

    return {
      success: true,
      id: data.id,
      status: data.status,
      redirectURL: data.redirectURL,
      message: `Lead trimis cu succes către Simplu Credit (ID: ${data.id})`,
      data: data
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`❌ [SIMPLU] Eroare după ${duration}ms:`, error.message);

    // Timeout
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        message: 'Timeout - Simplu Credit nu răspunde'
      };
    }

    // Eroare de la API
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      console.error(`❌ [SIMPLU] HTTP ${status}:`, JSON.stringify(data, null, 2));

      if (status === 400) {
        return {
          success: false,
          message: 'Date invalide',
          details: data
        };
      }

      if (status === 401) {
        return {
          success: false,
          message: 'Autentificare eșuată - API Key invalid'
        };
      }

      if (status === 429) {
        return {
          success: false,
          message: 'Rate limit depășit'
        };
      }

      return {
        success: false,
        message: data.message || `Eroare HTTP ${status}`,
        details: data
      };
    }

    // Alte erori
    return {
      success: false,
      message: error.message || 'Eroare necunoscută'
    };
  }
}

module.exports = {
  sendLead
};
