/**
 * apps/core/api/auth-me.ts
 *
 * Vercel serverless function: GET /auth/me
 *
 * Reads the API key from X-QAPi-Key (or Authorization: Bearer),
 * verifies its HMAC signature to prevent tier forgery, extracts the tier,
 * and returns the caller's tier and tier-feature config.
 *
 * Note: in the serverless deployment there is no persistent key store,
 * so email is not returned (use locally-stored value from signup instead).
 */

import { parseBearerToken, tierFromToken } from "../lib/tier-manager.js";
import { SUBSCRIPTION_FEATURES } from "../lib/subscription-tiers.js";
import {
  corsHeaders,
  jsonResponse,
  verifyKey,
  getKeySecret,
} from "../lib/serverless-utils.js";

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

  const tier = tierFromToken(rawKey);

  return jsonResponse(
    {
      tier,
      tierConfig: SUBSCRIPTION_FEATURES[tier],
    },
    200,
    cors
  );
}
