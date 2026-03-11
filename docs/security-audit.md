# Security Audit Pipeline

QAPi enforces a security scan for every module call from **Audited tier** users. This document explains the pipeline.

---

## Pipeline Overview

```
SDK Request
    │
    ▼
┌──────────────────────────────────────┐
│  1. Resolve Module Node Metadata     │  ← GET /modules/resolve
│     - name, version, source, tier    │
└──────────────────────┬───────────────┘
                       │
                       ▼
┌──────────────────────────────────────┐
│  2. Tier Permission Check            │  ← auth middleware
│     - Is key valid?                  │
│     - Does tier allow this module?   │
└──────────────────────┬───────────────┘
                       │
                       ▼ (Audited tier only)
┌──────────────────────────────────────┐
│  3. Security Scan                    │  ← GET /audit/scan
│     - Known CVE check                │
│     - Zero-day indicators            │
│     - Integrity check (SHA/tag)      │
│     - Composite score 0–100          │
└──────────────────────┬───────────────┘
                       │
          ┌────────────┴─────────────┐
          │ score ≥ 70               │ score < 70 or zero-day
          │ AND no zero-day          │
          ▼                          ▼
┌─────────────────┐       ┌──────────────────────────┐
│  4. Stream code │       │  4. DENY execution        │
│  Update logs    │       │  Return structured error  │
│  Update metrics │       │  Quarantine module node   │
└─────────────────┘       └──────────────────────────┘
```

---

## Scan Engine

The current scan engine (`qapi-audit-v1`) evaluates:

| Check | Description |
|---|---|
| **CVE database** | Known vulnerabilities (NIST NVD / OSV) |
| **Zero-day heuristics** | Anomalous entropy, obfuscated code patterns |
| **Source integrity** | Commit SHA / tag verification against the registered source |
| **Dependency graph** | Recursive scan of `node_modules` tree for transitive issues |
| **License compliance** | SPDX license vs. operator policy |

---

## Audit Score

The composite score is `0–100` (higher = safer):

| Score | Status | Action |
|---|---|---|
| 90–100 | Excellent | Delivered |
| 70–89 | Acceptable | Delivered |
| 40–69 | Degraded | Delivered with warning |
| 0–39 | Critical | Denied |
| Any + zero-day | Critical | Denied + quarantined |

---

## Failure Response

When a scan fails or is inconclusive:

```json
{
  "error": "Module failed security scan",
  "code": "AUDIT_SCAN_FAILED",
  "moduleNodeId": "a1b2c3d4-...",
  "reason": "zero-day vulnerability detected",
  "audit": {
    "score": 12,
    "passed": false,
    "zeroDay": true,
    "vulnerabilities": { "critical": 2, "high": 1, "moderate": 0, "low": 0, "info": 0 }
  },
  "remediation": "Pin to a known-safe version or use an alternative module."
}
```

---

## Audit Logs

Every scan result is:

1. Persisted to the Module Node record (`node.audit`).
2. Written as a structured JSON log line to `stdout`.
3. Stored in the in-process ring buffer (`GET /metrics/logs`).
4. Visible in the [QAPi Dashboard](https://qapi.dev) under the module's drill-down view.

---

## Module Quarantine

If a zero-day is detected:

- `node.status` is set to `"quarantined"`.
- All subsequent `resolve` calls for the module return `503 Service Unavailable`.
- The module is highlighted in red in the dashboard.
- An operator notification is emitted (audit log + structured error).

---

## Accessing Audit Data

### Via the SDK

```js
// Run a scan (Audited tier)
const result = await auditedClient.audit("express");

// Full report
const report = await auditedClient.auditReport();
```

### Via the API

```bash
# Scan a specific module
curl -H "X-QAPi-Key: qapi-audited-YOUR_KEY" \
  "https://api.qapi.dev/audit/scan?name=express"

# Full report
curl -H "X-QAPi-Key: qapi-audited-YOUR_KEY" \
  "https://api.qapi.dev/audit/report"

# Single node audit
curl -H "X-QAPi-Key: qapi-audited-YOUR_KEY" \
  "https://api.qapi.dev/audit/<node-uuid>"
```

---

## SLA

| Tier | Scan SLA |
|---|---|
| Audited | Real-time (< 2 s p99), 99.9% availability |
| Pro | Best-effort (no scan performed) |
| Starter | Not available |
