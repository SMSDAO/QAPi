/**
 * apps/core/api/v1-modules.ts
 *
 * Vercel serverless function: GET /v1/modules
 *
 * Returns the list of module nodes accessible to the authenticated caller's
 * tier. Requires a valid HMAC-signed API key via X-QAPi-Key or
 * Authorization: Bearer. The tier is derived from the key's embedded format
 * (`qapi-{tier}-{uuid}.{sig16}`); the signature is verified to prevent
 * callers from crafting a higher-tier key prefix.
 */

import { parseBearerToken, tierFromToken } from "../lib/tier-manager.js";
import {
  corsHeaders,
  jsonResponse,
  verifyKey,
  getKeySecret,
} from "../lib/serverless-utils.js";
import { getModuleCatalog } from "../lib/module-catalog.js";

const TIER_ORDER = ["starter", "pro", "audited"] as const;

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

  const rawKey =
    req.headers.get("x-qapi-key") ||
    parseBearerToken(req.headers.get("authorization"));

  if (!rawKey) {
    return jsonResponse(
      {
        error: "Missing API key. Supply X-QAPi-Key header.",
        code: "AUTH_MISSING_KEY",
      },
      401,
      cors
    );
  }

  if (!verifyKey(rawKey, getKeySecret())) {
    return jsonResponse(
      { error: "Invalid or unknown API key.", code: "AUTH_INVALID_KEY" },
      403,
      cors
    );
  }

  const callerTier = tierFromToken(rawKey);
  const callerIdx = TIER_ORDER.indexOf(callerTier as (typeof TIER_ORDER)[number]);

  // getModuleCatalog() called per-request for a fresh lastScannedAt timestamp.
  const allModules = getModuleCatalog();
  const modules = allModules.filter(
    (m) => TIER_ORDER.indexOf(m.tier as (typeof TIER_ORDER)[number]) <= callerIdx
  );

  const url = new URL(req.url);
  const nameFilter = url.searchParams.get("name");
  const filtered = nameFilter
    ? modules.filter((m) => m.name.includes(nameFilter))
    : modules;

  return jsonResponse(
    {
      count: filtered.length,
      tier: callerTier,
      modules: filtered,
    },
    200,
    cors
  );
}
