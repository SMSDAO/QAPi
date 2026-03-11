// apps/core – tier-manager unit tests (Node.js built-in test runner)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseBearerToken, tierFromToken, redactToken } from "../lib/tier-manager.ts";

// ── parseBearerToken ──────────────────────────────────────────────────────
describe("parseBearerToken", () => {
  test("returns null for null input", () => {
    assert.equal(parseBearerToken(null), null);
  });

  test("returns null for empty string", () => {
    assert.equal(parseBearerToken(""), null);
  });

  test("returns null for whitespace-only string", () => {
    assert.equal(parseBearerToken("   "), null);
  });

  test("strips 'Bearer ' prefix (case-insensitive)", () => {
    assert.equal(parseBearerToken("Bearer qapi-starter-abc123"), "qapi-starter-abc123");
  });

  test("strips 'bearer ' prefix (lowercase)", () => {
    assert.equal(parseBearerToken("bearer qapi-pro-xyz"), "qapi-pro-xyz");
  });

  test("strips 'BEARER ' prefix (uppercase)", () => {
    assert.equal(parseBearerToken("BEARER qapi-audited-tok"), "qapi-audited-tok");
  });

  test("returns null when only 'Bearer ' with no token", () => {
    assert.equal(parseBearerToken("Bearer "), null);
  });

  test("returns raw string when no Bearer prefix", () => {
    assert.equal(parseBearerToken("qapi-starter-raw"), "qapi-starter-raw");
  });
});

// ── tierFromToken ─────────────────────────────────────────────────────────
describe("tierFromToken", () => {
  test("returns 'starter' for qapi-starter- prefix", () => {
    assert.equal(tierFromToken("qapi-starter-abc123"), "starter");
  });

  test("returns 'pro' for qapi-pro- prefix", () => {
    assert.equal(tierFromToken("qapi-pro-xyz789"), "pro");
  });

  test("returns 'audited' for qapi-audited- prefix", () => {
    assert.equal(tierFromToken("qapi-audited-def456"), "audited");
  });

  test("defaults to 'starter' for unrecognized prefix", () => {
    assert.equal(tierFromToken("qapi-unknown-abc"), "starter");
  });

  test("defaults to 'starter' for arbitrary token", () => {
    assert.equal(tierFromToken("some-random-token"), "starter");
  });

  test("is case-insensitive (STARTER)", () => {
    assert.equal(tierFromToken("qapi-STARTER-abc"), "starter");
  });

  test("is case-insensitive (PRO)", () => {
    assert.equal(tierFromToken("qapi-PRO-abc"), "pro");
  });

  test("is case-insensitive (AUDITED)", () => {
    assert.equal(tierFromToken("qapi-AUDITED-abc"), "audited");
  });
});

// ── redactToken ───────────────────────────────────────────────────────────
describe("redactToken", () => {
  test("returns empty string for empty token", () => {
    assert.equal(redactToken(""), "");
  });

  test("short token (≤12 chars) shows first 4 + ellipsis", () => {
    const result = redactToken("abc12345678");
    assert.ok(result.startsWith("abc1"), `expected to start with 'abc1', got '${result}'`);
    assert.ok(result.includes("…"), "should contain ellipsis");
  });

  test("short token of exactly 12 chars shows first 4 + ellipsis", () => {
    const result = redactToken("123456789012");
    assert.equal(result, "1234…");
  });

  test("long token (>12 chars) shows first 8 + ellipsis + last 4", () => {
    const token = "qapi-starter-abc123xyz";
    const result = redactToken(token);
    assert.equal(result, "qapi-sta…3xyz");
  });

  test("long token preserves correct prefix and suffix", () => {
    const token = "qapi-audited-ABCDEFGH";
    const result = redactToken(token);
    assert.equal(result.slice(0, 8), "qapi-aud");
    assert.equal(result.slice(-4), "EFGH");
    assert.ok(result.includes("…"));
  });
});
