// QAPi – in-memory key store (swap for a real DB in production)
"use strict";

const { v4: uuidv4 } = require("uuid");

/**
 * Tier definitions
 *
 * @type {Record<string, {price: string, callsPerMin: number, features: string[]}>}
 */
const TIERS = {
  starter: {
    price: "Free",
    callsPerMin: 100,
    features: [
      "Access to public GitHub repos",
      "Standard latency",
      "100 calls/min",
    ],
  },
  pro: {
    price: "$4/mo",
    callsPerMin: 1000,
    features: [
      "Access to private VPS modules",
      "Dedicated caching",
      "1 000 calls/min",
    ],
  },
  audited: {
    price: "Custom",
    callsPerMin: Infinity,
    features: [
      "Full security monitoring",
      "Zero-day vulnerability scanning",
      "99.9% SLA",
      "Unlimited calls/min",
    ],
  },
};

// Seeded demo keys so the server works out-of-the-box for development
const _store = new Map([
  ["qapi-starter-demo-key", { id: uuidv4(), tier: "starter", email: "demo@starter.dev", createdAt: new Date().toISOString() }],
  ["qapi-pro-demo-key",     { id: uuidv4(), tier: "pro",     email: "demo@pro.dev",     createdAt: new Date().toISOString() }],
  ["qapi-audited-demo-key", { id: uuidv4(), tier: "audited", email: "demo@audited.dev", createdAt: new Date().toISOString() }],
]);

/**
 * Look up an API key record.
 * @param {string} key
 * @returns {{ id: string, tier: string, email: string, createdAt: string } | undefined}
 */
function findKey(key) {
  return _store.get(key);
}

/**
 * Create and persist a new API key.
 * @param {string} email
 * @param {"starter"|"pro"|"audited"} tier
 * @returns {{ apiKey: string, id: string, tier: string, email: string, createdAt: string }}
 */
function createKey(email, tier = "starter") {
  if (!TIERS[tier]) throw new Error(`Unknown tier: ${tier}`);
  const apiKey = `qapi-${tier}-${uuidv4()}`;
  const record = { id: uuidv4(), tier, email, createdAt: new Date().toISOString() };
  _store.set(apiKey, record);
  return { apiKey, ...record };
}

module.exports = { TIERS, findKey, createKey };
