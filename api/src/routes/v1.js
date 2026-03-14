// QAPi – /v1 versioned routes
//
// Wires the apps/core resolver (module-resolver.ts) and tier-manager
// directly into the API so the Express server and the Vercel edge handler
// share identical parsing and tier semantics.
"use strict";

const express = require("express");
const { TIERS, findKey } = require("../data/keyStore");
const { listNodes, findNodeBySha } = require("../data/moduleStore");
const { apiKeyMiddleware } = require("../middleware/auth");
const { rateLimitMiddleware } = require("../middleware/rateLimit");
const { parseGhModuleId, ghRawUrl } = require("@solanar/core-brain/lib/module-resolver");
const { parseBearerToken } = require("@solanar/core-brain/lib/tier-manager");

const router = express.Router();

const SHA40_RE = /^[0-9a-f]{40}$/i;
const TIER_ORDER = ["starter", "pro", "audited"];

// ── /v1/tiers ─────────────────────────────────────────────────────────────────

/**
 * GET /v1/tiers
 * Lists all subscription tiers with their live limits (driven by TIERS from
 * keyStore, which is the single source of truth wired to the tier-manager).
 *
 * Public – no API key required.
 * Optional header X-QAPi-Key / Authorization: Bearer adds `callerTier` to the
 * response so the dashboard can highlight the caller's current plan.
 */
router.get("/tiers", (req, res) => {
  // Detect caller's tier from an optional auth header by validating the key
  // against the key store — prevents spoofing via crafted key prefixes.
  const rawKey = req.headers["x-qapi-key"] ||
    parseBearerToken(req.headers["authorization"] ?? null);

  const keyRecord = rawKey ? findKey(rawKey) : null;
  const callerTier = keyRecord ? keyRecord.tier : null;

  res.json({
    tiers: Object.entries(TIERS).map(([id, cfg]) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      price: cfg.price,
      callsPerMin: cfg.callsPerMin === Infinity ? null : cfg.callsPerMin,
      features: cfg.features,
    })),
    ...(callerTier ? { callerTier } : {}),
  });
});

/**
 * GET /v1/tiers/:tierId
 * Returns the live config for a single tier.
 * Public – no API key required.
 */
router.get("/tiers/:tierId", (req, res) => {
  const { tierId } = req.params;
  const cfg = TIERS[tierId];
  if (!cfg) {
    return res.status(404).json({
      error: `Unknown tier '${tierId}'. Valid: ${Object.keys(TIERS).join(", ")}.`,
      code: "TIER_NOT_FOUND",
    });
  }

  res.json({
    id: tierId,
    name: tierId.charAt(0).toUpperCase() + tierId.slice(1),
    price: cfg.price,
    callsPerMin: cfg.callsPerMin === Infinity ? null : cfg.callsPerMin,
    features: cfg.features,
  });
});

// ── /v1/modules ───────────────────────────────────────────────────────────────

/**
 * GET /v1/modules
 * Lists module nodes accessible to the caller's tier.
 * Auth required.
 */
router.get("/modules", apiKeyMiddleware, rateLimitMiddleware, (req, res) => {
  const { name } = req.query;
  let nodes = listNodes(req.qapiTier);
  if (name) nodes = nodes.filter((n) => n.name.includes(name));
  res.json({ count: nodes.length, tier: req.qapiTier, modules: nodes });
});

/**
 * GET /v1/modules/:sha
 * Returns module metadata for a specific pinned commit SHA.
 *
 * The `:sha` must be a full 40-character hex commit SHA.
 *
 * Resolution order:
 *   1. Module store — if any stored module has source.sha === :sha, return it.
 *   2. GitHub synthesis — if ?owner=&repo=&path= are provided, build the
 *      metadata from the shared parseGhModuleId / ghRawUrl helpers (same logic
 *      as the Vercel edge resolver and /modules/stream).
 *
 * Auth required.
 */
router.get("/modules/:sha", apiKeyMiddleware, rateLimitMiddleware, (req, res) => {
  const { sha } = req.params;

  if (!SHA40_RE.test(sha)) {
    return res.status(400).json({
      error: "Invalid SHA: must be a 40-character hex string.",
      code: "V1_INVALID_SHA",
    });
  }

  // ── 1. Module store lookup ──────────────────────────────────────────────
  const node = findNodeBySha(sha);
  if (node) {
    if (TIER_ORDER.indexOf(node.tier) > TIER_ORDER.indexOf(req.qapiTier)) {
      return res.status(403).json({
        error: `Module '${node.name}' requires the '${node.tier}' tier or higher.`,
        code: "V1_TIER_INSUFFICIENT",
        requiredTier: node.tier,
        currentTier: req.qapiTier,
      });
    }
    return res.json({ resolved: true, source: "store", module: node });
  }

  // ── 2. GitHub synthesis via shared module-resolver ──────────────────────
  const { owner, repo, path: filePath } = req.query;
  if (!owner || !repo || !filePath) {
    return res.status(404).json({
      error: "No stored module found for this SHA. Provide ?owner=&repo=&path= to synthesize metadata from GitHub.",
      code: "V1_MODULE_NOT_FOUND",
    });
  }

  // Build and validate the full gh: module ID using the shared parser
  const moduleId = `gh:${owner}/${repo}@${sha}:${filePath}`;
  const ghRef = parseGhModuleId(moduleId);
  if (!ghRef) {
    return res.status(400).json({
      error: "Invalid module reference (owner, repo, or path contains unsafe characters).",
      code: "V1_INVALID_MODULE_REF",
    });
  }

  const upstream = ghRawUrl(ghRef.owner, ghRef.repo, ghRef.sha, ghRef.filePath);

  res.json({
    resolved: true,
    source: "github",
    module: {
      sha: ghRef.sha,
      owner: ghRef.owner,
      repo: ghRef.repo,
      filePath: ghRef.filePath,
      upstream,
      streamUrl: `/modules/stream?module=${encodeURIComponent(moduleId)}`,
      tier: "starter",
    },
  });
});

module.exports = router;
