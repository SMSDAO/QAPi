/**
 * apps/core/api/v1-modules.ts
 *
 * Vercel serverless function: GET /v1/modules
 *
 * Returns the list of module nodes accessible to the authenticated caller's
 * tier. Requires a valid API key via X-QAPi-Key or Authorization: Bearer.
 * The tier is derived from the key's embedded format (`qapi-{tier}-...`).
 */

import { parseBearerToken, tierFromToken } from "../lib/tier-manager.js";

const ALLOWED_ORIGINS = new Set([
  "https://qapi-omega.vercel.app",
  "http://localhost:3000",
  "http://localhost:5500",
]);

const TIER_ORDER = ["starter", "pro", "audited"] as const;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://qapi-omega.vercel.app";
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-QAPi-Key, Authorization",
    Vary: "Origin",
  };
}

function json(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

/** Minimal key-format validation: must be `qapi-{tier}-{non-empty-suffix}`. */
function isValidKeyFormat(key: string): boolean {
  return /^qapi-(starter|pro|audited)-.{8,}$/.test(key);
}

// ── Static module node catalog (mirrors api/src/data/moduleStore.js seeds) ──

const ALL_MODULES = [
  {
    id: "mod-express",
    name: "express",
    version: "4.18.2",
    description: "Fast web framework for Node.js",
    tier: "starter",
    status: "active",
    audit: {
      score: 98,
      passed: true,
      zeroDay: false,
      lastScannedAt: new Date().toISOString(),
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 1, info: 2 },
    },
    metrics: { callsTotal: 5_000_000, callsLastMin: 0, avgLatencyMs: 4.2 },
  },
  {
    id: "mod-lodash",
    name: "lodash",
    version: "4.17.21",
    description: "A modern JavaScript utility library",
    tier: "starter",
    status: "active",
    audit: {
      score: 95,
      passed: true,
      zeroDay: false,
      lastScannedAt: new Date().toISOString(),
      vulnerabilities: { critical: 0, high: 0, moderate: 1, low: 2, info: 0 },
    },
    metrics: { callsTotal: 3_200_000, callsLastMin: 0, avgLatencyMs: 3.1 },
  },
  {
    id: "mod-vps-alpha",
    name: "@solanar/vps-module-alpha",
    version: "1.0.0",
    description: "Private VPS-hosted module (Pro tier)",
    tier: "pro",
    status: "active",
    audit: {
      score: 100,
      passed: true,
      zeroDay: false,
      lastScannedAt: new Date().toISOString(),
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 },
    },
    metrics: { callsTotal: 0, callsLastMin: 0, avgLatencyMs: 2.8 },
  },
];

export default async function handler(req: Request): Promise<Response> {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "GET") {
    return json({ error: "Method Not Allowed", code: "METHOD_NOT_ALLOWED" }, 405, cors);
  }

  const rawKey =
    req.headers.get("x-qapi-key") ||
    parseBearerToken(req.headers.get("authorization"));

  if (!rawKey) {
    return json(
      {
        error: "Missing API key. Supply X-QAPi-Key header.",
        code: "AUTH_MISSING_KEY",
      },
      401,
      cors
    );
  }

  if (!isValidKeyFormat(rawKey)) {
    return json(
      { error: "Invalid or unknown API key.", code: "AUTH_INVALID_KEY" },
      403,
      cors
    );
  }

  const callerTier = tierFromToken(rawKey);
  const callerIdx = TIER_ORDER.indexOf(callerTier as typeof TIER_ORDER[number]);

  // Filter modules accessible to the caller's tier
  const modules = ALL_MODULES.filter(
    (m) => TIER_ORDER.indexOf(m.tier as typeof TIER_ORDER[number]) <= callerIdx
  );

  const url = new URL(req.url);
  const nameFilter = url.searchParams.get("name");
  const filtered = nameFilter
    ? modules.filter((m) => m.name.includes(nameFilter))
    : modules;

  return json(
    {
      count: filtered.length,
      tier: callerTier,
      modules: filtered,
    },
    200,
    cors
  );
}
