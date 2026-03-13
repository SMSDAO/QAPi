# API Reference

Base URL: `https://qapi-omega.vercel.app`

All protected endpoints require an API key supplied as:
- Header: `X-QAPi-Key: qapi-<tier>-<uuid>`
- Or: `Authorization: Bearer qapi-<tier>-<uuid>`

---

## Public Endpoints (no auth)

### GET /health

Returns service status.

**Response 200:**
```json
{ "status": "ok", "service": "qapi-core", "timestamp": "2026-03-11T05:00:00.000Z" }
```

---

### GET /auth/tiers

Returns all subscription tier definitions.

**Response 200:**
```json
{
  "tiers": [
    { "name": "starter", "price": "Free",   "callsPerMin": 100,      "features": ["..."] },
    { "name": "pro",     "price": "$4/mo",  "callsPerMin": 1000,     "features": ["..."] },
    { "name": "audited", "price": "Custom", "callsPerMin": null,     "features": ["..."] }
  ]
}
```

---

### POST /auth/signup

Creates a new API key.

**Request body:**
```json
{ "email": "you@example.com", "tier": "starter" }
```

**Response 201:**
```json
{
  "message": "API key created successfully.",
  "apiKey":  "qapi-starter-xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx",
  "tier":    "starter",
  "email":   "you@example.com",
  "createdAt": "2026-03-11T05:00:00.000Z",
  "tierConfig": { "price": "Free", "callsPerMin": 100, "features": ["..."] }
}
```

**Errors:**
| Code | HTTP | Description |
|---|---|---|
| `SIGNUP_INVALID_EMAIL` | 400 | Email address is missing or invalid |
| `SIGNUP_INVALID_TIER`  | 400 | Requested tier is unknown |

---

### GET /metrics

Returns a live operational snapshot for dashboard polling.

**Response 200:**
```json
{
  "generatedAt": "2026-03-11T05:00:00.000Z",
  "service": { "status": "ok", "uptime": 3600 },
  "resolvesLastMin": 42,
  "tierCallCounts": { "starter": 30, "pro": 10, "audited": 2 },
  "moduleCount": 3,
  "avgAuditScore": 97,
  "modules": [ { "id": "...", "name": "express", "status": "active", "audit": { ... }, "metrics": { ... } } ]
}
```

---

### GET /metrics/logs

Returns the last 200 structured log entries (ring buffer).

**Response 200:**
```json
{
  "count": 42,
  "logs": [
    { "ts": "...", "level": "info", "event": "resolution", "module": "express", "latencyMs": 4, "tier": "starter" }
  ]
}
```

---

## Protected Endpoints (require API key)

### GET /modules

Lists all module nodes accessible to the caller's tier.

**Query params:** `?name=<string>` – filter by name substring.

**Response 200:**
```json
{ "count": 2, "tier": "starter", "modules": [ { ... }, { ... } ] }
```

---

### GET /modules/resolve

Virtual module resolution — returns the entrypoint URL for streaming.

**Query params:** `?name=<string>&version=<semver>` (version is optional).

**Response 200:**
```json
{
  "resolved": true,
  "name": "express",
  "version": "4.18.2",
  "entrypoint": "https://github.com/expressjs/express.git#master:index.js",
  "sourceType": "github",
  "audit": { "score": 98, "passed": true, "zeroDay": false },
  "cachedTtlSeconds": 3600
}
```

**Errors:**
| Code | HTTP | Description |
|---|---|---|
| `RESOLVE_MISSING_NAME`       | 400 | `name` query param is absent |
| `RESOLVE_NOT_FOUND`          | 404 | Module not registered |
| `RESOLVE_TIER_INSUFFICIENT`  | 403 | Module requires higher tier |

---

### GET /modules/:id

Returns full Module Node metadata by UUID.

**Response 200:** Full module node object (see [Module Node Schema](./module-node-schema.md)).

---

### POST /modules — Pro+ only

Registers a new module node.

**Request body:** Module node object (name, version, source.url required).

**Response 201:** Created module node object.

---

### GET /audit/scan — Audited tier only

Runs a real-time security scan on a module.

**Query params:** `?name=<string>&version=<semver>`.

**Response 200:**
```json
{
  "name": "express",
  "version": "4.18.2",
  "id": "...",
  "audit": {
    "score": 97,
    "passed": true,
    "vulnerabilities": { "critical": 0, "high": 0, "moderate": 0, "low": 1, "info": 2 },
    "cve": [],
    "lastScannedAt": "2026-03-11T05:00:00.000Z",
    "scanEngine": "qapi-audit-v1",
    "zeroDay": false
  },
  "status": "active"
}
```

If a zero-day is detected:
- `audit.zeroDay` is `true`
- `audit.passed` is `false`
- `status` becomes `"quarantined"`
- Code delivery is denied

---

### GET /audit/report — Audited tier only

Returns a full audit summary for all accessible modules.

**Response 200:**
```json
{
  "generatedAt": "2026-03-11T05:00:00.000Z",
  "summary": {
    "total": 3, "passed": 3, "failed": 0,
    "quarantined": 0, "zeroDays": 0,
    "criticalVulns": 0, "highVulns": 0
  },
  "modules": [ { "id": "...", "name": "...", "version": "...", "status": "active", "audit": { ... } } ]
}
```

---

### GET /audit/:id — Audited tier only

Returns audit details for a specific module node by UUID.

**Response 200:**
```json
{ "id": "...", "name": "express", "version": "4.18.2", "audit": { ... }, "status": "active" }
```

---

## Rate Limiting

Rate limits are enforced per API key:

| Tier | Limit |
|---|---|
| Starter | 100 calls/min |
| Pro | 1 000 calls/min |
| Audited | Unlimited |

On limit exceeded, the API returns `429` with:
```json
{ "error": "Rate limit exceeded...", "code": "RATE_LIMIT_EXCEEDED", "tier": "starter" }
```
