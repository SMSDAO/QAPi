# SDK Integration Guide

The `@qapi/sdk` package is a lightweight, framework-agnostic client for the QAPi Core Service.

## Installation

```bash
npm install @qapi/sdk
```

---

## Initialisation

```js
const { QAPiClient, QAPiError, signup } = require("@qapi/sdk");

const client = new QAPiClient({
  apiKey:  process.env.QAPI_KEY,            // required
  baseUrl: "https://api.qapi.dev",          // optional – defaults to this
  timeout: 10_000,                          // optional – ms, default 10 000
});
```

---

## API Methods

### `client.resolve(name, version?)`

Resolves a module – returns the entrypoint URL and audit status. Results are cached in-process by `name@version`.

```js
const result = await client.resolve("express");
// {
//   resolved: true,
//   name: "express",
//   version: "4.18.2",
//   entrypoint: "https://github.com/expressjs/express.git#master:index.js",
//   sourceType: "github",
//   audit: { score: 98, passed: true, zeroDay: false },
//   cachedTtlSeconds: 3600
// }
```

**Behaviour:**
- Returns the entrypoint URL the SDK would use to stream the module code.
- Throws `QAPiError(403)` if the module requires a higher tier than your key.
- Throws `QAPiError(404)` if the module is not registered in QAPi.
- **Never falls back to local `node_modules`** for QAPi-managed modules.

---

### `client.list(filter?)`

Lists all module nodes accessible to your API key.

```js
const { count, tier, modules } = await client.list();
const filtered = await client.list({ name: "express" });
```

---

### `client.getModule(id)`

Fetches full metadata for a specific module node by its UUID.

```js
const node = await client.getModule("a1b2c3d4-e5f6-4789-ab01-23456789cdef");
```

---

### `client.audit(name, version?)` — Audited tier only

Runs a real-time security scan on a module.

```js
const result = await client.audit("express");
// {
//   name: "express",
//   version: "4.18.2",
//   id: "...",
//   audit: { score: 98, passed: true, zeroDay: false, ... },
//   status: "active"
// }
```

Throws `QAPiError(403)` if called from a non-Audited key.

---

### `client.auditReport()` — Audited tier only

Returns a full audit report for all accessible modules.

```js
const report = await client.auditReport();
// { generatedAt, summary: { total, passed, failed, zeroDays, ... }, modules: [...] }
```

---

### `client.ping()`

Pings the Core Service — useful for health checks.

```js
const { status, timestamp } = await client.ping();
```

---

### `client.clearCache()`

Clears the in-process resolve cache.

```js
client.clearCache();
```

---

### `signup({ email, tier?, baseUrl? })` — Static helper

Creates a new API key without a pre-existing key.

```js
const { apiKey, tier, email } = await signup({ email: "you@example.com", tier: "pro" });
```

---

## Error Handling

All methods throw a `QAPiError` on failure.

```js
try {
  const mod = await client.resolve("private-module");
} catch (err) {
  if (err instanceof QAPiError) {
    console.error(err.message);   // human-readable message
    console.error(err.code);      // machine-readable code, e.g. "RESOLVE_TIER_INSUFFICIENT"
    console.error(err.statusCode); // HTTP status, e.g. 403
  }
}
```

Common error codes:

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_MISSING_KEY` | 401 | No API key supplied |
| `AUTH_INVALID_KEY` | 403 | Key not recognised |
| `AUTH_TIER_INSUFFICIENT` | 403 | Endpoint requires higher tier |
| `RESOLVE_NOT_FOUND` | 404 | Module not registered in QAPi |
| `RESOLVE_TIER_INSUFFICIENT` | 403 | Module requires higher tier |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many calls per minute |

---

## Node.js integration

### CommonJS (require)

```js
// Load the bootstrap hook first (in your entry file or via NODE_OPTIONS)
require("./qapi-register.cjs");

const { QAPiClient } = require("@qapi/sdk");
const client = new QAPiClient({ apiKey: process.env.QAPI_KEY });
```

Or via environment variable:
```bash
NODE_OPTIONS="-r ./qapi-register.cjs" node app.js
```

### ESM (import)

```bash
node --loader ./qapi-loader.mjs app.mjs
```

Or:
```bash
NODE_OPTIONS="--loader ./qapi-loader.mjs" node app.mjs
```

---

## Serverless (Vercel / AWS Lambda)

Set `QAPI_KEY` and `QAPI_BASE_URL` as environment variables in your serverless platform, then use the SDK as normal:

```js
// api/resolve.js (Vercel Serverless Function)
const { QAPiClient } = require("@qapi/sdk");
const client = new QAPiClient({ apiKey: process.env.QAPI_KEY });

module.exports = async (req, res) => {
  const { name } = req.query;
  const result = await client.resolve(name);
  res.json(result);
};
```

---

## Browser (CDN)

> Note: API keys must **never** be exposed in client-side code. Use a server-side proxy.

```html
<script type="module">
  // Proxy your API key server-side; only call a trusted backend endpoint
  const res = await fetch("/api/resolve?name=lodash");
  const { entrypoint } = await res.json();
</script>
```
