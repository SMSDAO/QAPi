/**
 * apps/core/api/v1-tiers.ts
 *
 * Vercel serverless function: GET /v1/tiers  AND  GET /v1/tiers/:tierId
 *
 * Returns the full tier catalog (or a single tier) with id, price,
 * callsPerMin, maxParallelBuilds, and featureBullets.
 * Optionally reads X-QAPi-Key to include the callerTier in the response.
 */

import { SUBSCRIPTION_FEATURES, parseTier } from "../lib/subscription-tiers.js";
import { parseBearerToken, tierFromToken } from "../lib/tier-manager.js";

const ALLOWED_ORIGINS = new Set([
  "https://qapi-omega.vercel.app",
  "http://localhost:3000",
  "http://localhost:5500",
]);

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

const TIER_DEFS = [
  {
    id: "starter",
    name: "Starter",
    price: SUBSCRIPTION_FEATURES.starter.price,
    callsPerMin: SUBSCRIPTION_FEATURES.starter.callsPerMinute,
    maxParallelBuilds: SUBSCRIPTION_FEATURES.starter.maxParallelBuilds,
    features: SUBSCRIPTION_FEATURES.starter.featureBullets,
  },
  {
    id: "pro",
    name: "Pro",
    price: SUBSCRIPTION_FEATURES.pro.price,
    callsPerMin: SUBSCRIPTION_FEATURES.pro.callsPerMinute,
    maxParallelBuilds: SUBSCRIPTION_FEATURES.pro.maxParallelBuilds,
    features: SUBSCRIPTION_FEATURES.pro.featureBullets,
  },
  {
    id: "audited",
    name: "Audited",
    price: SUBSCRIPTION_FEATURES.audited.price,
    callsPerMin: SUBSCRIPTION_FEATURES.audited.callsPerMinute,
    maxParallelBuilds: SUBSCRIPTION_FEATURES.audited.maxParallelBuilds,
    features: SUBSCRIPTION_FEATURES.audited.featureBullets,
  },
];

/** Minimal key-format validation: must be `qapi-{tier}-{non-empty-suffix}`. */
function isValidKeyFormat(key: string): boolean {
  const tierIds = TIER_DEFS.map((t) => t.id).join("|");
  return new RegExp(`^qapi-(${tierIds})-.{8,}$`).test(key);
}

export default async function handler(req: Request): Promise<Response> {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "GET") {
    return json({ error: "Method Not Allowed", code: "METHOD_NOT_ALLOWED" }, 405, cors);
  }

  const url = new URL(req.url);

  // Support /v1/tiers/:tierId by checking a "tierId" query param Vercel injects,
  // or by parsing the last path segment.
  const segments = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  const tierId = segments.length >= 3 ? segments[2] : null; // /v1/tiers/:tierId

  if (tierId) {
    const tier = parseTier(tierId);
    if (!tier) {
      return json({ error: `Tier '${tierId}' not found.`, code: "TIER_NOT_FOUND" }, 404, cors);
    }
    const def = TIER_DEFS.find((d) => d.id === tier);
    if (!def) {
      return json({ error: `Tier '${tierId}' not found.`, code: "TIER_NOT_FOUND" }, 404, cors);
    }
    return json(def, 200, cors);
  }

  // List all tiers
  const rawKey =
    req.headers.get("x-qapi-key") ||
    parseBearerToken(req.headers.get("authorization"));

  let callerTier: string | undefined;
  if (rawKey && isValidKeyFormat(rawKey)) {
    callerTier = tierFromToken(rawKey);
  }

  return json(
    {
      tiers: TIER_DEFS,
      ...(callerTier !== undefined && { callerTier }),
    },
    200,
    cors
  );
}
