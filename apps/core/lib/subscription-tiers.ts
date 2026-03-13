/**
 * apps/core/lib/subscription-tiers.ts
 *
 * Canonical subscription tier definitions and enforcement utilities for QAPi.
 *
 * The `SubscriptionTier` const object and `SUBSCRIPTION_FEATURES` map are the
 * single source of truth for what each plan can and cannot do. Both the Express
 * API and the Vercel edge handler import the compiled output from `dist/`.
 *
 * Note: TypeScript `enum` is intentionally avoided so this file works with
 * Node.js's built-in --experimental-strip-types mode (no transpiler needed).
 */

// ── Tier constants ────────────────────────────────────────────────────────────

/**
 * Subscription tier identifiers.
 * Use the values (e.g. `SubscriptionTier.Pro`) everywhere instead of raw strings.
 */
export const SubscriptionTier = {
  Starter: "starter",
  Pro: "pro",
  Audited: "audited",
} as const;

/** Union type derived from SubscriptionTier values. */
export type SubscriptionTier = (typeof SubscriptionTier)[keyof typeof SubscriptionTier];

// ── Feature map ──────────────────────────────────────────────────────────────

export interface TierFeatures {
  /** Human-readable plan name. */
  displayName: string;
  /** Price string shown in the UI, e.g. "Free" or "$4/mo". */
  price: string;
  /** Maximum API calls per minute; `null` means unlimited. */
  callsPerMinute: number | null;
  /** Maximum parallel SDK builds; `null` means unlimited. */
  maxParallelBuilds: number | null;
  /** Access to public GitHub modules. */
  publicGitHubRepos: boolean;
  /** Access to private VPS-hosted modules. */
  privateVpsModules: boolean;
  /** Dedicated per-key response cache. */
  dedicatedCache: boolean;
  /** Claude AI-powered timeline / analysis feature. */
  claudeTimeline: boolean;
  /** Zero-day vulnerability scanning. */
  zeroDayScanning: boolean;
  /** Full security audit reports. */
  securityAuditReports: boolean;
  /** SLA guarantee string, e.g. "99.9%" or "Best effort". */
  sla: string;
  /** Feature bullet list shown in pricing UI. */
  featureBullets: string[];
}

/**
 * SUBSCRIPTION_FEATURES
 *
 * Maps every `SubscriptionTier` to its full capability set.
 * Use `tierHasFeature()` / `assertTierFeature()` helpers for gated checks.
 */
export const SUBSCRIPTION_FEATURES: Record<SubscriptionTier, TierFeatures> = {
  [SubscriptionTier.Starter]: {
    displayName: "Starter",
    price: "Free",
    callsPerMinute: 100,
    maxParallelBuilds: 1,
    publicGitHubRepos: true,
    privateVpsModules: false,
    dedicatedCache: false,
    claudeTimeline: false,
    zeroDayScanning: false,
    securityAuditReports: false,
    sla: "Best effort",
    featureBullets: [
      "Access to public GitHub repos",
      "Standard latency",
      "100 calls / min",
      "1 parallel build",
    ],
  },

  [SubscriptionTier.Pro]: {
    displayName: "Pro",
    price: "$4/mo",
    callsPerMinute: 1000,
    maxParallelBuilds: 5,
    publicGitHubRepos: true,
    privateVpsModules: true,
    dedicatedCache: true,
    claudeTimeline: true,
    zeroDayScanning: false,
    securityAuditReports: false,
    sla: "Best effort",
    featureBullets: [
      "Access to private VPS modules",
      "Dedicated caching layer",
      "Claude AI timeline",
      "1 000 calls / min",
      "5 parallel builds",
    ],
  },

  [SubscriptionTier.Audited]: {
    displayName: "Audited",
    price: "Custom",
    callsPerMinute: null,
    maxParallelBuilds: null,
    publicGitHubRepos: true,
    privateVpsModules: true,
    dedicatedCache: true,
    claudeTimeline: true,
    zeroDayScanning: true,
    securityAuditReports: true,
    sla: "99.9%",
    featureBullets: [
      "Full security monitoring",
      "Zero-day vulnerability scanning",
      "Security audit reports",
      "Claude AI timeline",
      "99.9% SLA",
      "Unlimited calls / min",
      "Unlimited parallel builds",
    ],
  },
};

// ── Tier ordering ─────────────────────────────────────────────────────────────

const TIER_ORDER: SubscriptionTier[] = [
  SubscriptionTier.Starter,
  SubscriptionTier.Pro,
  SubscriptionTier.Audited,
];

/**
 * Returns a numeric rank for a tier (higher = more privileged).
 * Starter → 0, Pro → 1, Audited → 2.
 */
export function tierRank(tier: SubscriptionTier): number {
  return TIER_ORDER.indexOf(tier);
}

/**
 * Returns `true` when `callerTier` meets or exceeds `requiredTier`.
 */
export function tierMeetsRequirement(
  callerTier: SubscriptionTier,
  requiredTier: SubscriptionTier
): boolean {
  return tierRank(callerTier) >= tierRank(requiredTier);
}

// ── Feature gating helpers ────────────────────────────────────────────────────

/** Keys of `TierFeatures` that are boolean capability flags. */
export type BooleanFeatureKey = {
  [K in keyof TierFeatures]: TierFeatures[K] extends boolean ? K : never;
}[keyof TierFeatures];

/**
 * Returns `true` when the given tier has the specified boolean feature enabled.
 *
 * @example
 * tierHasFeature(SubscriptionTier.Pro, "dedicatedCache") // → true
 * tierHasFeature(SubscriptionTier.Starter, "claudeTimeline") // → false
 */
export function tierHasFeature(
  tier: SubscriptionTier,
  feature: BooleanFeatureKey
): boolean {
  return SUBSCRIPTION_FEATURES[tier][feature] as boolean;
}

/**
 * Throws a `TierFeatureError` when `tier` does not have `feature` enabled.
 * Useful for guarding service calls that require specific capabilities.
 *
 * @throws {TierFeatureError}
 */
export function assertTierFeature(
  tier: SubscriptionTier,
  feature: BooleanFeatureKey
): void {
  if (!tierHasFeature(tier, feature)) {
    throw new TierFeatureError(tier, feature);
  }
}

// ── Error types ───────────────────────────────────────────────────────────────

/** Thrown when a caller attempts to use a feature their tier does not include. */
export class TierFeatureError extends Error {
  readonly tier: SubscriptionTier;
  readonly feature: BooleanFeatureKey;
  readonly code = "TIER_FEATURE_DENIED";

  constructor(tier: SubscriptionTier, feature: BooleanFeatureKey) {
    const features = SUBSCRIPTION_FEATURES[tier];
    // Find the minimum tier that has this feature
    const minTier = TIER_ORDER.find(
      (t) => (SUBSCRIPTION_FEATURES[t][feature] as boolean) === true
    );
    const upgrade = minTier
      ? ` Upgrade to '${SUBSCRIPTION_FEATURES[minTier].displayName}' or higher.`
      : "";
    super(
      `Feature '${feature}' is not available on the '${features.displayName}' plan.${upgrade}`
    );
    this.tier = tier;
    this.feature = feature;
    this.name = "TierFeatureError";
  }
}

/** Thrown when a caller exceeds their tier's rate limit. */
export class TierRateLimitError extends Error {
  readonly tier: SubscriptionTier;
  readonly limit: number | null;
  readonly code = "TIER_RATE_LIMIT_EXCEEDED";

  constructor(tier: SubscriptionTier) {
    const features = SUBSCRIPTION_FEATURES[tier];
    super(
      `Rate limit exceeded for '${features.displayName}' plan (${features.callsPerMinute ?? "unlimited"} calls/min).`
    );
    this.tier = tier;
    this.limit = features.callsPerMinute;
    this.name = "TierRateLimitError";
  }
}

// ── Utility: parse a raw string into a SubscriptionTier ─────────────────────

/**
 * Converts a raw string (e.g., from an env var or API request body) to a
 * `SubscriptionTier`. Returns `null` when the string is unrecognised.
 */
export function parseTier(raw: unknown): SubscriptionTier | null {
  if (typeof raw !== "string") return null;
  const lower = raw.toLowerCase();
  return TIER_ORDER.find((t) => t === lower) ?? null;
}
