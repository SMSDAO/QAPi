// QAPi Core Service – main entry point
"use strict";

const express = require("express");
const cors = require("cors");

const { apiKeyMiddleware } = require("./middleware/auth");
const { rateLimitMiddleware } = require("./middleware/rateLimit");
const { requestLogger } = require("./middleware/logger");
const modulesRouter = require("./routes/modules");
const authRouter = require("./routes/auth");
const auditRouter = require("./routes/audit");
const metricsRouter = require("./routes/metrics");
const v1Router = require("./routes/v1");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(requestLogger);

// Health-check (no auth required)
app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "qapi-core", timestamp: new Date().toISOString() })
);

// ── Public auth routes (signup / key generation) ──────────────────────────────
app.use("/auth", authRouter);

// ── Public metrics (no auth – for Vercel dashboard polling) ──────────────────
app.use("/metrics", metricsRouter);

// ── Versioned v1 API (mix of public tier endpoints + protected module endpoints)
app.use("/v1", v1Router);

// ── Protected routes – require a valid API key ────────────────────────────────
app.use("/modules", apiKeyMiddleware, rateLimitMiddleware, modulesRouter);
app.use("/audit",   apiKeyMiddleware, rateLimitMiddleware, auditRouter);

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((_req, res) =>
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" })
);

// ── Error handler ─────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[QAPi]", err.message);
  res.status(err.status || 500).json({ error: err.message || "Internal server error", code: err.code || "INTERNAL_ERROR" });
});

if (require.main === module) {
  app.listen(PORT, () =>
    console.log(`[QAPi] Core Service running on port ${PORT}`)
  );
}

module.exports = app;
