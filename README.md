# QAPi — Virtual Module Resolver

> A global, virtualized module provider — "the Streaming Service for Code."

Instead of installing dependencies locally, your project **streams** them via the QAPi SDK, which dynamically links to globally hosted repositories on GitHub or private VPS instances.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Developer Machine                                       │
│                                                         │
│  project/                  @solanar/sdk                    │
│    └─ app.js  ──require──▶  client.resolve("express")   │
└────────────────────────────────┬────────────────────────┘
                                 │ HTTPS  X-QAPi-Key header
                    ┌────────────▼────────────┐
                    │   QAPi Core Service     │
                    │   (api/)                │
                    │                         │
                    │  ① Auth / Rate Limit    │
                    │  ② Module Node Lookup   │
                    │  ③ Security Audit       │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                   ▼
       GitHub Repos       Private VPS          npm registry
```

---

## Subscription Tiers

| Feature               | Starter (Free) | Pro ($4/mo) | Audited (Custom) |
|-----------------------|:--------------:|:-----------:|:----------------:|
| Public GitHub repos   | ✔              | ✔           | ✔                |
| Private VPS modules   | ✗              | ✔           | ✔                |
| Dedicated cache       | ✗              | ✔           | ✔                |
| Rate limit (calls/min)| 100            | 1 000       | Unlimited        |
| Zero-day scanning     | ✗              | ✗           | ✔                |
| Security audit report | ✗              | ✗           | ✔                |
| SLA                   | Best effort    | Best effort | 99.9%            |

---

## Repository Structure

```
QAPi/
├── api/                        # QAPi Core Service (Node.js / Express)
│   ├── src/
│   │   ├── index.js            # Main entry point
│   │   ├── middleware/
│   │   │   ├── auth.js         # API key auth + tier guard
│   │   │   └── rateLimit.js    # Per-tier rate limiting
│   │   ├── routes/
│   │   │   ├── auth.js         # POST /auth/signup, GET /auth/tiers
│   │   │   ├── modules.js      # GET /modules, GET /modules/resolve
│   │   │   └── audit.js        # GET /audit/scan, GET /audit/report
│   │   ├── data/
│   │   │   ├── keyStore.js     # In-memory API key store
│   │   │   └── moduleStore.js  # In-memory module node store
│   │   └── tests/
│   │       └── api.test.js     # Node.js built-in test runner
│   └── package.json
│
├── sdk/                        # @solanar/sdk — lightweight client
│   ├── src/
│   │   ├── index.js            # QAPiClient, QAPiError, signup()
│   │   └── tests/
│   │       └── sdk.test.js
│   └── package.json
│
├── dashboard/                  # HTML5 + Tailwind CSS frontend
│   ├── index.html              # Neo-Futuristic dashboard
│   ├── signup.html             # API key signup page
│   └── docs.html               # Full SDK + API documentation
│
├── module-node.schema.json     # JSON Schema for Module Node metadata
├── bootstrap.ps1               # PowerShell virtual node orchestrator
└── README.md
```

---

## Quick Start

### 1. Get an API Key

Sign up at [qapi-omega.vercel.app/signup](https://qapi-omega.vercel.app/signup) or use the API:

```bash
curl -X POST https://qapi-omega.vercel.app/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","tier":"starter"}'
```

### 2. Install the SDK

```bash
npm install @solanar/sdk
```

### 3. Resolve a module

```js
const { QAPiClient } = require('@solanar/sdk');

const client = new QAPiClient({ apiKey: 'qapi-starter-YOUR_KEY' });
const result = await client.resolve('express');
console.log(result.entrypoint);
// → https://github.com/expressjs/express.git#master:index.js
```

### 4. Windows / PowerShell bootstrap

```powershell
# One-liner bootstrap (configures the virtual resolver)
.\bootstrap.ps1 -ApiKey "qapi-starter-YOUR_KEY"

# Or run with a global install and persisted environment variables
.\bootstrap.ps1 -ApiKey "qapi-pro-YOUR_KEY" -Tier pro -Global
```

---

## Running the API Locally

### Prerequisites

- Node.js ≥ 18.0.0
- npm ≥ 9

### Install all workspace dependencies

```bash
node scripts/bootstrap.js
```

Or install each package individually:

```bash
npm --prefix apps/core install && npm --prefix apps/core run build
npm --prefix api install
npm --prefix sdk install
```

### Environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable            | Default   | Description                                       |
|---------------------|-----------|---------------------------------------------------|
| `PORT`              | `3000`    | Port the Express API server listens on            |
| `QAPI_BLOB_BASE_URL`| —         | Base URL for blob-hosted modules (optional)       |
| `API_BASE_URL`      | Vercel URL| Public base URL of the deployed API               |
| `NODE_ENV`          | —         | Set to `production` for production deployments    |

### Run the API

```bash
npm --prefix api run start   # production
npm --prefix api run dev     # watch mode (Node 18+)
```

The service starts on port `3000` by default (`PORT` env var to override).

### Demo keys (available out of the box)

| Key                        | Tier     |
|----------------------------|----------|
| `qapi-starter-demo-key`    | starter  |
| `qapi-pro-demo-key`        | pro      |
| `qapi-audited-demo-key`    | audited  |

### Run all tests

```bash
npm test                    # all packages (api + sdk + core)
npm run test:api            # API tests only
npm run test:sdk            # SDK tests only
npm run test:core           # core-brain tests only
```

### Build all packages

```bash
npm run build               # build core-brain + SDK + typecheck
```

---

## Deploy to Vercel

The repository includes a `vercel.json` at the root that configures:
- `apps/core/api/*.ts` → `@vercel/node` serverless functions
- `dashboard/**` → `@vercel/static` static hosting

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

Ensure the following environment variables are set in your Vercel project settings:
- `QAPI_BLOB_BASE_URL` (if using blob modules)
- `NODE_ENV=production`

---

## API Reference

### Public (no auth)

| Method | Endpoint        | Description                         |
|--------|-----------------|-------------------------------------|
| GET    | `/health`       | Service health check                |
| GET    | `/auth/tiers`   | List all subscription tiers         |
| POST   | `/auth/signup`  | Create a new API key                |

### Protected (requires `X-QAPi-Key` header)

| Method | Endpoint                   | Tier     | Description                         |
|--------|----------------------------|----------|-------------------------------------|
| GET    | `/modules`                 | Any      | List accessible module nodes        |
| GET    | `/modules/resolve?name=`   | Any      | Resolve a module entrypoint         |
| GET    | `/modules/:id`             | Any      | Get a module node by UUID           |
| POST   | `/modules`                 | Pro+     | Register a new module node          |
| GET    | `/audit/scan?name=`        | Audited  | Run a real-time security scan       |
| GET    | `/audit/report`            | Audited  | Full audit report                   |
| GET    | `/audit/:id`               | Audited  | Audit details for a node            |

---

## Module Node Schema

Every module is described by a **Module Node** JSON object. See [`module-node.schema.json`](./module-node.schema.json) for the full JSON Schema (draft-07).

Key fields:

```jsonc
{
  "id": "uuid-v4",
  "name": "express",
  "version": "4.18.2",
  "source": { "type": "github", "url": "...", "region": "us-east-1" },
  "tier": "starter",        // starter | pro | audited
  "status": "active",       // active | degraded | offline | deprecated | quarantined
  "audit": {
    "score": 98,            // 0–100
    "passed": true,
    "vulnerabilities": { "critical": 0, "high": 0, "moderate": 0, "low": 1, "info": 2 },
    "zeroDay": false,
    "lastScannedAt": "2026-03-11T05:00:00Z"
  },
  "cache":   { "enabled": true, "ttlSeconds": 3600, "dedicatedCache": false },
  "metrics": { "callsTotal": 5000000, "avgLatencyMs": 4.2 }
}
```

---

## Security

- All protected endpoints validate the `X-QAPi-Key` (or `Authorization: Bearer`) header.
- Rate limiting is enforced per-key at the tier's allowed rate.
- The **Audited** tier enables real-time zero-day scanning before any module is served.
- Module nodes flagged with a zero-day are automatically set to `quarantined` status.

---

## License

MIT © 2026 GXQ STUDIO
