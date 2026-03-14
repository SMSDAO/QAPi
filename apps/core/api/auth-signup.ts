/**
 * apps/core/api/auth-signup.ts
 *
 * Vercel serverless function: POST /auth/signup
 *
 * Accepts { email, tier? } and returns a freshly-generated API key.
 * Keys use the self-validating format `qapi-{tier}-{uuid}` so the
 * resolve handler can derive the tier without a persistent key store.
 */

import { SUBSCRIPTION_FEATURES, parseTier } from "../lib/subscription-tiers.js";

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
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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

export default async function handler(req: Request): Promise<Response> {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed", code: "METHOD_NOT_ALLOWED" }, 405, cors);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(
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
    return json(
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
    return json(
      {
        error: `Unknown tier '${rawTier}'. Valid tiers: starter, pro, audited.`,
        code: "SIGNUP_INVALID_TIER",
      },
      400,
      cors
    );
  }

  // Generate self-validating API key: qapi-{tier}-{uuid}
  const apiKey = `qapi-${tier}-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();

  return json(
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
