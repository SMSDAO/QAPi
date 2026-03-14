// QAPi – API Key authentication middleware
"use strict";

const { findKey, TIERS } = require("../data/keyStore");
const { parseBearerToken, tierFromToken } = require("@solanar/core-brain/lib/tier-manager");

/**
 * Reads the API key from the `X-QAPi-Key` header (or `Authorization: Bearer <key>`),
 * validates it against the key store, and attaches `req.qapiKey` (tier, id, email)
 * to the request before forwarding.
 *
 * Token extraction uses the same parseBearerToken logic as the Vercel resolver
 * (apps/core/lib/tier-manager) so both runtimes behave identically.
 */
function apiKeyMiddleware(req, res, next) {
  const raw =
    req.headers["x-qapi-key"] ||
    parseBearerToken(req.headers["authorization"] ?? null);

  if (!raw) {
    return res.status(401).json({ error: "Missing API key. Supply X-QAPi-Key header.", code: "AUTH_MISSING_KEY" });
  }

  const record = findKey(raw);
  if (!record) {
    return res.status(403).json({ error: "Invalid or unknown API key.", code: "AUTH_INVALID_KEY" });
  }

  req.qapiKey = record;
  req.qapiRawKey = raw;   // stored for downstream audit logging (e.g. stream endpoint)
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

/**
 * Exports tierFromToken so routes can verify token-implied tier matches
 * the stored tier (belt-and-suspenders for the stream endpoint).
 */
module.exports = { apiKeyMiddleware, requireTier, tierFromToken };
