// QAPi – per-tier rate-limit middleware
"use strict";

const rateLimit = require("express-rate-limit");

/** Build a rate-limiter for a given window / max pair. */
function buildLimiter(windowMs, max) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.qapiKey?.id || req.ip,
    handler: (req, res) => {
      res.status(429).json({
        error: `Rate limit exceeded. Your tier allows up to ${req.qapiTierConfig?.callsPerMin ?? max} calls/min.`,
        code: "RATE_LIMIT_EXCEEDED",
        tier: req.qapiTier,
      });
    },
  });
}

// Pre-built limiters for each tier (60 s window)
const LIMITERS = {
  starter: buildLimiter(60_000, 100),
  pro:     buildLimiter(60_000, 1000),
  audited: buildLimiter(60_000, 1_000_000), // effectively unlimited
};

/**
 * Dynamic rate-limit middleware – applies the correct limiter
 * based on `req.qapiTier` set by the auth middleware.
 */
function rateLimitMiddleware(req, res, next) {
  const limiter = LIMITERS[req.qapiTier] ?? LIMITERS.starter;
  return limiter(req, res, next);
}

module.exports = { rateLimitMiddleware };
