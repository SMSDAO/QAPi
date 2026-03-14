/**
 * apps/core/api/auth-signup.ts
 *
 * Vercel serverless function: POST /auth/signup
 *
 * Accepts { email, tier? } and returns a freshly-generated, HMAC-signed API
 * key in the format `qapi-{tier}-{uuid}.{sig16}`. The HMAC prevents callers
 * from forging a higher tier by crafting the key prefix themselves.
 */

import { SUBSCRIPTION_FEATURES, parseTier } from "../lib/subscription-tiers.js";
import {
  corsHeaders,
  jsonResponse,
  signKey,
  getKeySecret,
} from "../lib/serverless-utils.js";

export default async function handler(req: Request): Promise<Response> {
  const cors = corsHeaders(req, "POST,OPTIONS");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method Not Allowed", code: "METHOD_NOT_ALLOWED" },
      405,
      cors
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse(
      { error: "Invalid JSON body.", code: "SIGNUP_INVALID_BODY" },
      400,
      cors
    );
  }

  const { email, tier: rawTier = "starter" } = body as {
    email?: unknown;
    tier?: unknown;
  };

  // Validate email
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return jsonResponse(
      {
        error: "A valid email address is required.",
        code: "SIGNUP_INVALID_EMAIL",
      },
      400,
      cors
    );
  }

  // Validate tier
  const tier = parseTier(rawTier);
  if (!tier) {
    return jsonResponse(
      {
        error: `Unknown tier '${rawTier}'. Valid tiers: starter, pro, audited.`,
        code: "SIGNUP_INVALID_TIER",
      },
      400,
      cors
    );
  }

  // Generate HMAC-signed API key: qapi-{tier}-{uuid}.{sig16}
  const apiKey = signKey(tier, getKeySecret());
  const createdAt = new Date().toISOString();

  return jsonResponse(
    {
      message: "API key created successfully.",
      apiKey,
      tier,
      email,
      createdAt,
      tierConfig: SUBSCRIPTION_FEATURES[tier],
    },
    201,
    cors
  );
}
