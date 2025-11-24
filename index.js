const express = require('express');
require('dotenv').config();

const partnersRoutes = require('./routes/partners.routes');
const fourPayRoutes = require('./routes/4pay.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: true, limit: '500kb' })); // Pentru 4Pay webhook DSN

// Health check endpoint
app.get('/health', (req, res) => {
  const status = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
  console.log('🏥 Health check accesat');
  res.json(status);
});

// Debug endpoint - Environment info
app.get('/debug/env', async (req, res) => {
  const fetch = require('node-fetch');

  try {
    // Get public IP
    const ipResponse = await fetch('https://api.ipify.org?format=json');
    const ipData = await ipResponse.json();

    res.json({
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      publicIP: ipData.ip,
      opensslVersion: process.versions.openssl,
      uptime: process.uptime(),
      env: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// curl -X POST http://localhost:3000/test/bulk-mediate

// Bulk test endpoint - Trimite toate leadurile din CSV către Mediatel
app.post('/test/bulk-mediate', async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const { sendLead } = require('./services/partners/flex.service');

  const csvPath = 'C:\\Users\\pupaz\\Downloads\\FLEX 17.11.2025.csv';

  try {
    console.log('\n📂 Citesc CSV-ul...');
    const csvContent = fs.readFileSync(csvPath, 'utf8');

    // CSV-ul folosește \r (carriage return) ca separator între leaduri
    const lines = csvContent.split('\r').filter(line => line.trim());

    console.log(`📋 Am găsit ${lines.length} linii în CSV`);

    // Găsim linia cu header-ul (cea care conține "Name;TELEFON")
    let headerLine = null;
    let startIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Name;TELEFON')) {
        headerLine = lines[i];
        startIndex = i + 1; // Leadurile încep după header
        break;
      }
    }

    if (!headerLine) {
      return res.status(400).json({ error: 'Header-ul (Name;TELEFON) nu a fost găsit în CSV' });
    }

    console.log(`📋 Hleader găsit la linia ${startIndex - 1}`);

    // Parsăm leadurile (începând după header)
    const leads = [];
    for (let i = startIndex; i < lines.length; i++) {
      const columns = lines[i].split(';');
      const name = columns[0]?.trim();
      const phone = columns[1]?.trim();

      // Validăm: nume non-empty și telefon cu minim 9 cifre
      if (name && phone && phone.length >= 9 && !name.includes('NOIEMBRIE')) {
        leads.push({ name, phone });
      }
    }

    console.log(`\n✅ Am găsit ${leads.length} leaduri valide în CSV\n`);

    // Confirmăm rapid clientului
    res.json({
      message: 'Procesare începută',
      totalLeads: leads.length,
      info: 'Verifică consola pentru progress'
    });

    // Procesăm leadurile secvențial (async, după răspuns)
    const startTime = new Date();
    const results = {
      success: [],
      duplicate: [],
      failed: []
    };

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const leadNum = i + 1;

      try {
        console.log(`\n[${leadNum}/${leads.length}] 📤 Trimit: ${lead.name} - ${lead.phone}`);

        const testData = {
          id: `bulk-${Date.now()}-${i}`,
          name: lead.name,
          phone: lead.phone,
          originalPhone: lead.phone,
          boardName: 'Bulk Test CSV'
        };

        const result = await sendLead(testData);

        if (result.success) {
          console.log(`✅ [${leadNum}/${leads.length}] SUCCESS: ${lead.name}`);
          results.success.push({
            name: lead.name,
            phone: lead.phone,
            mediatelId: result.data?.leadId || result.data?.id || 'N/A'
          });
        } else {
          // Verificăm dacă e duplicat sau altă eroare
          const isDuplicate = result.message && (
            result.message.includes('duplicat') ||
            result.message.includes('duplicate') ||
            result.message.includes('Lead duplicat')
          );

          if (isDuplicate) {
            console.log(`🔄 [${leadNum}/${leads.length}] DUPLICATE: ${lead.name}`);
            results.duplicate.push({
              name: lead.name,
              phone: lead.phone,
              reason: result.message
            });
          } else {
            console.log(`❌ [${leadNum}/${leads.length}] FAILED: ${lead.name} - ${result.message}`);
            results.failed.push({
              name: lead.name,
              phone: lead.phone,
              reason: result.message
            });
          }
        }

        // Delay 2 secunde între leaduri (dacă nu e ultimul)
        if (i < leads.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`❌ [${leadNum}/${leads.length}] ERROR: ${lead.name} - ${error.message}`);
        results.failed.push({
          name: lead.name,
          phone: lead.phone,
          reason: error.message
        });
      }
    }

    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000 / 60).toFixed(2); // minute

    console.log(`\n\n🏁 FINALIZAT!`);
    console.log(`✅ Succese: ${results.success.length}`);
    console.log(`🔄 Duplicate: ${results.duplicate.length}`);
    console.log(`❌ Eșuate: ${results.failed.length}`);

    // ===== GENERARE RAPORT =====
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const reportPath = path.join(__dirname, `RAPORT_MEDIATEL_${timestamp}.md`);

    let report = `# RAPORT TRIMITERE LEADURI CĂTRE MEDIATEL (FLEX)

**Data/Ora:** ${new Date().toLocaleString('ro-RO')}
**Fișier CSV:** FLEX 17.11.2025.csv
**Durata procesare:** ${duration} minute

---

## SUMAR

| Categorie | Număr | Procent |
|-----------|-------|---------|
| ✅ **Succese** | ${results.success.length} | ${((results.success.length / leads.length) * 100).toFixed(1)}% |
| 🔄 **Duplicate** | ${results.duplicate.length} | ${((results.duplicate.length / leads.length) * 100).toFixed(1)}% |
| ❌ **Eșuate** | ${results.failed.length} | ${((results.failed.length / leads.length) * 100).toFixed(1)}% |
| **TOTAL** | ${leads.length} | 100% |

---

## ✅ LEADURI TRIMISE CU SUCCES (${results.success.length})

`;

    results.success.forEach((item, index) => {
      report += `${index + 1}. **${item.name}** - ${item.phone}\n`;
      if (item.mediatelId !== 'N/A') {
        report += `   - ID Mediatel: ${item.mediatelId}\n`;
      }
    });

    report += `\n---\n\n## 🔄 LEADURI DUPLICATE (${results.duplicate.length})\n\n`;

    if (results.duplicate.length === 0) {
      report += `*Nu există leaduri duplicate.*\n`;
    } else {
      results.duplicate.forEach((item, index) => {
        report += `${index + 1}. **${item.name}** - ${item.phone}\n`;
        report += `   - Motiv: ${item.reason}\n`;
      });
    }

    report += `\n---\n\n## ❌ LEADURI EȘUATE (${results.failed.length})\n\n`;

    if (results.failed.length === 0) {
      report += `*Nu există leaduri eșuate.*\n`;
    } else {
      results.failed.forEach((item, index) => {
        report += `${index + 1}. **${item.name}** - ${item.phone}\n`;
        report += `   - Eroare: ${item.reason}\n`;
      });
    }

    report += `\n---\n\n## DETALII TEHNICE

- **Endpoint:** POST /test/bulk-mediatel
- **API Mediatel:** ${process.env.FLEX_API_URL}
- **Timeout per request:** ${process.env.FLEX_TIMEOUT}ms
- **Delay între leaduri:** 2 secunde
- **Campaign:** ${process.env.FLEX_CAMPAIGN}
- **Source:** ${process.env.FLEX_SOURCE}

---

*Raport generat automat de Monday Webhook Server*
`;

    // Salvăm raportul
    fs.writeFileSync(reportPath, report, 'utf8');
    console.log(`\n📄 Raport salvat: ${reportPath}`);

  } catch (error) {
    console.error('❌ Eroare citire CSV:', error.message);
    // Dacă clientul încă așteaptă, trimitem eroare
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Debug endpoint - Test Credius connection
app.get('/debug/credius-test', async (req, res) => {
  console.log('🔍 [DEBUG] Testare conexiune Credius...');

  const { sendLead } = require('./services/partners/credius.service');

  const startTime = Date.now();
  const testName = `Test Debug ${Date.now()}`;

  try {
    const result = await sendLead(testName, '0747594324');
    const duration = Date.now() - startTime;

    console.log(`✅ [DEBUG] Credius răspuns în ${duration}ms`);

    res.json({
      success: true,
      duration: `${duration}ms`,
      durationSeconds: (duration / 1000).toFixed(2),
      result: result,
      testName: testName,
      nodeVersion: process.version,
      opensslVersion: process.versions.openssl,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    console.log(`❌ [DEBUG] Credius timeout/eroare după ${duration}ms`);

    res.status(500).json({
      success: false,
      duration: `${duration}ms`,
      durationSeconds: (duration / 1000).toFixed(2),
      error: error.message,
      errorCode: error.code,
      testName: testName,
      nodeVersion: process.version,
      opensslVersion: process.versions.openssl,
      timestamp: new Date().toISOString()
    });
  }
});

// Routes pentru parteneri (webhook-uri)
app.use('/webhook/monday', partnersRoutes);

// Routes pentru 4Pay SMS
app.use('/api/4pay', fourPayRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ [ERROR HANDLER]', err);

  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    error: err.message || 'Something went wrong!'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('====================================');
  console.log(`🚀 Monday Webhook Server running on port ${PORT}`);
  console.log(`📅 Data/Ora: ${new Date().toISOString()}`);
  console.log(`⏱️  FLEX Timeout: ${process.env.FLEX_TIMEOUT}ms`);
  console.log(`🌐 Webhook-uri disponibile:`);
  console.log(`   - POST /webhook/monday/flex`);
  console.log(`   - POST /webhook/monday/credius`);
  console.log(`   - POST /webhook/monday/creditfix`);
  console.log(`   - POST /webhook/monday/icredit`);
  console.log(`   - POST /webhook/monday/bccreditrapid`);
  console.log(`   - POST /webhook/monday/flexcredit`);
  console.log(`   - POST /webhook/monday/simplucredit`);
  console.log(`   - POST /webhook/monday/ifn-sms (4Pay SMS Credilink)`);
  console.log(`   - GET  /health`);
  console.log(`\n📱 4Pay SMS endpoints:`);
  console.log(`   - POST /api/4pay/send-sms`);
  console.log(`   - POST /api/4pay/send-template-sms`);
  console.log(`   - POST /api/4pay/delivery-status (webhook DSN)`);
  console.log(`   - POST /api/4pay/receive-sms (webhook MO)`);
  console.log('====================================');
});
