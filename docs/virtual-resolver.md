# Virtual Module Resolver

QAPi's Virtual Module Resolver intercepts Node.js `require()` / `import` calls and redirects lookups for QAPi-managed modules to the Core Service instead of local `node_modules`.

---

## Architecture

```
Developer Code
    │
    └─ require("@qapi/some-module")
          │
          ▼
   ┌─────────────────────────┐
   │  qapi-register.cjs      │  ← CommonJS hook
   │  (or qapi-loader.mjs)   │  ← ESM loader
   └────────────┬────────────┘
                │  GET /modules/resolve?name=@qapi/some-module
                ▼
   ┌────────────────────────────┐
   │  QAPi Core Service (API)   │
   │  ① Auth / Rate Limit       │
   │  ② Module Node Lookup      │
   │  ③ Security Audit (Audited)│
   └────────────┬───────────────┘
                │  Entrypoint URL
                ▼
   ┌─────────────────────────┐
   │  Module Source          │
   │  (GitHub / VPS / npm)   │
   └─────────────────────────┘
```

---

## Bootstrap Scripts

### bootstrap.ps2 (Unix / Linux / macOS)

`bootstrap.ps2` is the POSIX shell Virtual Node Orchestrator. It:

1. Validates Node.js ≥ 18 and npm.
2. Detects the environment (`local-dev`, `ci`, `vercel`, `vps`).
3. Installs `@qapi/sdk` globally or locally.
4. Writes `qapi-loader.mjs` (ESM loader hook) and `qapi-register.cjs` (CJS require hook).
5. Sets `QAPI_KEY`, `QAPI_BASE_URL`, and `QAPI_TIER` in the current shell session.
6. Optionally persists env vars to `~/.bashrc` / `~/.zshrc`.
7. Emits structured JSON logs for every step.

```bash
# Interactive
./bootstrap.ps2

# Non-interactive
./bootstrap.ps2 -k "qapi-starter-YOUR_KEY" -t starter

# Global install + persist
./bootstrap.ps2 -k "qapi-pro-YOUR_KEY" -t pro -g

# Uninstall
./bootstrap.ps2 -r
```

### bootstrap.ps1 (Windows / PowerShell)

`bootstrap.ps1` is the PowerShell equivalent for Windows users. It provides identical functionality.

```powershell
.\bootstrap.ps1 -ApiKey "qapi-starter-YOUR_KEY"
.\bootstrap.ps1 -ApiKey "qapi-pro-YOUR_KEY" -Tier pro -Global
.\bootstrap.ps1 -Uninstall
```

---

## Module Resolution Rules

| Rule | Details |
|---|---|
| Local `node_modules` is **non-authoritative** | For QAPi-managed modules, local installs are bypassed. |
| Module Node metadata is the **single source of truth** | Name, version, entrypoint, and tier are from the Module Node record. |
| Tier policy enforced **before** code delivery | A Starter key cannot stream Pro/Audited modules. |
| Audited tier triggers a **security scan first** | Code is not delivered until the scan passes. |
| Cache-first for resolved modules | Each `QAPiClient` instance keeps an in-process cache. Call `clearCache()` to invalidate. |

---

## Structured Logs

Every resolution event emits a JSON log line on `stderr`:

```json
{
  "ts": "2026-03-11T05:00:00.000Z",
  "level": "info",
  "event": "resolution",
  "method": "GET",
  "path": "/modules/resolve",
  "status": 200,
  "latencyMs": 4,
  "tier": "starter",
  "keyId": "a1b2c3d",
  "module": "express",
  "ip": "192.0.2.1"
}
```

These logs are:
- Written to `stdout` by the API (one JSON line per request).
- Written to `stderr` by the loader hooks.
- Collected in a 200-event ring buffer accessible via `GET /metrics/logs`.
- Visualised in the [QAPi Dashboard](https://qapi.dev).

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `QAPI_KEY` | Your QAPi API key | — |
| `QAPI_BASE_URL` | Core Service URL | `https://api.qapi.dev` |
| `QAPI_TIER` | Your subscription tier | `starter` |
| `QAPI_MANAGED_MODULES` | Comma-separated list of extra module names to intercept | — |

---

## Non-Negotiable Constraints

1. **Local `node_modules` must not be treated as authoritative** for QAPi-managed modules.
2. All QAPi-managed imports must be resolvable via Module Node metadata, SDK routing, and tier + security policies.
3. The loader hooks must **never silently fall back** — they warn loudly when the SDK is unavailable.
4. Audited tier calls always trigger a security scan before code is delivered.
