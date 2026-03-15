/**
 * apps/core/lib/serverless-utils.ts
 *
 * Shared utilities for QAPi's Vercel serverless functions.
 *
 * Extracts the common CORS/JSON boilerplate and provides HMAC-signed API key
 * helpers so that the tier claim embedded in a key cannot be forged by a
 * caller — the server re-derives the expected HMAC from the key payload and
 * compares using a constant-time comparison to prevent timing side-channels.
 *
 * Key format (after this PR):
 *   qapi-{tier}-{uuid}.{sig16}
 * where sig16 is the first 16 hex chars of HMAC-SHA256(secret, payload) and
 * payload is the `qapi-{tier}-{uuid}` prefix.
 */

import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

// ── CORS ──────────────────────────────────────────────────────────────────────

export const ALLOWED_ORIGINS = new Set([
  "https://qapi-omega.vercel.app",
  "http://localhost:3000",
  "http://localhost:5500",
]);

/**
 * Returns CORS response headers for a given request.
 *
 * @param req     The incoming request.
 * @param methods Comma-separated HTTP methods to allow, e.g. "GET,OPTIONS".
 */
export function corsHeaders(
  req: Request,
  methods: string
): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://qapi-omega.vercel.app";
  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, X-QAPi-Key, Authorization",
    Vary: "Origin",
  };
}

// ── JSON response helper ──────────────────────────────────────────────────────

/**
 * Creates a JSON Response with optional status code and extra headers.
 */
export function jsonResponse(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

// ── HMAC-signed API key helpers ───────────────────────────────────────────────

/** Number of hex characters in the HMAC signature suffix (= 8 bytes). */
const SIG_HEX_LEN = 16;

/**
 * Regex for a valid HMAC-signed key:
 *   qapi-{tier}-{uuid}.{16hexchars}
 */
const SIGNED_KEY_RE =
  /^(qapi-(?:starter|pro|audited)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{16})$/i;

/**
 * Returns the HMAC secret from the environment.
 * Defaults to a fixed development value — set QAPI_KEY_SECRET in production.
 */
export function getKeySecret(): string {
  const secret = process.env["QAPI_KEY_SECRET"];
  if (!secret) {
    if (process.env["VERCEL_ENV"] === "production") {
      throw new Error(
        "QAPI_KEY_SECRET environment variable is required in production. " +
          "Set it in your Vercel project settings."
      );
    }
    console.warn(
      "[QAPi] WARNING: QAPI_KEY_SECRET is not set — using dev fallback. " +
        "Set QAPI_KEY_SECRET before deploying to production."
    );
    return "dev-secret-change-in-prod";
  }
  return secret;
}

/**
 * Generates a new HMAC-signed API key for the given tier.
 *
 * Format: `qapi-{tier}-{uuid}.{sig16}`
 * where `sig16` is the first 16 hex chars of HMAC-SHA256(secret, payload).
 */
export function signKey(tier: string, secret: string): string {
  const payload = `qapi-${tier}-${randomUUID()}`;
  const sig = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, SIG_HEX_LEN);
  return `${payload}.${sig}`;
}

/**
 * Verifies that a key's format is valid AND its HMAC signature is correct.
 * Uses a constant-time comparison to prevent timing side-channel attacks.
 *
 * Returns `true` only when both checks pass.
 */
export function verifyKey(key: string, secret: string): boolean {
  const m = key.match(SIGNED_KEY_RE);
  if (!m) return false;

  const payload = m[1];
  const providedSig = m[2].toLowerCase();
  const expectedSig = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, SIG_HEX_LEN);

  try {
    return timingSafeEqual(
      Buffer.from(providedSig, "hex"),
      Buffer.from(expectedSig, "hex")
    );
  } catch {
    return false;
  }
}
