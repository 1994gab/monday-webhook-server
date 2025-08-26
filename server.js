const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;


app.use(express.json());

const queue = [];
let processing = false;
let leadsSuccessCount = 0;
let leadsFailCount = 0;
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
    // Prepare Mediatel API payload
    const mediatetPayload = [
      {
        "campaign": "Solicitari_Creditare_Online_Outbound",
        "data": {
          "Name": lead.name,
          "Sursa": "Fidem"
        },
        "id": lead.id,
        "phones": [
          {
            "phoneNo": lead.phone,
            "phoneType": "main phone"
          }
        ]
      }
    ];

    console.log('📤 Payload trimis către Mediatel:', JSON.stringify(mediatetPayload, null, 2));

    // Send to Mediatel API
    const response = await fetch('http://185.120.145.202:84/api/import-leads/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer bWVkaWF0ZWw6dHExNmx2NmVpbjZl'
      },
      body: JSON.stringify(mediatetPayload)
    });

    const responseData = await response.json();
    console.log('📤 Mediatel API Response:', JSON.stringify(responseData, null, 2));

    if (!response.ok) {
      throw new Error(`Mediatel API error: ${response.status} - ${JSON.stringify(responseData)}`);
    }

    // Verifică dacă leadul a fost importat cu succes
    if (responseData.leadsImported === 1 && responseData.error === null) {
      console.log('✅ Lead sent to Mediatel successfully');
      leadsSuccessCount++;
      await sendToSlack(`✅ Lead trimis cu succes către Mediatel (#${leadsSuccessCount})\nNume: *${lead.name}*\nTelefon: *${lead.phone}*`);
    } else if (responseData.leadsImported === 0 && responseData.error === null) {
      console.log('❌ Lead not imported - possible duplicate or validation issue');
      leadsFailCount++;
      await sendToSlack(`❌ Lead nu a fost importat (posibil duplicat) (#${leadsFailCount})\nNume: *${lead.name}*\nTelefon: *${lead.phone}*`);
    } else if (responseData.error !== null) {
      console.log('❌ Lead import failed with error');
      leadsFailCount++;
      await sendToSlack(`❌ Eroare la trimiterea leadului (#${leadsFailCount})\nNume: *${lead.name}*\nTelefon: *${lead.phone}*\nEroare: ${responseData.error}`);
    }
    
  } catch (error) {
    console.error(`Eroare la trimiterea leadului ${lead.id}:`, error.message);
    leadsFailCount++;
    await sendToSlack(`❌ Eroare la conectarea cu Mediatel (#${leadsFailCount})\nNume: *${lead.name}*\nTelefon: *${lead.phone}*\nEroare: ${error.message}`);
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


// Endpoint de test pentru verificare server
app.get('/health', (req, res) => {
  const status = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    webhooksProcessed: {
      success: leadsSuccessCount,
      failed: leadsFailCount,
      inQueue: queue.length
    }
  };
  console.log('🏥 Health check accesat:', status);
  res.json(status);
});

app.post('/monday-webhook', async (req, res) => {
  console.log('🔔 WEBHOOK PRIMIT DE LA MONDAY! Timestamp:', new Date().toISOString());
  console.log('📦 Request Body:', JSON.stringify(req.body, null, 2));
  
  const body = req.body;

  if (body.challenge) {
    console.log('🤝 Challenge Monday primit:', body.challenge);
    return res.json({ challenge: body.challenge });
  }
  
  console.log('✅ Procesez webhook real (nu challenge)...');
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
  console.log('====================================');
  console.log(`🚀 Server PORNIT pe port ${PORT}`);
  console.log(`📅 Data/Ora: ${new Date().toISOString()}`);
  console.log(`🌐 Aștept webhook-uri la endpoint: /monday-webhook`);
  console.log('====================================');
});