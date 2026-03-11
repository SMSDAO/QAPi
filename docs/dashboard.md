# Dashboard Guide

The QAPi Dashboard is an operator-grade HTML5 + Tailwind CSS UI hosted on Vercel at [qapi.dev](https://qapi.dev).

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

The stats counters at the top of the dashboard are fed by polling `GET /metrics`:

| Stat | Source |
|---|---|
| Resolves / min | `resolvesLastMin` from `/metrics` |
| Module Nodes | `moduleCount` from `/metrics` |
| Avg Audit Score | `avgAuditScore` from `/metrics` |
| Avg Latency | `modules[].metrics.avgLatencyMs` |

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

## Configuring the Dashboard URL

By default the dashboard points to `https://api.qapi.dev`. To use a self-hosted API, set the `QAPI_API_URL` meta tag in `dashboard/index.html`:

```html
<meta name="qapi-api-url" content="https://your-vps.example.com" />
```

Or update the `BASE_API_URL` constant in the inline dashboard JavaScript.
