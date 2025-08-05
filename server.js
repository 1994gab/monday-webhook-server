const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const MONDAY_API_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjU0NTY0MDA1OCwiYWFpIjoxMSwidWlkIjo3OTE0NzY4MiwiaWFkIjoiMjAyNS0wOC0wMVQwNjoyMjoyNC44NThaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjM2Nzc1NDMsInJnbiI6ImV1YzEifQ.mIs-ZNhqItctvh67V_tkbhVdrwZpkByb0YsGObrlifs';

app.use(express.json());

app.post('/monday-webhook', async (req, res) => {
  const body = req.body;
  
  // Challenge verification
  if (body.challenge) {
    console.log('Challenge received:', body.challenge);
    return res.json({ challenge: body.challenge });
  }

  console.log('Webhook received:', JSON.stringify(body, null, 2));
  
  try {
    // Extract item ID
    const itemId = body.event.pulseId;
    console.log('Item ID:', itemId);
    
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
    
    console.log('Calling Monday API...');
    
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': MONDAY_API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query)
    });
    
    const data = await response.json();
    console.log('Monday API Response:', JSON.stringify(data, null, 2));
    
    if (data.errors) {
      console.error('API Errors:', data.errors);
      return res.status(500).send('API Error');
    }
    
    if (data.data && data.data.items && data.data.items[0]) {
      const item = data.data.items[0];
      const columns = item.column_values;
      
      // Extract nume si telefon
      const nume = item.name;
      const telefon = columns.find(col => col.id === 'phone_1__1')?.text;
      
      console.log(`Nume: ${nume}, Telefon: ${telefon}`);
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