// QAPi – /modules routes
"use strict";

const express = require("express");
const { requireTier } = require("../middleware/auth");
const { listNodes, getNode, findNodeByName, upsertNode } = require("../data/moduleStore");

const router = express.Router();

/**
 * GET /modules
 * Returns all module nodes accessible to the caller's tier.
 * Query params: ?name=<name> to search by name, ?tier=<tier> to filter
 */
router.get("/", (req, res) => {
  const { name } = req.query;
  let nodes = listNodes(req.qapiTier);

  if (name) {
    nodes = nodes.filter((n) => n.name.includes(name));
  }

  res.json({ count: nodes.length, tier: req.qapiTier, modules: nodes });
});

/**
 * GET /modules/resolve?name=<name>&version=<version>
 * Virtual resolve: finds the best matching module node and returns the
 * entrypoint URL so the SDK can stream the code.
 */
router.get("/resolve", (req, res) => {
  const { name, version } = req.query;

  if (!name) {
    return res.status(400).json({ error: "Query param `name` is required.", code: "RESOLVE_MISSING_NAME" });
  }

  const node = findNodeByName(name, version);
  if (!node) {
    return res.status(404).json({ error: `Module '${name}${version ? "@" + version : ""}' not found.`, code: "RESOLVE_NOT_FOUND" });
  }

  // Tier access check
  const order = ["starter", "pro", "audited"];
  if (order.indexOf(node.tier) > order.indexOf(req.qapiTier)) {
    return res.status(403).json({
      error: `Module '${node.name}' requires the '${node.tier}' tier.`,
      code: "RESOLVE_TIER_INSUFFICIENT",
      requiredTier: node.tier,
      currentTier: req.qapiTier,
    });
  }

  // Update metrics
  node.metrics.callsTotal += 1;
  node.metrics.callsLastMin += 1;
  node.timestamps.lastResolvedAt = new Date().toISOString();
  node.cache.hitCount += 1;

  res.json({
    resolved: true,
    name: node.name,
    version: node.version,
    entrypoint: `${node.source.url}#${node.source.branch}:${node.source.entrypoint}`,
    sourceType: node.source.type,
    audit: { score: node.audit.score, passed: node.audit.passed, zeroDay: node.audit.zeroDay },
    cachedTtlSeconds: node.cache.ttlSeconds,
  });
});

/**
 * GET /modules/:id
 * Returns full metadata for a specific module node by its UUID.
 */
router.get("/:id", (req, res) => {
  const node = getNode(req.params.id);
  if (!node) {
    return res.status(404).json({ error: "Module node not found.", code: "MODULE_NOT_FOUND" });
  }
  res.json(node);
});

/**
 * POST /modules  (Pro+ only)
 * Registers a new module node. Body must match module-node.schema.json.
 */
router.post("/", requireTier("pro"), (req, res, next) => {
  try {
    const { name, version, source } = req.body || {};
    if (!name || !version || !source?.url) {
      return res.status(400).json({ error: "Fields `name`, `version`, and `source.url` are required.", code: "MODULE_INVALID_BODY" });
    }
    const node = upsertNode(req.body);
    res.status(201).json(node);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
