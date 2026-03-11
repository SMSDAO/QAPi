// QAPi – /metrics routes (public, no auth required)
"use strict";

const express = require("express");
const { getLogs } = require("../middleware/logger");
const { listNodes } = require("../data/moduleStore");
const { TIERS } = require("../data/keyStore");

const router = express.Router();

/**
 * GET /metrics
 * Returns a live snapshot of operational metrics for the dashboard.
 * This endpoint is intentionally public so the Vercel dashboard can
 * poll it without an API key.
 */
router.get("/", (_req, res) => {
  const nodes = listNodes("audited"); // all nodes
  const logs  = getLogs();

  // Last-60-seconds resolution events
  const cutoff = Date.now() - 60_000;
  const recent = logs.filter(
    (l) => l.event === "resolution" && new Date(l.ts).getTime() >= cutoff
  );

  // Per-tier call counts from the ring buffer
  const tierCounts = { starter: 0, pro: 0, audited: 0 };
  for (const l of logs) {
    if (l.tier && tierCounts[l.tier] !== undefined) tierCounts[l.tier] += 1;
  }

  // Module health summary
  const moduleSummary = nodes.map((n) => ({
    id:      n.id,
    name:    n.name,
    version: n.version,
    status:  n.status,
    tier:    n.tier,
    audit: {
      score:      n.audit.score,
      passed:     n.audit.passed,
      zeroDay:    n.audit.zeroDay,
      lastScannedAt: n.audit.lastScannedAt,
      vulnerabilities: n.audit.vulnerabilities,
    },
    metrics: {
      callsTotal:   n.metrics.callsTotal,
      callsLastMin: n.metrics.callsLastMin,
      avgLatencyMs: n.metrics.avgLatencyMs,
    },
  }));

  // Average audit score across all active nodes
  const activeNodes  = nodes.filter((n) => n.status === "active");
  const avgAuditScore =
    activeNodes.length > 0
      ? Math.round(activeNodes.reduce((s, n) => s + n.audit.score, 0) / activeNodes.length)
      : 0;

  res.json({
    generatedAt: new Date().toISOString(),
    service: { status: "ok", uptime: process.uptime() },
    tiers: Object.entries(TIERS).map(([name, cfg]) => ({
      name,
      callsPerMin: cfg.callsPerMin === Infinity ? null : cfg.callsPerMin,
      price: cfg.price,
    })),
    resolvesLastMin: recent.length,
    tierCallCounts: tierCounts,
    moduleCount: nodes.length,
    avgAuditScore,
    modules: moduleSummary,
  });
});

/**
 * GET /metrics/logs
 * Returns the last 200 structured log entries from the ring buffer.
 * Used by the dashboard for the live call-trace feed.
 */
router.get("/logs", (_req, res) => {
  const logs = getLogs();
  res.json({ count: logs.length, logs });
});

module.exports = router;
