// QAPi – in-memory module-node store (swap for a DB in production)
"use strict";

const { v4: uuidv4 } = require("uuid");

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
[
  _make({ name: "express", version: "4.18.2", description: "Fast web framework for Node.js", tier: "starter",
    source: { type: "github", url: "https://github.com/expressjs/express.git", branch: "master", entrypoint: "index.js", privateVps: false, region: "us-east-1" },
    registry: { npm: "express", github: "expressjs/express", license: "MIT", keywords: ["web","framework","http"], homepage: "https://expressjs.com" },
    audit: { score: 98, passed: true, vulnerabilities: { critical:0, high:0, moderate:0, low:1, info:2 }, cve: [], lastScannedAt: new Date().toISOString(), scanEngine:"qapi-audit-v1", zeroDay:false },
  }),
  _make({ name: "lodash", version: "4.17.21", description: "A modern JavaScript utility library", tier: "starter",
    source: { type: "github", url: "https://github.com/lodash/lodash.git", branch: "main", entrypoint: "lodash.js", privateVps: false, region: "us-west-2" },
    registry: { npm: "lodash", github: "lodash/lodash", license: "MIT", keywords: ["utility","functional"], homepage: "https://lodash.com" },
    audit: { score: 95, passed: true, vulnerabilities: { critical:0, high:0, moderate:1, low:2, info:0 }, cve: [], lastScannedAt: new Date().toISOString(), scanEngine:"qapi-audit-v1", zeroDay:false },
  }),
  _make({ name: "@qapi/vps-module-alpha", version: "1.0.0", description: "Private VPS-hosted module (Pro tier)", tier: "pro",
    source: { type: "vps", url: "https://vps.qapi.dev/modules/alpha.git", branch: "main", entrypoint: "index.js", privateVps: true, region: "eu-west-1" },
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

/** @returns {object} */
function upsertNode(data) {
  const existing = data.id ? _nodes.get(data.id) : null;
  const node = Object.assign({}, existing || _make({}), data, {
    timestamps: Object.assign({}, existing?.timestamps, { updatedAt: new Date().toISOString(), createdAt: existing?.timestamps?.createdAt || new Date().toISOString() }),
  });
  _nodes.set(node.id, node);
  return node;
}

module.exports = { listNodes, getNode, findNodeByName, upsertNode };
