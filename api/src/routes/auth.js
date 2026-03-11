// QAPi – /auth routes (public – no API key required)
"use strict";

const express = require("express");
const { createKey, TIERS } = require("../data/keyStore");

const router = express.Router();

/**
 * GET /auth/tiers
 * Returns a description of all available subscription tiers.
 */
router.get("/tiers", (_req, res) => {
  res.json({
    tiers: Object.entries(TIERS).map(([name, cfg]) => ({ name, ...cfg })),
  });
});

/**
 * POST /auth/signup
 * Body: { email: string, tier?: "starter" | "pro" | "audited" }
 * Creates a new API key for the given email + tier.
 */
router.post("/signup", (req, res, next) => {
  try {
    const { email, tier = "starter" } = req.body || {};

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "A valid email address is required.", code: "SIGNUP_INVALID_EMAIL" });
    }

    if (!TIERS[tier]) {
      return res.status(400).json({
        error: `Unknown tier '${tier}'. Valid tiers: ${Object.keys(TIERS).join(", ")}.`,
        code: "SIGNUP_INVALID_TIER",
      });
    }

    const result = createKey(email, tier);
    res.status(201).json({
      message: "API key created successfully.",
      apiKey: result.apiKey,
      tier: result.tier,
      email: result.email,
      createdAt: result.createdAt,
      tierConfig: TIERS[result.tier],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
