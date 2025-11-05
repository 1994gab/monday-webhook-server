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
  console.log(`   - GET  /health`);
  console.log('====================================');
});
