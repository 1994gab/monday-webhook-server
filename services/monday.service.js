const axios = require('axios');
const { httpsAgent } = require('../config/axios-config');

const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;

/**
 * Interogare Monday pentru detalii item
 * @param {number} itemId - ID-ul item-ului din Monday
 * @returns {Promise<Object>} Item cu name și column_values
 */
async function fetchItemDetails(itemId) {
  const query = `
    query {
      items(ids: [${itemId}]) {
        name
        column_values {
          id
          text
          value
        }
      }
    }
  `;

  const response = await axios.post(
    MONDAY_API_URL,
    { query },
    {
      headers: {
        'Authorization': MONDAY_API_TOKEN,
        'Content-Type': 'application/json'
      },
      httpsAgent
    }
  );

  if (response.data.errors) {
    console.error('   ❌ Monday API Errors:', response.data.errors);
    throw new Error('Eroare Monday API');
  }

  const item = response.data.data?.items?.[0];

  if (!item) {
    throw new Error(`Item ${itemId} nu a fost găsit în Monday`);
  }

  return item;
}

/**
 * Extrage valoarea unei coloane din item Monday
 * @param {Object} item - Item Monday
 * @param {string} columnId - ID-ul coloanei
 * @returns {string|null} Valoarea coloanei
 */
function extractColumnValue(item, columnId) {
  const column = item.column_values.find(col => col.id === columnId);
  let value = column?.text || column?.value;

  // Curăță de JSON encoding dacă e cazul (pentru coloane phone)
  if (value && value.startsWith('{')) {
    try {
      const jsonData = JSON.parse(value);
      value = jsonData.phone || jsonData.value || jsonData.text || value;
    } catch (e) {
      // Lasă așa cum e dacă nu e JSON valid
    }
  }

  return value || null;
}

module.exports = {
  fetchItemDetails,
  extractColumnValue
};
