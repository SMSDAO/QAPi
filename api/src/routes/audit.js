// QAPi – /audit routes (Audited tier only)
"use strict";

const express = require("express");
const { requireTier } = require("../middleware/auth");
const { getNode, findNodeByName, listNodes } = require("../data/moduleStore");

const router = express.Router();

/**
 * Simulate a real-time security scan on a module node.
 * In production this would call an external CVE database, run SAST tooling, etc.
 */
function runAudit(node) {
  const zeroDay = Math.random() < 0.01; // 1% chance of a synthetic zero-day detection
  const score = zeroDay
    ? Math.floor(Math.random() * 40)
    : Math.max(0, node.audit.score - Math.floor(Math.random() * 3));

  return {
    score,
    passed: score >= 70 && !zeroDay,
    vulnerabilities: node.audit.vulnerabilities,
    cve: node.audit.cve,
    lastScannedAt: new Date().toISOString(),
    scanEngine: "qapi-audit-v1",
    zeroDay,
  };
}

/**
 * GET /audit/scan?name=<name>&version=<ver>
 * Run a real-time security scan on a module. Audited tier required.
 */
router.get("/scan", requireTier("audited"), (req, res) => {
  const { name, version } = req.query;

  if (!name) {
    return res.status(400).json({ error: "Query param `name` is required.", code: "AUDIT_MISSING_NAME" });
  }

  const node = findNodeByName(name, version);
  if (!node) {
    return res.status(404).json({ error: `Module '${name}' not found.`, code: "AUDIT_NOT_FOUND" });
  }

  const auditResult = runAudit(node);

  // Persist the latest audit result back to the node
  Object.assign(node.audit, auditResult);
  if (auditResult.zeroDay) {
    node.status = "quarantined";
  }

  res.json({
    name: node.name,
    version: node.version,
    id: node.id,
    audit: auditResult,
    status: node.status,
  });
});

/**
 * GET /audit/report
 * Returns a summary audit report for all accessible modules.
 * Audited tier required.
 */
router.get("/report", requireTier("audited"), (req, res) => {
  const nodes = listNodes("audited");

  const summary = nodes.reduce(
    (acc, n) => {
      acc.total += 1;
      acc.passed += n.audit.passed ? 1 : 0;
      acc.failed += n.audit.passed ? 0 : 1;
      acc.quarantined += n.status === "quarantined" ? 1 : 0;
      acc.zeroDays += n.audit.zeroDay ? 1 : 0;
      acc.criticalVulns += n.audit.vulnerabilities.critical;
      acc.highVulns += n.audit.vulnerabilities.high;
      return acc;
    },
    { total: 0, passed: 0, failed: 0, quarantined: 0, zeroDays: 0, criticalVulns: 0, highVulns: 0 }
  );

  res.json({
    generatedAt: new Date().toISOString(),
    summary,
    modules: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      version: n.version,
      status: n.status,
      audit: n.audit,
    })),
  });
});

/**
 * GET /audit/:id
 * Returns audit details for a specific module node. Audited tier required.
 */
router.get("/:id", requireTier("audited"), (req, res) => {
  const node = getNode(req.params.id);
  if (!node) {
    return res.status(404).json({ error: "Module node not found.", code: "AUDIT_NODE_NOT_FOUND" });
  }
  res.json({ id: node.id, name: node.name, version: node.version, audit: node.audit, status: node.status });
});

module.exports = router;
