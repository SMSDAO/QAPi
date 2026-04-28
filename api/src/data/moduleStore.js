// QAPi – in-memory module-node store (swap for a DB in production)
"use strict";

const { randomUUID: uuidv4 } = require("crypto");

/**
 * Module nodes seeded at startup.
 * Each entry conforms to module-node.schema.json.
 */
const _nodes = new Map();

function _make(overrides) {
  const now = new Date().toISOString();
  const base = {
    id: uuidv4(),
    name: "unknown",
    version: "0.0.0",
    description: "",
    source: { type: "github", url: "https://github.com/example/repo.git", branch: "main", entrypoint: "index.js", privateVps: false },
    tier: "starter",
    status: "active",
    audit: {
      score: 100,
      passed: true,
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 },
      cve: [],
      lastScannedAt: now,
      scanEngine: "qapi-audit-v1",
      zeroDay: false,
    },
    cache: { enabled: true, ttlSeconds: 3600, dedicatedCache: false, hitCount: 0, missCount: 0, lastPurgedAt: null },
    registry: { npm: null, github: null, license: "MIT", keywords: [], homepage: null },
    dependencies: {},
    metrics: {
      callsTotal: 0, callsLastMin: 0, avgLatencyMs: 0, p99LatencyMs: 0, errorRate: 0,
      bandwidth: { inboundBytes: 0, outboundBytes: 0 },
    },
    timestamps: { createdAt: now, updatedAt: now, deprecatedAt: null, lastResolvedAt: null },
    tags: [],
    metadata: {},
  };
  return Object.assign({}, base, overrides);
}

// Seed nodes
// Note: source.sha is a pinned commit SHA used by GET /v1/modules/:sha.
// These are demo values; swap for real commit SHAs in production.
[
  _make({ name: "express", version: "4.18.2", description: "Fast web framework for Node.js", tier: "starter",
    source: { type: "github", url: "https://github.com/expressjs/express.git", branch: "master", entrypoint: "index.js", privateVps: false, region: "us-east-1", sha: "c0e7fa4de578f58adb6e8e4b2547a80dd42a2524" },
    registry: { npm: "express", github: "expressjs/express", license: "MIT", keywords: ["web","framework","http"], homepage: "https://expressjs.com" },
    audit: { score: 98, passed: true, vulnerabilities: { critical:0, high:0, moderate:0, low:1, info:2 }, cve: [], lastScannedAt: new Date().toISOString(), scanEngine:"qapi-audit-v1", zeroDay:false },
    metrics: { callsTotal: 5_000_000, callsLastMin: 0, avgLatencyMs: 4.2, p99LatencyMs: 12, errorRate: 0.001, bandwidth: { inboundBytes: 0, outboundBytes: 0 } },
  }),
  _make({ name: "lodash", version: "4.17.21", description: "A modern JavaScript utility library", tier: "starter",
    source: { type: "github", url: "https://github.com/lodash/lodash.git", branch: "main", entrypoint: "lodash.js", privateVps: false, region: "us-west-2", sha: "b45f7de48f2093a35a2c4e5f17a08ef4c0db3c29" },
    registry: { npm: "lodash", github: "lodash/lodash", license: "MIT", keywords: ["utility","functional"], homepage: "https://lodash.com" },
    audit: { score: 95, passed: true, vulnerabilities: { critical:0, high:0, moderate:1, low:2, info:0 }, cve: [], lastScannedAt: new Date().toISOString(), scanEngine:"qapi-audit-v1", zeroDay:false },
    metrics: { callsTotal: 3_200_000, callsLastMin: 0, avgLatencyMs: 3.1, p99LatencyMs: 9, errorRate: 0, bandwidth: { inboundBytes: 0, outboundBytes: 0 } },
  }),
  _make({ name: "@solanar/vps-module-alpha", version: "1.0.0", description: "Private VPS-hosted module (Pro tier)", tier: "pro",
    source: { type: "vps", url: "https://vps.qapi-omega.vercel.app/modules/alpha.git", branch: "main", entrypoint: "index.js", privateVps: true, region: "eu-west-1", sha: "3f8d2e7a9c14b05feda6c8b97a12d5e3f4c81029" },
    registry: { npm: null, github: null, license: "UNLICENSED", keywords: ["private","vps"], homepage: null },
    audit: { score: 100, passed: true, vulnerabilities: { critical:0, high:0, moderate:0, low:0, info:0 }, cve: [], lastScannedAt: new Date().toISOString(), scanEngine:"qapi-audit-v1", zeroDay:false },
    cache: { enabled: true, ttlSeconds: 3600, dedicatedCache: true, hitCount: 0, missCount: 0, lastPurgedAt: null },
  }),
].forEach((n) => _nodes.set(n.id, n));

/** @returns {object[]} */
function listNodes(tier) {
  const all = Array.from(_nodes.values());
  if (!tier) return all;
  const order = ["starter", "pro", "audited"];
  const idx = order.indexOf(tier);
  return all.filter((n) => order.indexOf(n.tier) <= idx);
}

/** @returns {object|undefined} */
function getNode(id) {
  return _nodes.get(id);
}

/** @returns {object|undefined} */
function findNodeByName(name, version) {
  for (const node of _nodes.values()) {
    if (node.name === name && (!version || node.version === version)) return node;
  }
}

/**
 * Look up a module node by its pinned commit SHA (source.sha).
 * @param {string} sha  40-character hex commit SHA
 * @returns {object|undefined}
 */
function findNodeBySha(sha) {
  for (const node of _nodes.values()) {
    if (node.source?.sha === sha) return node;
  }
}

/** @returns {object} */
function upsertNode(data) {
  const existing = data.id ? _nodes.get(data.id) : null;
  const node = Object.assign({}, existing || _make({}), data, {
    timestamps: Object.assign({}, existing?.timestamps, { updatedAt: new Date().toISOString(), createdAt: existing?.timestamps?.createdAt || new Date().toISOString() }),
  });
  _nodes.set(node.id, node);
  return node;
}

module.exports = { listNodes, getNode, findNodeByName, findNodeBySha, upsertNode };
