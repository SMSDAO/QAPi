# Getting Started

> QAPi is a **Streaming Service for Code**. Your users never install dependencies locally — they resolve them through the QAPi SDK.

---

## 1. Choose a Tier

| Tier | Price | Calls/min | Features |
|---|---|---|---|
| **Starter** | Free | 100 | Public GitHub repos, standard latency |
| **Pro** | $4/mo | 1 000 | Private VPS modules, dedicated cache |
| **Audited** | Custom | Unlimited | Zero-day scanning, 99.9% SLA, audit logs |

---

## 2. Get an API Key

### Via the dashboard

Go to [qapi.dev/signup](https://qapi.dev/signup) and fill in your email and desired tier.

### Via the API

```bash
curl -X POST https://api.qapi.dev/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","tier":"starter"}'
```

Response:
```json
{
  "message": "API key created successfully.",
  "apiKey": "qapi-starter-xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx",
  "tier": "starter",
  "email": "you@example.com",
  "createdAt": "2026-03-11T05:00:00.000Z",
  "tierConfig": { "price": "Free", "callsPerMin": 100, "features": ["..."] }
}
```

### Via the bootstrap script

**Unix / Linux / macOS (bootstrap.ps2):**
```bash
./bootstrap.ps2           # interactive: prompts for key or opens signup
./bootstrap.ps2 -k "qapi-starter-YOUR_KEY"
```

**Windows / PowerShell (bootstrap.ps1):**
```powershell
.\bootstrap.ps1
.\bootstrap.ps1 -ApiKey "qapi-starter-YOUR_KEY"
```

---

## 3. Install the SDK

```bash
npm install @qapi/sdk
```

Or let the bootstrap script install it for you (see above).

---

## 4. Resolve your first module

```js
const { QAPiClient } = require("@qapi/sdk");

const client = new QAPiClient({
  apiKey: process.env.QAPI_KEY,  // set by bootstrap or manually
});

const result = await client.resolve("express");
console.log(result.entrypoint);
// → https://github.com/expressjs/express.git#master:index.js
```

---

## 5. Verify in the dashboard

Open [qapi.dev](https://qapi.dev) and watch the **Live Module Call Trace** to see your request flow from SDK → API → Module Node.

---

## Next steps

- [SDK Integration Guide](./sdk-integration.md) — advanced usage
- [Virtual Module Resolver](./virtual-resolver.md) — how it works under the hood
- [API Reference](./api-reference.md) — complete endpoint docs
