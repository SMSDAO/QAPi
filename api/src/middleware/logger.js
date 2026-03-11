// QAPi – structured request/resolution logger
"use strict";

/**
 * Emits a structured JSON log line for every inbound request.
 *
 * Log shape:
 * {
 *   ts:        ISO-8601 timestamp,
 *   level:     "info" | "warn" | "error",
 *   event:     "request" | "resolution" | "audit",
 *   method:    HTTP method,
 *   path:      request path,
 *   status:    HTTP status code (set after response),
 *   latencyMs: round-trip duration,
 *   tier:      resolved tier (if authenticated),
 *   keyId:     redacted key ID (first 8 chars),
 *   module:    module name being resolved (if applicable),
 *   ip:        client IP,
 * }
 *
 * For dashboard visibility every log is also pushed to an in-process
 * ring buffer (last 200 events) so that GET /metrics/logs can stream it.
 */

const RING_SIZE = 200;
const _ring = [];

/** @returns {object[]} Copy of the current log ring buffer (newest last) */
function getLogs() {
  return _ring.slice();
}

/** @param {object} entry */
function _push(entry) {
  _ring.push(entry);
  if (_ring.length > RING_SIZE) _ring.shift();
}

/**
 * Express middleware: attaches start time and writes a structured log line
 * after the response is finished.
 */
function requestLogger(req, res, next) {
  const startMs = Date.now();

  res.on("finish", () => {
    const latencyMs = Date.now() - startMs;
    const entry = {
      ts: new Date().toISOString(),
      level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      event: _resolveEvent(req.path),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      latencyMs,
      tier: req.qapiTier || null,
      keyId: req.qapiKey ? req.qapiKey.id.slice(0, 8) : null,
      module: req.query?.name || req.params?.id || null,
      ip: req.ip || req.socket?.remoteAddress || null,
    };
    _push(entry);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  });

  next();
}

/** @param {string} path */
function _resolveEvent(path) {
  if (path.includes("/resolve")) return "resolution";
  if (path.includes("/audit"))   return "audit";
  return "request";
}

module.exports = { requestLogger, getLogs };
