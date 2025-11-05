const https = require('https');
const http = require('http');

/**
 * Agent HTTPS global pentru connection pooling
 * Previne socket exhaustion pe Render
 *
 * maxSockets: 10 → Max 10 conexiuni per host (shared între toate request-urile)
 * keepAlive: true → Reutilizează conexiunile
 */
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,        // Max 10 sockets per host (shared global)
  maxFreeSockets: 5,
  timeout: 60000,
  keepAliveMsecs: 1000
});

/**
 * Agent HTTP global (pentru API-uri fără HTTPS)
 */
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000,
  keepAliveMsecs: 1000
});

module.exports = { httpsAgent, httpAgent };
