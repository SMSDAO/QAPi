/**
 * @qapi/sdk – Virtual Module Resolver
 *
 * Drop-in replacement for `require()` / `import` that resolves modules
 * through the QAPi Core Service instead of local node_modules.
 *
 * Usage:
 *   const { QAPiClient } = require("@qapi/sdk");
 *   const client = new QAPiClient({ apiKey: "qapi-starter-...", baseUrl: "https://qapi-omega.vercel.app" });
 *   const info = await client.resolve("express");
 */
"use strict";

const https = require("node:https");
const http = require("node:http");

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Minimal fetch-like helper using Node.js built-in http/https.
 * @param {string} url
 * @param {{ method?: string, headers?: object, body?: object }} opts
 * @returns {Promise<{ status: number, body: object }>}
 */
function _request(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const payload = opts.body ? JSON.stringify(opts.body) : undefined;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        ...opts.headers,
      },
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── QAPiClient ───────────────────────────────────────────────────────────────

class QAPiClient {
  /**
   * @param {{ apiKey: string, baseUrl?: string, timeout?: number }} options
   */
  constructor({ apiKey, baseUrl = "https://qapi-omega.vercel.app", timeout = 10_000 } = {}) {
    if (!apiKey) throw new Error("[QAPi SDK] apiKey is required.");
    this._apiKey = apiKey;
    this._baseUrl = baseUrl.replace(/\/$/, "");
    this._timeout = timeout;
    this._cache = new Map();
  }

  /** @private */
  _headers() {
    return { "X-QAPi-Key": this._apiKey };
  }

  /** @private */
  _url(path) {
    return `${this._baseUrl}${path}`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Resolve a module – returns the entrypoint URL and audit status.
   * Results are cached in-process by name@version.
   *
   * @param {string} name   Module name (e.g. "express")
   * @param {string} [version]  Optional semver (e.g. "4.18.2")
   * @returns {Promise<{ name, version, entrypoint, sourceType, audit, cachedTtlSeconds }>}
   */
  async resolve(name, version) {
    const cacheKey = version ? `${name}@${version}` : name;

    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    const qs = version ? `?name=${encodeURIComponent(name)}&version=${encodeURIComponent(version)}` : `?name=${encodeURIComponent(name)}`;
    const { status, body } = await _request(this._url(`/modules/resolve${qs}`), {
      headers: this._headers(),
    });

    if (status === 403) throw new QAPiError(body.error, body.code, 403);
    if (status === 404) throw new QAPiError(body.error, "MODULE_NOT_FOUND", 404);
    if (status !== 200) throw new QAPiError(body.error || "Unexpected error", body.code, status);

    this._cache.set(cacheKey, body);
    return body;
  }

  /**
   * List all modules accessible to the configured API key.
   * @param {{ name?: string }} [filter]
   * @returns {Promise<{ count: number, tier: string, modules: object[] }>}
   */
  async list(filter = {}) {
    const qs = filter.name ? `?name=${encodeURIComponent(filter.name)}` : "";
    const { status, body } = await _request(this._url(`/modules${qs}`), {
      headers: this._headers(),
    });
    if (status !== 200) throw new QAPiError(body.error || "Unexpected error", body.code, status);
    return body;
  }

  /**
   * Get metadata for a single module node by its UUID.
   * @param {string} id
   * @returns {Promise<object>}
   */
  async getModule(id) {
    const { status, body } = await _request(this._url(`/modules/${encodeURIComponent(id)}`), {
      headers: this._headers(),
    });
    if (status === 404) throw new QAPiError("Module not found", "MODULE_NOT_FOUND", 404);
    if (status !== 200) throw new QAPiError(body.error || "Unexpected error", body.code, status);
    return body;
  }

  /**
   * Run a real-time security audit scan on a module. Requires Audited tier.
   * @param {string} name
   * @param {string} [version]
   * @returns {Promise<object>}
   */
  async audit(name, version) {
    const qs = version
      ? `?name=${encodeURIComponent(name)}&version=${encodeURIComponent(version)}`
      : `?name=${encodeURIComponent(name)}`;
    const { status, body } = await _request(this._url(`/audit/scan${qs}`), {
      headers: this._headers(),
    });
    if (status === 403) throw new QAPiError(body.error, body.code, 403);
    if (status === 404) throw new QAPiError(body.error, "AUDIT_NOT_FOUND", 404);
    if (status !== 200) throw new QAPiError(body.error || "Unexpected error", body.code, status);
    return body;
  }

  /**
   * Retrieve the full audit report for all accessible modules. Audited tier.
   * @returns {Promise<object>}
   */
  async auditReport() {
    const { status, body } = await _request(this._url("/audit/report"), {
      headers: this._headers(),
    });
    if (status !== 200) throw new QAPiError(body.error || "Unexpected error", body.code, status);
    return body;
  }

  /**
   * Ping the service – useful for health checks and connectivity tests.
   * @returns {Promise<{ status: string, timestamp: string }>}
   */
  async ping() {
    const { status, body } = await _request(this._url("/health"));
    if (status !== 200) throw new QAPiError("Service unreachable", "PING_FAILED", status);
    return body;
  }

  /** Clears the in-process resolve cache. */
  clearCache() {
    this._cache.clear();
  }
}

// ── QAPiError ────────────────────────────────────────────────────────────────

class QAPiError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {number} statusCode
   */
  constructor(message, code, statusCode) {
    super(message);
    this.name = "QAPiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ── Static helper – Sign-up ───────────────────────────────────────────────────

/**
 * Create a new API key via the public /auth/signup endpoint.
 * @param {{ email: string, tier?: "starter"|"pro"|"audited", baseUrl?: string }} opts
 * @returns {Promise<{ apiKey, tier, email, tierConfig }>}
 */
async function signup({ email, tier = "starter", baseUrl = "https://qapi-omega.vercel.app" } = {}) {
  const { status, body } = await _request(`${baseUrl.replace(/\/$/, "")}/auth/signup`, {
    method: "POST",
    body: { email, tier },
  });
  if (status !== 201) throw new QAPiError(body.error || "Signup failed", body.code, status);
  return body;
}

module.exports = { QAPiClient, QAPiError, signup };
