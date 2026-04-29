// QAPi – /modules routes
"use strict";

const crypto = require("crypto");
const express = require("express");
const { requireTier } = require("../middleware/auth");
const { listNodes, getNode, findNodeByName, findNodeBySha, upsertNode } = require("../data/moduleStore");
const { parseGhModuleId, parseBlobModuleId, ghRawUrl, blobUrl } = require("@solanar/core-brain/lib/module-resolver");
const { redactToken } = require("@solanar/core-brain/lib/tier-manager");

/**
 * Returns true for HTTP statuses that are typically transient and safe to retry.
 * 4xx errors (except 429) are deterministic client/config errors and must not be retried.
 *
 * @param {number} status
 * @returns {boolean}
 */
function isRetryableStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Wraps fetch() with exponential-backoff retry logic.
 * Retries on network errors and retryable upstream responses (429/502/503/504).
 * Non-retryable non-OK responses are returned immediately so the caller can
 * forward the original upstream status rather than masking it as a 503.
 * Delays: 100 ms, 200 ms, 400 ms (max 3 attempts).
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} [maxRetries=3]
 * @returns {Promise<Response>} Resolves with the upstream response (ok, 304, or non-retryable error).
 * @throws {Error} After all retries are exhausted due to network errors or retryable statuses.
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status === 304) return response;
      // Non-retryable status: return immediately so the caller can handle it.
      if (!isRetryableStatus(response.status)) return response;
      // Last attempt: return the retryable response as-is.
      if (attempt === maxRetries) return response;

      // Consume the body before backing off so the connection can be reused.
      await response.body?.cancel();
      const delayMs = 100 * Math.pow(2, attempt - 1);
      console.log(JSON.stringify({ ts: new Date().toISOString(), event: "stream-retry", attempt, url, delayMs, status: response.status }));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
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

    // fetchWithRetry returns non-retryable non-OK responses directly so the
    // original upstream status is preserved rather than being masked as a 503.
    if (!upstreamRes.ok) {
      return res.status(502).json({
        error: `Upstream error (${upstreamRes.status})`,
        code: "STREAM_UPSTREAM_ERROR",
      });
    }

    if (etag) res.setHeader("ETag", etag);
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Vary", "X-QAPi-Key, Authorization");

    // Audited tier: SHA-256 integrity check + structured audit log.
    // Buffer the raw bytes so we can (a) hash them accurately and (b) know
    // the exact byte count for the audit log.
    // A size cap avoids unbounded memory usage for unexpectedly large payloads.
    if (req.qapiTier === "audited") {
      const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB
      const buffer = Buffer.from(await upstreamRes.arrayBuffer());

      if (buffer.byteLength > MAX_BUFFER_BYTES) {
        return res.status(413).json({
          error: `Module content exceeds the 10 MB buffering limit for integrity verification.`,
          code: "STREAM_CONTENT_TOO_LARGE",
        });
      }

      // Integrity check: compare raw-byte hash against the registered contentHash.
      const node = gh ? findNodeBySha(gh.sha) : null;
      if (node && node.audit?.contentHash) {
        const computedHash = crypto.createHash("sha256").update(buffer).digest("hex");
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
        bytes: buffer.byteLength,
        latencyMs: Date.now() - started,
      }));
      res.send(buffer);
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
