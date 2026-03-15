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
import {
  corsHeaders,
  jsonResponse,
  verifyKey,
  getKeySecret,
} from "../lib/serverless-utils.js";

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

export default async function handler(req: Request): Promise<Response> {
  const cors = corsHeaders(req, "GET,OPTIONS");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "GET") {
    return jsonResponse(
      { error: "Method Not Allowed", code: "METHOD_NOT_ALLOWED" },
      405,
      cors
    );
  }

  const url = new URL(req.url);

  // Support /v1/tiers/:tierId by checking a "tierId" query param Vercel injects,
  // or by parsing the last path segment.
  const segments = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  const tierId = segments.length >= 3 ? segments[2] : null; // /v1/tiers/:tierId

  if (tierId) {
    const tier = parseTier(tierId);
    if (!tier) {
      return jsonResponse(
        { error: `Tier '${tierId}' not found.`, code: "TIER_NOT_FOUND" },
        404,
        cors
      );
    }
    const def = TIER_DEFS.find((d) => d.id === tier);
    if (!def) {
      return jsonResponse(
        { error: `Tier '${tierId}' not found.`, code: "TIER_NOT_FOUND" },
        404,
        cors
      );
    }
    return jsonResponse(def, 200, cors);
  }

  // List all tiers — optionally include callerTier if a valid key is provided
  const rawKey =
    req.headers.get("x-qapi-key") ||
    parseBearerToken(req.headers.get("authorization"));

  let callerTier: string | undefined;
  if (rawKey && verifyKey(rawKey, getKeySecret())) {
    callerTier = tierFromToken(rawKey);
  }

  return jsonResponse(
    {
      tiers: TIER_DEFS,
      ...(callerTier !== undefined && { callerTier }),
    },
    200,
    cors
  );
}
