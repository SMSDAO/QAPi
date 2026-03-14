/**
 * apps/core/api/auth-me.ts
 *
 * Vercel serverless function: GET /auth/me
 *
 * Reads the API key from X-QAPi-Key (or Authorization: Bearer),
 * extracts tier from the key's embedded format (`qapi-{tier}-...`),
 * and returns the caller's tier and tier-feature config.
 *
 * Note: in the serverless deployment there is no persistent key store,
 * so email is not returned (use locally-stored value from signup instead).
 */

import { parseBearerToken, tierFromToken } from "../lib/tier-manager.js";
import { SUBSCRIPTION_FEATURES } from "../lib/subscription-tiers.js";

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

/** Minimal key-format validation: must be `qapi-{tier}-{non-empty-suffix}`. */
function isValidKeyFormat(key: string): boolean {
  return /^qapi-(starter|pro|audited)-.{8,}$/.test(key);
}

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

  const tier = tierFromToken(rawKey);

  return json(
    {
      tier,
      tierConfig: SUBSCRIPTION_FEATURES[tier],
    },
    200,
    cors
  );
}
