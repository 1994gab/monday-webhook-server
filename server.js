const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;


app.use(express.json());

const queue = [];
let processing = false;

// Funcție pentru trimitere mesaj către Slack
async function sendToSlack(message) {
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) {
      console.error('Slack responded with error:', await res.text());
    } else {
      console.log('Mesaj trimis cu succes către Slack');
    }
  } catch (err) {
    console.error('Eroare la trimiterea către Slack:', err.message);
  }
}

async function sendLeadToExternalApi(lead) {
  try {
    // Simulăm delay și trimitere
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('After sending to external API');

    // Simulăm succes
    await sendToSlack(`✅ Lead *${lead.name}* (${lead.phone}) a fost trimis cu succes către Felx.`);
    console.log('After sending to Slack');
  } catch (error) {
    console.error(`Eroare la trimiterea leadului ${lead.id}:`, error.message);
    await sendToSlack(`❌ Eroare la trimiterea leadului *${lead.name}* (${lead.phone}): ${error.message}`);
  }
}


// Procesare coadă leaduri
async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const lead = queue.shift();
    try {
      await sendLeadToExternalApi(lead);
      console.log(`Lead ${lead.id} trimis cu succes!`);
    } catch (err) {
      console.error(`Eroare la trimiterea leadului ${lead.id}:`, err.message);
    }
  }
  processing = false;
}

function addLeadToQueue(lead) {
  queue.push(lead);
  processQueue();
}


app.post('/monday-webhook', async (req, res) => {
  const body = req.body;

  if (body.challenge) {
    return res.json({ challenge: body.challenge });
  }
  try {
    // Extract item ID
    const itemId = body.event.pulseId;
    // Monday API query
    const query = {
      query: `
        query {
          items(ids: [${itemId}]) {
            name
            column_values {
              id
              text
            }
          }
        }
      `
    };
    
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': MONDAY_API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query)
    });
    const data = await response.json();
    console.log("✅ Răspuns complet Monday:", JSON.stringify(data, null, 2));
    if (data.errors) {
      console.error('API Errors:', data.errors);
      return res.status(500).send('API Error');
    }
    
    if (data.data && data.data.items && data.data.items[0]) {
      const item = data.data.items[0];
      const columns = item.column_values;
      const nume = item.name;
      const telefon = columns.find(col => col.id === 'phone_1__1')?.text;


    addLeadToQueue({
    id: itemId,
    name: nume,
    phone: telefon,
    })
    }


    
    res.status(200).send('Webhook processed successfully');
    
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Error processing webhook');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});