// QAPi – /modules routes
"use strict";

const crypto = require("crypto");
const express = require("express");
const { requireTier } = require("../middleware/auth");
const { listNodes, getNode, findNodeByName, findNodeBySha, upsertNode } = require("../data/moduleStore");
const { parseGhModuleId, parseBlobModuleId, ghRawUrl, blobUrl } = require("@solanar/core-brain/lib/module-resolver");
const { redactToken } = require("@solanar/core-brain/lib/tier-manager");

/**
 * Wraps fetch() with exponential-backoff retry logic.
 * Retries on network errors and non-OK (non-304) responses.
 * Delays: 100 ms, 200 ms, 400 ms (max 3 attempts).
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} [maxRetries=3]
 * @returns {Promise<Response>} Resolves with an ok or 304 response.
 * @throws {Error} After all retries are exhausted.
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status === 304) return response;

      if (attempt < maxRetries) {
        const delayMs = 100 * Math.pow(2, attempt - 1);
        console.log(JSON.stringify({ ts: new Date().toISOString(), event: "stream-retry", attempt, url, delayMs }));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delayMs = 100 * Math.pow(2, attempt - 1);
      console.log(JSON.stringify({ ts: new Date().toISOString(), event: "stream-retry", attempt, url, delayMs, error: err.message }));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Max retries exceeded");
}

const TIER_ORDER = ["starter", "pro", "audited"];

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
 * GET /modules/stream?module=<module-id>
 * Streams raw module source code from the upstream origin.
 *
 * Uses the same parsing logic as the Vercel resolver (apps/core/api/resolve.ts)
 * so behaviour is identical whether running locally or deployed on Vercel.
 *
 * Module ID formats:
 *   gh:OWNER/REPO@<40-hex-sha>:FILEPATH   – public GitHub (any tier)
 *   blob:FILEPATH                          – private VPS (Pro+ only)
 *
 * The audited tier additionally emits a structured audit log entry.
 */
router.get("/stream", async (req, res, next) => {
  const moduleId = (req.query.module || "").trim();
  if (!moduleId) {
    return res.status(400).json({ error: "Query param `module` is required.", code: "STREAM_MISSING_MODULE" });
  }

  const gh = parseGhModuleId(moduleId);
  const bl = parseBlobModuleId(moduleId);

  if (!gh && !bl) {
    return res.status(400).json({
      error: "Invalid module id. Use gh:OWNER/REPO@<40-hex-sha>:FILEPATH or blob:FILEPATH",
      code: "STREAM_INVALID_MODULE_ID",
    });
  }

  // blob: modules require Pro tier or higher
  if (bl && TIER_ORDER.indexOf(req.qapiTier) < TIER_ORDER.indexOf("pro")) {
    return res.status(403).json({
      error: "blob: module IDs require the 'pro' tier or higher.",
      code: "STREAM_TIER_INSUFFICIENT",
      requiredTier: "pro",
      currentTier: req.qapiTier,
    });
  }

  const upstream = gh
    ? ghRawUrl(gh.owner, gh.repo, gh.sha, gh.filePath)
    : blobUrl(bl.path);

  if (!upstream) {
    return res.status(503).json({
      error: "Blob storage is not configured (QAPI_BLOB_BASE_URL is not set).",
      code: "STREAM_BLOB_NOT_CONFIGURED",
    });
  }

  const started = Date.now();

  try {
    const ifNoneMatch = req.headers["if-none-match"];

    // Use retry wrapper to recover from transient upstream failures.
    let upstreamRes;
    try {
      upstreamRes = await fetchWithRetry(upstream, {
        headers: { ...(ifNoneMatch ? { "If-None-Match": ifNoneMatch } : {}) },
      });
    } catch (_fetchErr) {
      return res.status(503).json({
        error: "Module stream upstream unavailable after retries.",
        code: "STREAM_UPSTREAM_UNAVAILABLE",
      });
    }

    const etag = upstreamRes.headers.get("etag") || "";

    if (upstreamRes.status === 304) {
      if (etag) res.setHeader("ETag", etag);
      return res.status(304).end();
    }

    // fetchWithRetry guarantees upstreamRes.ok here.
    if (etag) res.setHeader("ETag", etag);
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Vary", "X-QAPi-Key, Authorization");

    // Audited tier: SHA-256 integrity check + structured audit log.
    // We must buffer the body to compute the hash and log its byte size.
    // For other tiers, pipe directly to avoid buffering large files.
    if (req.qapiTier === "audited") {
      const body = await upstreamRes.text();

      // Integrity check: compare body hash against the registered contentHash.
      const node = gh ? findNodeBySha(gh.sha) : null;
      if (node && node.audit.contentHash) {
        const computedHash = crypto.createHash("sha256").update(body).digest("hex");
        if (computedHash !== node.audit.contentHash) {
          return res.status(403).json({
            error: "Module content failed SHA-256 integrity check",
            code: "STREAM_INTEGRITY_FAILED",
            expected: node.audit.contentHash,
            computed: computedHash,
          });
        }
      }

      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        event: "stream-audit",
        tier: req.qapiTier,
        token: redactToken(req.qapiRawKey || ""),
        module: moduleId,
        upstream,
        status: 200,
        bytes: body.length,
        latencyMs: Date.now() - started,
      }));
      res.send(body);
    } else {
      const { Readable } = require("node:stream");
      Readable.fromWeb(upstreamRes.body).pipe(res);
    }
  } catch (err) {
    next(err);
  }
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
