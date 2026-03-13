// apps/core – subscription-tiers unit tests (Node.js built-in test runner)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SubscriptionTier,
  SUBSCRIPTION_FEATURES,
  tierRank,
  tierMeetsRequirement,
  tierHasFeature,
  assertTierFeature,
  parseTier,
  TierFeatureError,
  TierRateLimitError,
} from "../lib/subscription-tiers.ts";

// ── SUBSCRIPTION_FEATURES completeness ───────────────────────────────────────

describe("SUBSCRIPTION_FEATURES", () => {
  test("has entries for all three tiers", () => {
    assert.ok(SUBSCRIPTION_FEATURES[SubscriptionTier.Starter]);
    assert.ok(SUBSCRIPTION_FEATURES[SubscriptionTier.Pro]);
    assert.ok(SUBSCRIPTION_FEATURES[SubscriptionTier.Audited]);
  });

  test("Starter has correct callsPerMinute", () => {
    assert.equal(SUBSCRIPTION_FEATURES[SubscriptionTier.Starter].callsPerMinute, 100);
  });

  test("Pro has correct callsPerMinute", () => {
    assert.equal(SUBSCRIPTION_FEATURES[SubscriptionTier.Pro].callsPerMinute, 1000);
  });

  test("Audited has null callsPerMinute (unlimited)", () => {
    assert.equal(SUBSCRIPTION_FEATURES[SubscriptionTier.Audited].callsPerMinute, null);
  });

  test("Starter cannot access privateVpsModules", () => {
    assert.equal(SUBSCRIPTION_FEATURES[SubscriptionTier.Starter].privateVpsModules, false);
  });

  test("Pro can access privateVpsModules", () => {
    assert.equal(SUBSCRIPTION_FEATURES[SubscriptionTier.Pro].privateVpsModules, true);
  });

  test("Audited has zeroDayScanning enabled", () => {
    assert.equal(SUBSCRIPTION_FEATURES[SubscriptionTier.Audited].zeroDayScanning, true);
  });

  test("Starter maxParallelBuilds is 1", () => {
    assert.equal(SUBSCRIPTION_FEATURES[SubscriptionTier.Starter].maxParallelBuilds, 1);
  });

  test("Pro maxParallelBuilds is 5", () => {
    assert.equal(SUBSCRIPTION_FEATURES[SubscriptionTier.Pro].maxParallelBuilds, 5);
  });

  test("Audited maxParallelBuilds is null (unlimited)", () => {
    assert.equal(SUBSCRIPTION_FEATURES[SubscriptionTier.Audited].maxParallelBuilds, null);
  });

  test("each tier has at least one featureBullet", () => {
    for (const tier of Object.values(SubscriptionTier)) {
      assert.ok(SUBSCRIPTION_FEATURES[tier].featureBullets.length > 0, `${tier} should have feature bullets`);
    }
  });
});

// ── tierRank ──────────────────────────────────────────────────────────────────

describe("tierRank", () => {
  test("Starter has rank 0", () => {
    assert.equal(tierRank(SubscriptionTier.Starter), 0);
  });

  test("Pro has rank 1", () => {
    assert.equal(tierRank(SubscriptionTier.Pro), 1);
  });

  test("Audited has rank 2", () => {
    assert.equal(tierRank(SubscriptionTier.Audited), 2);
  });

  test("Audited rank > Pro rank > Starter rank", () => {
    assert.ok(tierRank(SubscriptionTier.Audited) > tierRank(SubscriptionTier.Pro));
    assert.ok(tierRank(SubscriptionTier.Pro) > tierRank(SubscriptionTier.Starter));
  });
});

// ── tierMeetsRequirement ──────────────────────────────────────────────────────

describe("tierMeetsRequirement", () => {
  test("Starter meets Starter requirement", () => {
    assert.equal(tierMeetsRequirement(SubscriptionTier.Starter, SubscriptionTier.Starter), true);
  });

  test("Starter does NOT meet Pro requirement", () => {
    assert.equal(tierMeetsRequirement(SubscriptionTier.Starter, SubscriptionTier.Pro), false);
  });

  test("Pro meets Starter requirement", () => {
    assert.equal(tierMeetsRequirement(SubscriptionTier.Pro, SubscriptionTier.Starter), true);
  });

  test("Pro meets Pro requirement", () => {
    assert.equal(tierMeetsRequirement(SubscriptionTier.Pro, SubscriptionTier.Pro), true);
  });

  test("Pro does NOT meet Audited requirement", () => {
    assert.equal(tierMeetsRequirement(SubscriptionTier.Pro, SubscriptionTier.Audited), false);
  });

  test("Audited meets all tiers", () => {
    assert.equal(tierMeetsRequirement(SubscriptionTier.Audited, SubscriptionTier.Starter), true);
    assert.equal(tierMeetsRequirement(SubscriptionTier.Audited, SubscriptionTier.Pro), true);
    assert.equal(tierMeetsRequirement(SubscriptionTier.Audited, SubscriptionTier.Audited), true);
  });
});

// ── tierHasFeature ────────────────────────────────────────────────────────────

describe("tierHasFeature", () => {
  test("Starter has publicGitHubRepos", () => {
    assert.equal(tierHasFeature(SubscriptionTier.Starter, "publicGitHubRepos"), true);
  });

  test("Starter does NOT have dedicatedCache", () => {
    assert.equal(tierHasFeature(SubscriptionTier.Starter, "dedicatedCache"), false);
  });

  test("Pro has dedicatedCache", () => {
    assert.equal(tierHasFeature(SubscriptionTier.Pro, "dedicatedCache"), true);
  });

  test("Audited has securityAuditReports", () => {
    assert.equal(tierHasFeature(SubscriptionTier.Audited, "securityAuditReports"), true);
  });

  test("Pro does NOT have zeroDayScanning", () => {
    assert.equal(tierHasFeature(SubscriptionTier.Pro, "zeroDayScanning"), false);
  });
});

// ── assertTierFeature ─────────────────────────────────────────────────────────

describe("assertTierFeature", () => {
  test("does not throw when feature is available", () => {
    assert.doesNotThrow(() => assertTierFeature(SubscriptionTier.Pro, "dedicatedCache"));
  });

  test("throws TierFeatureError when feature is unavailable", () => {
    assert.throws(
      () => assertTierFeature(SubscriptionTier.Starter, "claudeTimeline"),
      TierFeatureError
    );
  });

  test("TierFeatureError has correct tier and feature", () => {
    try {
      assertTierFeature(SubscriptionTier.Starter, "zeroDayScanning");
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err instanceof TierFeatureError);
      assert.equal(err.tier, SubscriptionTier.Starter);
      assert.equal(err.feature, "zeroDayScanning");
      assert.equal(err.code, "TIER_FEATURE_DENIED");
    }
  });

  test("TierFeatureError message mentions upgrade path", () => {
    try {
      assertTierFeature(SubscriptionTier.Starter, "claudeTimeline");
    } catch (err) {
      assert.ok(err instanceof TierFeatureError);
      assert.ok(err.message.includes("Pro"), `expected 'Pro' in: ${err.message}`);
    }
  });
});

// ── TierRateLimitError ────────────────────────────────────────────────────────

describe("TierRateLimitError", () => {
  test("has correct code", () => {
    const err = new TierRateLimitError(SubscriptionTier.Starter);
    assert.equal(err.code, "TIER_RATE_LIMIT_EXCEEDED");
  });

  test("has correct tier", () => {
    const err = new TierRateLimitError(SubscriptionTier.Pro);
    assert.equal(err.tier, SubscriptionTier.Pro);
  });

  test("includes rate limit in message", () => {
    const err = new TierRateLimitError(SubscriptionTier.Starter);
    assert.ok(err.message.includes("100"), `expected limit in: ${err.message}`);
  });
});

// ── parseTier ─────────────────────────────────────────────────────────────────

describe("parseTier", () => {
  test("parses 'starter'", () => {
    assert.equal(parseTier("starter"), SubscriptionTier.Starter);
  });

  test("parses 'pro'", () => {
    assert.equal(parseTier("pro"), SubscriptionTier.Pro);
  });

  test("parses 'audited'", () => {
    assert.equal(parseTier("audited"), SubscriptionTier.Audited);
  });

  test("parses uppercase 'STARTER'", () => {
    assert.equal(parseTier("STARTER"), SubscriptionTier.Starter);
  });

  test("returns null for unknown tier", () => {
    assert.equal(parseTier("enterprise"), null);
  });

  test("returns null for non-string input", () => {
    assert.equal(parseTier(42), null);
    assert.equal(parseTier(null), null);
    assert.equal(parseTier(undefined), null);
  });
});
