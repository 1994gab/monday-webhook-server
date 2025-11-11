const express = require('express');
require('dotenv').config();

const partnersRoutes = require('./routes/partners.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '500kb' }));

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

// Debug endpoint - Test FLEX connection
app.get('/debug/flex-test', async (req, res) => {
  console.log('🔍 [DEBUG] Testare conexiune FLEX...');

  const { sendLead } = require('./services/partners/flex.service');

  const startTime = Date.now();
  const testData = {
    id: `test-${Date.now()}`,
    name: 'Test Debug Flex',
    phone: '0747123456',
    originalPhone: '0747123456',
    boardName: 'Test Board'
  };

  try {
    const result = await sendLead(testData);
    const duration = Date.now() - startTime;

    console.log(`✅ [DEBUG] FLEX răspuns în ${duration}ms`);

    res.json({
      success: true,
      duration: `${duration}ms`,
      durationSeconds: (duration / 1000).toFixed(2),
      result: result,
      testData: testData,
      serverIP: req.ip,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    console.log(`❌ [DEBUG] FLEX timeout/eroare după ${duration}ms`);

    res.status(500).json({
      success: false,
      duration: `${duration}ms`,
      durationSeconds: (duration / 1000).toFixed(2),
      error: error.message,
      errorType: error.type,
      errorCode: error.code,
      testData: testData,
      serverIP: req.ip,
      timestamp: new Date().toISOString()
    });
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
  console.log(`🌐 Webhook-uri disponibile:`);
  console.log(`   - POST /webhook/monday/flex`);
  console.log(`   - POST /webhook/monday/credius`);
  console.log(`   - POST /webhook/monday/creditfix`);
  console.log(`   - POST /webhook/monday/icredit`);
  console.log(`   - POST /webhook/monday/bccreditrapid`);
  console.log(`   - GET  /health`);
  console.log('====================================');
});
