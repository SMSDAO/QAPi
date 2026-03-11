// QAPi – API Key authentication middleware
"use strict";

const { findKey, TIERS } = require("../data/keyStore");

/**
 * Reads the API key from the `X-QAPi-Key` header (or `Authorization: Bearer <key>`),
 * validates it against the key store, and attaches `req.qapiKey` (tier, id, email)
 * to the request before forwarding.
 */
function apiKeyMiddleware(req, res, next) {
  const raw =
    req.headers["x-qapi-key"] ||
    (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim();

  if (!raw) {
    return res.status(401).json({ error: "Missing API key. Supply X-QAPi-Key header.", code: "AUTH_MISSING_KEY" });
  }

  const record = findKey(raw);
  if (!record) {
    return res.status(403).json({ error: "Invalid or unknown API key.", code: "AUTH_INVALID_KEY" });
  }

  req.qapiKey = record;
  req.qapiTier = record.tier;
  req.qapiTierConfig = TIERS[record.tier];
  next();
}

/**
 * Factory: returns middleware that allows only the specified minimum tier.
 * Tier order: starter < pro < audited
 * @param {"starter"|"pro"|"audited"} minTier
 */
function requireTier(minTier) {
  const order = ["starter", "pro", "audited"];
  return function tierGuard(req, res, next) {
    const userIdx = order.indexOf(req.qapiTier);
    const minIdx  = order.indexOf(minTier);
    if (userIdx < minIdx) {
      return res.status(403).json({
        error: `This endpoint requires the '${minTier}' tier or higher. Your current tier: '${req.qapiTier}'.`,
        code: "AUTH_TIER_INSUFFICIENT",
        requiredTier: minTier,
        currentTier: req.qapiTier,
      });
    }
    next();
  };
}

module.exports = { apiKeyMiddleware, requireTier };
