// QAPi SDK – unit tests
"use strict";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Start the API server so the SDK can talk to a real server
const apiApp = require(path.join(__dirname, "../../../api/src/index"));
const { QAPiClient, QAPiError, signup } = require("../index");

let server;
let BASE;
let starterClient, proClient, auditedClient;

before(async () => {
  server = await new Promise((resolve) => {
    const s = apiApp.listen(0, () => resolve(s));
  });
  BASE = `http://localhost:${server.address().port}`;

  starterClient  = new QAPiClient({ apiKey: "qapi-starter-demo-key",  baseUrl: BASE });
  proClient      = new QAPiClient({ apiKey: "qapi-pro-demo-key",      baseUrl: BASE });
  auditedClient  = new QAPiClient({ apiKey: "qapi-audited-demo-key",  baseUrl: BASE });
});

after(() => new Promise((r) => server.close(r)));

// ── Constructor ───────────────────────────────────────────────────────────
describe("QAPiClient constructor", () => {
  test("throws when no apiKey provided", () => {
    assert.throws(() => new QAPiClient(), /apiKey is required/);
  });

  test("accepts custom baseUrl", () => {
    const c = new QAPiClient({ apiKey: "key", baseUrl: "http://localhost:9999" });
    assert.equal(c._baseUrl, "http://localhost:9999");
  });

  test("strips trailing slash from baseUrl", () => {
    const c = new QAPiClient({ apiKey: "key", baseUrl: "http://localhost:9999/" });
    assert.equal(c._baseUrl, "http://localhost:9999");
  });
});

// ── ping ──────────────────────────────────────────────────────────────────
describe("client.ping()", () => {
  test("returns ok status", async () => {
    const result = await starterClient.ping();
    assert.equal(result.status, "ok");
    assert.ok(result.timestamp);
  });
});

// ── signup ────────────────────────────────────────────────────────────────
describe("signup()", () => {
  test("creates a new starter key", async () => {
    const result = await signup({ email: "sdk-test@example.com", tier: "starter", baseUrl: BASE });
    assert.ok(result.apiKey.startsWith("qapi-starter-"));
    assert.equal(result.tier, "starter");
  });

  test("throws QAPiError for invalid email", async () => {
    await assert.rejects(
      () => signup({ email: "bad", baseUrl: BASE }),
      (err) => err instanceof QAPiError && err.statusCode === 400
    );
  });
});

// ── resolve ───────────────────────────────────────────────────────────────
describe("client.resolve()", () => {
  test("resolves express", async () => {
    const result = await starterClient.resolve("express");
    assert.equal(result.resolved, true);
    assert.equal(result.name, "express");
    assert.ok(result.entrypoint);
  });

  test("caches results", async () => {
    const c = new QAPiClient({ apiKey: "qapi-starter-demo-key", baseUrl: BASE });
    const first  = await c.resolve("express");
    const second = await c.resolve("express");
    assert.equal(first, second); // same object reference from cache
  });

  test("clearCache() removes cached entries", async () => {
    const c = new QAPiClient({ apiKey: "qapi-starter-demo-key", baseUrl: BASE });
    const first = await c.resolve("express");
    c.clearCache();
    const second = await c.resolve("express");
    assert.notEqual(first, second); // different objects after cache clear
    assert.deepEqual(first, second); // same content
  });

  test("throws QAPiError(404) for unknown module", async () => {
    await assert.rejects(
      () => starterClient.resolve("does-not-exist-xyz"),
      (err) => err instanceof QAPiError && err.statusCode === 404
    );
  });

  test("throws QAPiError(403) when tier insufficient", async () => {
    await assert.rejects(
      () => starterClient.resolve("@solanar/vps-module-alpha"),
      (err) => err instanceof QAPiError && err.statusCode === 403
    );
  });

  test("pro tier resolves pro module", async () => {
    const result = await proClient.resolve("@solanar/vps-module-alpha");
    assert.equal(result.resolved, true);
  });
});

// ── list ──────────────────────────────────────────────────────────────────
describe("client.list()", () => {
  test("returns modules array", async () => {
    const result = await starterClient.list();
    assert.ok(Array.isArray(result.modules));
    assert.ok(result.count >= 1);
  });

  test("filters by name", async () => {
    const result = await starterClient.list({ name: "express" });
    assert.ok(result.modules.every((m) => m.name.includes("express")));
  });
});

// ── audit ─────────────────────────────────────────────────────────────────
describe("client.audit()", () => {
  test("throws 403 for starter tier", async () => {
    await assert.rejects(
      () => starterClient.audit("express"),
      (err) => err instanceof QAPiError && err.statusCode === 403
    );
  });

  test("audited tier can scan", async () => {
    const result = await auditedClient.audit("express");
    assert.ok(typeof result.audit.score === "number");
    assert.ok(typeof result.audit.passed === "boolean");
  });
});

// ── QAPiError ─────────────────────────────────────────────────────────────
describe("QAPiError", () => {
  test("has correct properties", () => {
    const err = new QAPiError("test message", "TEST_CODE", 400);
    assert.equal(err.message, "test message");
    assert.equal(err.code, "TEST_CODE");
    assert.equal(err.statusCode, 400);
    assert.equal(err.name, "QAPiError");
    assert.ok(err instanceof Error);
  });
});
