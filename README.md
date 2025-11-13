# 🚀 Monday.com Webhook Server

Server Node.js pentru procesarea webhook-urilor Monday.com și trimiterea lead-urilor către parteneri IFN (instituții financiare nebancare).

---

## 📋 Descriere

Acest server primește webhook-uri de la Monday.com când se adaugă/modifică un lead și îl trimite automat către partenerii IFN configurați (FLEX/Mediatel, Credius, CreditFix, iCredit, BC Credit Rapid).

**Flux:**
```
Monday.com → Webhook → Server → Partner IFN → Slack notification
```

---

## 🏗️ Arhitectură

**Stack:**
- Node.js v20.19.5 (LTS)
- Express v5.1.0
- Axios pentru API calls
- PM2 pentru process management
- Nginx reverse proxy
- UFW firewall

**Deployment:**
- DigitalOcean Droplet (Ubuntu 24.04 LTS)
- IP: `161.35.81.121`
- Cost: $4/month

---

## 🌐 Webhook Endpoints

### Production (DigitalOcean)
- **FLEX (Mediatel):** `http://161.35.81.121/webhook/monday/flex`
- **Credius:** `http://161.35.81.121/webhook/monday/credius`
- **CreditFix:** `http://161.35.81.121/webhook/monday/creditfix`
- **iCredit:** `http://161.35.81.121/webhook/monday/icredit`
- **BC Credit Rapid:** `http://161.35.81.121/webhook/monday/bccreditrapid`

### Health Check
- **Health:** `http://161.35.81.121/health`
- **Debug:** `http://161.35.81.121/debug/env`

---

## 📚 Documentație

**Toată documentația se află în folderul [`docs/`](./docs/):**

### 🚀 [Deployment Guide](./docs/DEPLOYMENT-DIGITALOCEAN.md)
Ghid complet deployment pe DigitalOcean:
- Setup inițial (SSH, Node.js, PM2, Nginx, UFW)
- Deploy aplicație
- **WORKFLOW ZILNIC:** Deploy cod, deploy .env, monitoring
- Troubleshooting și comenzi utile
- Lessons learned

### 🔧 [API Connectivity Issues](./docs/API-CONNECTIVITY-ISSUES.md)
Probleme și soluții pentru API-urile partenerilor:
- CREDIUS: Rezolvat cu Cloudflare Worker (TLS issues)
- FLEX: Geo-blocking US → DigitalOcean Amsterdam
- Testing procedures și debugging
- Lessons learned despre geo-blocking
- Action plan pentru API-uri noi

---

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js v20.x LTS
- npm v10.x

### Setup Local

```bash
# 1. Clone repository
git clone https://github.com/1994gab/monday-webhook-server.git
cd monday-webhook-server

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env
# Edit .env cu credențialele tale

# 4. Start server
npm run dev
# Server pornește pe http://localhost:3000
```

### Test Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Test webhook (challenge verification)
curl -X POST http://localhost:3000/webhook/monday/flex \
  -H "Content-Type: application/json" \
  -d '{"challenge":"test123"}'
```

---

## 🔄 Deployment Workflow

### Deploy modificări cod

```bash
# Pe server (SSH):
cd ~/monday-webhook-server
git pull origin main
pm2 restart monday-webhook
pm2 logs monday-webhook --lines 20
```

### Deploy modificări .env

```bash
# Local:
scp .env fidem@161.35.81.121:~/monday-webhook-server/

# Server:
pm2 restart monday-webhook
```

**Pentru detalii complete, vezi [Deployment Guide](./docs/DEPLOYMENT-DIGITALOCEAN.md#-workflow-zilnic---deploy-și-maintenance)**

---

## 📊 Monitoring

### Status servicii
```bash
ssh fidem@161.35.81.121
pm2 status
```

### Logs
```bash
# Logs LIVE
pm2 logs monday-webhook

# Ultimele 100 linii
pm2 logs monday-webhook --lines 100
```

---

## 🔧 Technology Stack

**Backend:**
- Express.js - Web framework
- Axios - HTTP client
- dotenv - Environment variables

**Deployment:**
- PM2 - Process manager
- Nginx - Reverse proxy
- UFW - Firewall
- DigitalOcean - Hosting

**Integrări:**
- Monday.com API
- Slack Webhooks
- Partner APIs (FLEX, Credius, CreditFix, iCredit, BC Credit Rapid)

---

## 📁 Structura Proiect

```
monday-webhook-server/
├── controllers/
│   └── partners/          # Controller pentru fiecare partener
│       ├── flex.controller.js
│       ├── credius.controller.js
│       ├── creditfix.controller.js
│       ├── icredit.controller.js
│       └── bccreditrapid.controller.js
├── services/
│   └── partners/          # Servicii API pentru fiecare partener
│       ├── flex.service.js
│       ├── credius.service.js
│       ├── creditfix.service.js
│       ├── icredit.service.js
│       └── bccreditrapid.service.js
├── routes/
│   └── partners.routes.js # Routing webhook endpoints
├── docs/                  # 📚 Documentație completă
│   ├── README.md
│   └── DEPLOYMENT-DIGITALOCEAN.md
├── index.js              # Entry point
├── package.json
└── .env                  # Environment variables (gitignored)
```

---

## 🔒 Security

- SSH key authentication (no password)
- UFW firewall enabled (ports 22, 80, 443 only)
- Port 3000 (Node.js) internal only
- SSH rate limiting (anti brute-force)
- Environment variables în .env (gitignored)

---

## 📝 Environment Variables

Exemplu `.env` (toate variabilele necesare):

```bash
# Server
PORT=3000
NODE_ENV=development

# Monday.com
MONDAY_API_TOKEN=your_token_here

# FLEX (Mediatel)
SLACK_WEBHOOK_URL=your_slack_webhook
FLEX_API_URL=http://185.120.145.202:84/api/import-leads/
FLEX_AUTH_TOKEN=your_token
FLEX_CAMPAIGN=Solicitari_Creditare_Online_Outbound
FLEX_SOURCE=Fidem
FLEX_TIMEOUT=60000

# (+ alte parteneri...)
```

**⚠️ IMPORTANT:** Fișierul `.env` NU e în Git! Trebuie creat manual.

---

## 🤝 Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📞 Support

**Documentație:** [`docs/`](./docs/)

**Issues:** Report bugs/features pe GitHub Issues

**Production access:** SSH la `fidem@161.35.81.121`

---

## 📄 License

Proprietate Fidem - Uz intern

---

**Dezvoltat de:** Echipa Fidem
**Deployment:** 12 noiembrie 2025
**Status:** ✅ Production-ready
