/**
 * services/claudeAPI/timeline.ts
 *
 * Claude AI-powered Timeline Service for QAPi.
 *
 * Features:
 *  - Redis-backed per-tier rate limiting
 *  - Response caching layer (Pro+ tiers)
 *  - Exponential-backoff retry logic
 *  - Token usage and cost tracking
 *  - Latency measurement
 *  - Persistent timeline entry storage (in-memory stub; swap for DB)
 *  - Audit-friendly metadata on every response
 *
 * Dependencies: @anthropic-ai/sdk, ioredis (both optional at runtime –
 * graceful degradation when not installed).
 *
 * Env vars:
 *   ANTHROPIC_API_KEY   – required for real API calls
 *   REDIS_URL           – optional; falls back to in-memory stubs
 */

import { SubscriptionTier, SUBSCRIPTION_FEATURES, assertTierFeature } from "../../apps/core/lib/subscription-tiers.js";

// ── Type-only imports so the file compiles without the SDK installed ──────────

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TimelineEntry {
  id: string;
  tier: SubscriptionTier;
  prompt: string;
  response: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  cached: boolean;
  createdAt: string;
  /** Audit metadata – always present for Audited tier calls. */
  audit?: {
    keyId: string;
    requestId: string;
    rateLimitRemaining: number | null;
  };
}

export interface TimelineQueryOptions {
  limit?: number;
  tier?: SubscriptionTier;
  since?: Date;
}

// ── Cost constants (Claude 3.5 Sonnet, per 1M tokens, USD) ───────────────────

const COST_PER_INPUT_TOKEN = 3.0 / 1_000_000;   // $3 / 1M input tokens
const COST_PER_OUTPUT_TOKEN = 15.0 / 1_000_000; // $15 / 1M output tokens

// ── Default model ─────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";

// ── In-memory fallback stores ─────────────────────────────────────────────────

/** Persistent timeline entries (replace with DB in production). */
const _timelineStore: TimelineEntry[] = [];

/** In-process rate-limit counters keyed by `${tier}:${window}`. */
const _rateLimitCounters = new Map<string, { count: number; resetAt: number }>();

/** In-process response cache keyed by prompt hash (Pro+ tiers only). */
const _responseCache = new Map<string, { response: TimelineEntry; expiresAt: number }>();

// ── Redis client stub ─────────────────────────────────────────────────────────

/**
 * Lazily loaded Redis client.  If `REDIS_URL` is not configured, all
 * Redis operations fall back to the in-memory stubs above so the service
 * can still run in a local dev environment without Redis.
 */
let _redis: {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
} | null = null;

async function getRedis() {
  if (_redis) return _redis;
  if (!process.env.REDIS_URL) return null;

  try {
    // Dynamic import so the service gracefully degrades without ioredis installed
    const { default: Redis } = await import("ioredis" as string) as { default: new (url: string) => typeof _redis };
    _redis = new Redis(process.env.REDIS_URL) as typeof _redis;
    return _redis;
  } catch {
    return null;
  }
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

/**
 * Checks and increments the per-tier rate limit counter.
 *
 * @returns The number of remaining calls this minute, or `null` if unlimited.
 * @throws {Error} when the rate limit is exceeded.
 */
async function checkRateLimit(tier: SubscriptionTier, keyId = "global"): Promise<number | null> {
  const features = SUBSCRIPTION_FEATURES[tier];
  const limit = features.callsPerMinute;

  if (limit === null) return null; // Audited tier – unlimited

  const windowSec = 60;
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSec / windowSec) * windowSec;
  const redisKey = `qapi:rl:timeline:${tier}:${keyId}:${windowStart}`;

  const redis = await getRedis();

  if (redis) {
    const count = await redis.incr(redisKey);
    await redis.expire(redisKey, windowSec * 2);
    if (count > limit) {
      throw Object.assign(new Error(`Rate limit exceeded: ${limit} calls/min on '${tier}' plan.`), {
        code: "RATE_LIMIT_EXCEEDED",
        tier,
        limit,
        resetAt: new Date((windowStart + windowSec) * 1000).toISOString(),
      });
    }
    return limit - count;
  }

  // In-memory fallback
  const key = `${tier}:${keyId}:${windowStart}`;
  const entry = _rateLimitCounters.get(key) ?? { count: 0, resetAt: (windowStart + windowSec) * 1000 };
  entry.count += 1;
  _rateLimitCounters.set(key, entry);

  if (entry.count > limit) {
    throw Object.assign(new Error(`Rate limit exceeded: ${limit} calls/min on '${tier}' plan.`), {
      code: "RATE_LIMIT_EXCEEDED",
      tier,
      limit,
    });
  }
  return limit - entry.count;
}

// ── Caching ───────────────────────────────────────────────────────────────────

/** Simple djb2-inspired hash for cache keys. */
function hashPrompt(prompt: string, model: string): string {
  let h = 5381;
  const s = `${model}::${prompt}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getFromCache(key: string): Promise<TimelineEntry | null> {
  // Try Redis first
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.get(`qapi:cache:timeline:${key}`);
    if (raw) {
      try { return JSON.parse(raw) as TimelineEntry; } catch { /* ignore */ }
    }
    return null;
  }

  // In-memory fallback
  const cached = _responseCache.get(key);
  if (!cached || cached.expiresAt < Date.now()) {
    _responseCache.delete(key);
    return null;
  }
  return cached.response;
}

async function setInCache(key: string, entry: TimelineEntry): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.set(
      `qapi:cache:timeline:${key}`,
      JSON.stringify(entry),
      "EX", Math.floor(CACHE_TTL_MS / 1000)
    );
    return;
  }
  _responseCache.set(key, { response: entry, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Retry logic ───────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function withRetry<T>(fn: () => Promise<T>, maxRetries = MAX_RETRIES): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      // Do not retry on rate-limit errors from our own limiter
      if (err instanceof Error && (err as { code?: string }).code === "RATE_LIMIT_EXCEEDED") throw err;
      if (attempt < maxRetries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  throw lastError;
}

// ── Anthropic SDK wrapper ─────────────────────────────────────────────────────

interface AnthropicUsage { input_tokens: number; output_tokens: number; }
interface AnthropicContent { type: string; text?: string; }
interface AnthropicResponse { content: AnthropicContent[]; usage: AnthropicUsage; }
interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      messages: ClaudeMessage[];
    }): Promise<AnthropicResponse>;
  };
}

let _anthropic: AnthropicClient | null = null;

function getAnthropicClient(): AnthropicClient {
  if (_anthropic) return _anthropic;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
  }

  // Dynamically import Anthropic SDK
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { default: Anthropic } = require("@anthropic-ai/sdk") as {
    default: new (opts: { apiKey: string }) => AnthropicClient;
  };
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

// ── ID generation ─────────────────────────────────────────────────────────────

function generateId(): string {
  return `tl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Main API ──────────────────────────────────────────────────────────────────

export interface GenerateTimelineOptions {
  /** The user's subscription tier – controls rate limiting and caching. */
  tier: SubscriptionTier;
  /** Prompt text to send to Claude. */
  prompt: string;
  /** Claude model to use. Defaults to claude-3-5-sonnet-20241022. */
  model?: string;
  /** Max tokens for the response. */
  maxTokens?: number;
  /** Key ID for per-key rate limiting and audit logs. */
  keyId?: string;
  /** Request ID for tracing. */
  requestId?: string;
}

/**
 * Generates a Claude AI timeline entry for the given prompt.
 *
 * - Enforces that the caller's tier has `claudeTimeline` enabled.
 * - Applies per-tier rate limiting (Redis-backed, in-memory fallback).
 * - Checks/populates a response cache for Pro+ tiers.
 * - Retries up to 3 times on transient failures.
 * - Records token usage, cost, and latency in the returned entry.
 *
 * @throws {TierFeatureError} when the tier does not have `claudeTimeline`.
 * @throws {Error} with `code: "RATE_LIMIT_EXCEEDED"` when over limit.
 */
export async function generateTimeline(opts: GenerateTimelineOptions): Promise<TimelineEntry> {
  const {
    tier,
    prompt,
    model = DEFAULT_MODEL,
    maxTokens = 1024,
    keyId = "global",
    requestId = generateId(),
  } = opts;

  // ── Feature gate ──────────────────────────────────────────────────────────
  assertTierFeature(tier, "claudeTimeline");

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const rateLimitRemaining = await checkRateLimit(tier, keyId);

  // ── Cache lookup (Pro+ only) ──────────────────────────────────────────────
  const features = SUBSCRIPTION_FEATURES[tier];
  const shouldCache = features.dedicatedCache;
  const cacheKey = shouldCache ? hashPrompt(prompt, model) : null;

  if (cacheKey) {
    const cached = await getFromCache(cacheKey);
    if (cached) {
      const entry: TimelineEntry = {
        ...cached,
        cached: true,
        id: generateId(),
        createdAt: new Date().toISOString(),
        audit: tier === SubscriptionTier.Audited
          ? { keyId, requestId, rateLimitRemaining }
          : undefined,
      };
      _timelineStore.push(entry);
      return entry;
    }
  }

  // ── Claude API call ───────────────────────────────────────────────────────
  const startMs = Date.now();

  const raw = await withRetry(async () => {
    const client = getAnthropicClient();
    return client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
  });

  const latencyMs = Date.now() - startMs;

  const responseText = raw.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");

  const inputTokens = raw.usage.input_tokens;
  const outputTokens = raw.usage.output_tokens;
  const totalTokens = inputTokens + outputTokens;
  const estimatedCostUsd =
    inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;

  const entry: TimelineEntry = {
    id: generateId(),
    tier,
    prompt,
    response: responseText,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
    latencyMs,
    cached: false,
    createdAt: new Date().toISOString(),
    audit: tier === SubscriptionTier.Audited
      ? { keyId, requestId, rateLimitRemaining }
      : undefined,
  };

  // ── Persist ───────────────────────────────────────────────────────────────
  _timelineStore.push(entry);

  // ── Cache store (Pro+ only) ───────────────────────────────────────────────
  if (cacheKey) {
    await setInCache(cacheKey, entry);
  }

  return entry;
}

/**
 * Returns stored timeline entries, optionally filtered.
 */
export function queryTimeline(opts: TimelineQueryOptions = {}): TimelineEntry[] {
  const { limit = 50, tier, since } = opts;
  let results = [..._timelineStore];

  if (tier) results = results.filter((e) => e.tier === tier);
  if (since) results = results.filter((e) => new Date(e.createdAt) >= since);

  // Most recent first
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return results.slice(0, limit);
}

/**
 * Returns aggregate usage statistics across all stored timeline entries.
 */
export function getUsageStats(): {
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  cacheHitRate: number;
  byTier: Record<string, { calls: number; tokens: number; costUsd: number }>;
} {
  const entries = _timelineStore;
  if (entries.length === 0) {
    return {
      totalCalls: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      avgLatencyMs: 0,
      cacheHitRate: 0,
      byTier: {},
    };
  }

  const totalCalls = entries.length;
  const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
  const totalCostUsd = entries.reduce((s, e) => s + e.estimatedCostUsd, 0);
  const avgLatencyMs = entries.reduce((s, e) => s + e.latencyMs, 0) / totalCalls;
  const cacheHits = entries.filter((e) => e.cached).length;
  const cacheHitRate = cacheHits / totalCalls;

  const byTier: Record<string, { calls: number; tokens: number; costUsd: number }> = {};
  for (const entry of entries) {
    if (!byTier[entry.tier]) byTier[entry.tier] = { calls: 0, tokens: 0, costUsd: 0 };
    byTier[entry.tier].calls += 1;
    byTier[entry.tier].tokens += entry.totalTokens;
    byTier[entry.tier].costUsd += entry.estimatedCostUsd;
  }

  return { totalCalls, totalTokens, totalCostUsd, avgLatencyMs, cacheHitRate, byTier };
}

/** Clears all in-process state. Useful for testing. */
export function _resetForTesting(): void {
  _timelineStore.length = 0;
  _rateLimitCounters.clear();
  _responseCache.clear();
  _anthropic = null;
  _redis = null;
}
