# Dashboard Guide

The QAPi Dashboard is an operator-grade HTML5 + Tailwind CSS UI hosted on Vercel at [qapi-omega.vercel.app](https://qapi-omega.vercel.app).

---

## Pages

| Page | URL | Description |
|---|---|---|
| Dashboard | `/` | Live call trace, tier overview, live stats |
| Sign Up | `/signup.html` | API key creation form |
| Docs | `/docs.html` | Full SDK and API documentation |

---

## Live Call Trace

The dashboard displays a **vertical call flow** for every module resolution:

```
① UI / Developer   →  client.resolve("express")
② QAPi SDK         →  GET /modules/resolve?name=express  (X-QAPi-Key)
③ QAPi Core API    →  Auth + Tier check + Rate limit
④ Security Audit   →  Score, CVEs, zero-day check  (Audited tier)
⑤ Module Delivered →  { resolved: true, entrypoint: "..." }
```

Each step shows:
- API key (redacted to first 8 chars), tier, and project
- Module Node identity (name, version, source)
- Latency breakdown per stage
- Security status (pass/fail, last audit, vulnerability count)
- SLA adherence

---

## Live Stats

The stats counters at the top of the dashboard poll `GET /metrics` every 10 seconds and update in real-time:

| Stat | Source field |
|---|---|
| Resolves / min | `resolvesLastMin` |
| Module Nodes | `moduleCount` |
| Avg Audit Score | `avgAuditScore` |
| Avg Latency | mean of `modules[].metrics.avgLatencyMs` |

When the API is unreachable the dashboard falls back to the last fetched values.

---

## Filters

- **Per-tier**: toggle between Starter / Pro / Audited views
- **Per-module**: click any module card to drill down into its full audit history
- **Timeline**: scroll the log feed for call bursts and anomalies

---

## Linked Resources

Each visual element links to the relevant documentation:

| Element | Links to |
|---|---|
| Module name | [Module Node Schema](./module-node-schema.md) |
| Audit score / CVEs | [Security Audit Pipeline](./security-audit.md) |
| SDK code snippets | [SDK Integration Guide](./sdk-integration.md) |
| Tier badges | [Getting Started](./getting-started.md) |

---

## Vercel Deployment

The dashboard is deployed via `vercel.json` in the repository root:

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy (from repo root)
vercel --prod
```

The API should be deployed separately to a VPS (DigitalOcean / AWS / OVH) or a Vercel Serverless Function, with the `QAPI_API_URL` environment variable pointing to it.

---

## Configuring the Dashboard API URL

By default the dashboard polls `https://qapi-omega.vercel.app/metrics`. To point the dashboard at a self-hosted API, change the `BASE_API_URL` constant in the inline `<script>` at the bottom of `dashboard/index.html`:

```js
const BASE_API_URL = "https://your-vps.example.com";
```

Then redeploy to Vercel.
