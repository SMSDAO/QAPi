# Module Node Schema

Every module tracked by QAPi is described by a **Module Node** JSON record. The full JSON Schema (draft-07) lives in [`module-node.schema.json`](../module-node.schema.json) at the root of the repository.

---

## Key Fields

```jsonc
{
  // Unique identifier (UUID v4) – assigned by QAPi
  "id": "a1b2c3d4-e5f6-4789-ab01-23456789cdef",

  // npm-compatible package name
  "name": "express",
  "version": "4.18.2",
  "description": "Fast web framework for Node.js",

  // Where the module is hosted
  "source": {
    "type": "github",          // "github" | "vps" | "npm" | "private"
    "url": "https://github.com/expressjs/express.git",
    "branch": "master",
    "entrypoint": "index.js",
    "sha": "b8b4d5e6...",      // resolved commit SHA
    "privateVps": false,
    "region": "us-east-1"
  },

  // Minimum tier required to resolve this module
  "tier": "starter",           // "starter" | "pro" | "audited"

  // Health status
  "status": "active",          // "active" | "degraded" | "offline" | "deprecated" | "quarantined"

  // Security audit state
  "audit": {
    "score": 98,               // 0–100 composite security score
    "passed": true,
    "vulnerabilities": { "critical": 0, "high": 0, "moderate": 0, "low": 1, "info": 2 },
    "cve": [],                 // Known CVE IDs (e.g. ["CVE-2023-12345"])
    "lastScannedAt": "2026-03-11T05:00:00Z",
    "scanEngine": "qapi-audit-v1",
    "zeroDay": false
  },

  // CDN / edge-cache configuration
  "cache": {
    "enabled": true,
    "ttlSeconds": 3600,
    "dedicatedCache": false,   // true for Pro/Audited
    "hitCount": 120450,
    "missCount": 340,
    "lastPurgedAt": null
  },

  // Registry cross-references
  "registry": {
    "npm": "express",
    "github": "expressjs/express",
    "license": "MIT",
    "keywords": ["web", "framework", "http"],
    "homepage": "https://expressjs.com"
  },

  // Resolved dependency tree
  "dependencies": {
    "accepts": "~1.3.8",
    "body-parser": "1.20.1"
  },

  // Live usage metrics
  "metrics": {
    "callsTotal": 5000000,
    "callsLastMin": 820,
    "avgLatencyMs": 4.2,
    "p99LatencyMs": 18.7,
    "errorRate": 0.0002,
    "bandwidth": { "inboundBytes": 1048576, "outboundBytes": 104857600 }
  },

  // Lifecycle timestamps
  "timestamps": {
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-03-11T05:00:00Z",
    "deprecatedAt": null,
    "lastResolvedAt": "2026-03-11T05:07:00Z"
  },

  "tags": ["web", "framework", "popular"],
  "metadata": { "addedBy": "qapi-admin" }
}
```

---

## Source Types

| Type | Description |
|---|---|
| `github` | Public or private GitHub repository |
| `vps` | Private VPS-hosted module (Pro/Audited) |
| `npm` | Published npm package proxied through QAPi |
| `private` | Fully private, contract-only module (Audited) |

---

## Status Values

| Status | Description |
|---|---|
| `active` | Module is available and healthy |
| `degraded` | Module is available but experiencing issues |
| `offline` | Module is temporarily unavailable |
| `deprecated` | Module is no longer actively maintained |
| `quarantined` | Module failed a security scan and is blocked |

---

## Registering a New Module Node

**Requires Pro tier or higher.**

```bash
curl -X POST https://qapi-omega.vercel.app/modules \
  -H "X-QAPi-Key: qapi-pro-YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-library",
    "version": "1.0.0",
    "source": {
      "type": "vps",
      "url": "https://vps.qapi-omega.vercel.app/modules/my-library.git",
      "branch": "main",
      "entrypoint": "index.js",
      "privateVps": true,
      "region": "eu-west-1"
    },
    "tier": "pro"
  }'
```
