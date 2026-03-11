// QAPi – unit/integration tests (Node.js built-in test runner)
"use strict";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

let app, server, BASE;

before(async () => {
  app = require("../index");
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  BASE = `http://localhost:${server.address().port}`;
});

after(() => new Promise((r) => server.close(r)));

/** Tiny helper to make HTTP requests */
function req(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { "Content-Type": "application/json", ...headers },
    };
    const r = http.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// ── Health ─────────────────────────────────────────────────────────────────
describe("GET /health", () => {
  test("returns 200 with status ok", async () => {
    const { status, body } = await req("GET", "/health");
    assert.equal(status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "qapi-core");
  });
});

// ── Auth /tiers ───────────────────────────────────────────────────────────
describe("GET /auth/tiers", () => {
  test("returns all three tiers", async () => {
    const { status, body } = await req("GET", "/auth/tiers");
    assert.equal(status, 200);
    assert.equal(body.tiers.length, 3);
    const names = body.tiers.map((t) => t.name);
    assert.ok(names.includes("starter"));
    assert.ok(names.includes("pro"));
    assert.ok(names.includes("audited"));
  });
});

// ── Auth /signup ──────────────────────────────────────────────────────────
describe("POST /auth/signup", () => {
  test("creates a starter key", async () => {
    const { status, body } = await req("POST", "/auth/signup", {
      body: { email: "test@example.com", tier: "starter" },
    });
    assert.equal(status, 201);
    assert.ok(body.apiKey.startsWith("qapi-starter-"));
    assert.equal(body.tier, "starter");
  });

  test("defaults to starter when no tier supplied", async () => {
    const { status, body } = await req("POST", "/auth/signup", {
      body: { email: "noTier@example.com" },
    });
    assert.equal(status, 201);
    assert.equal(body.tier, "starter");
  });

  test("rejects invalid email", async () => {
    const { status, body } = await req("POST", "/auth/signup", {
      body: { email: "not-an-email" },
    });
    assert.equal(status, 400);
    assert.equal(body.code, "SIGNUP_INVALID_EMAIL");
  });

  test("rejects unknown tier", async () => {
    const { status } = await req("POST", "/auth/signup", {
      body: { email: "x@x.com", tier: "enterprise" },
    });
    assert.equal(status, 400);
  });
});

// ── Auth /me ─────────────────────────────────────────────────────────────
describe("GET /auth/me", () => {
  test("returns tier info for authenticated starter key", async () => {
    const { status, body } = await req("GET", "/auth/me", {
      headers: { "X-QAPi-Key": "qapi-starter-demo-key" },
    });
    assert.equal(status, 200);
    assert.equal(body.tier, "starter");
    assert.ok(body.tierConfig);
    assert.ok(body.createdAt);
  });

  test("returns tier info for authenticated pro key", async () => {
    const { status, body } = await req("GET", "/auth/me", {
      headers: { "X-QAPi-Key": "qapi-pro-demo-key" },
    });
    assert.equal(status, 200);
    assert.equal(body.tier, "pro");
  });

  test("returns 401 without key", async () => {
    const { status } = await req("GET", "/auth/me");
    assert.equal(status, 401);
  });

  test("returns 403 with invalid key", async () => {
    const { status } = await req("GET", "/auth/me", {
      headers: { "X-QAPi-Key": "not-a-valid-key" },
    });
    assert.equal(status, 403);
  });
});

// ── Modules – auth guard ──────────────────────────────────────────────────
describe("GET /modules – auth", () => {
  test("returns 401 without key", async () => {
    const { status } = await req("GET", "/modules");
    assert.equal(status, 401);
  });

  test("returns 403 with bad key", async () => {
    const { status } = await req("GET", "/modules", {
      headers: { "X-QAPi-Key": "bad-key" },
    });
    assert.equal(status, 403);
  });
});

// ── Modules – list ────────────────────────────────────────────────────────
describe("GET /modules – starter tier", () => {
  test("returns module list for starter tier", async () => {
    const { status, body } = await req("GET", "/modules", {
      headers: { "X-QAPi-Key": "qapi-starter-demo-key" },
    });
    assert.equal(status, 200);
    assert.ok(body.count >= 1);
    assert.ok(Array.isArray(body.modules));
    // Starter tier must NOT see pro-only modules
    const proModules = body.modules.filter((m) => m.tier === "pro");
    assert.equal(proModules.length, 0);
  });

  test("returns more modules for pro tier", async () => {
    const starter = await req("GET", "/modules", { headers: { "X-QAPi-Key": "qapi-starter-demo-key" } });
    const pro = await req("GET", "/modules", { headers: { "X-QAPi-Key": "qapi-pro-demo-key" } });
    assert.ok(pro.body.count >= starter.body.count);
  });
});

// ── Modules – resolve ─────────────────────────────────────────────────────
describe("GET /modules/resolve", () => {
  test("resolves express for starter", async () => {
    const { status, body } = await req("GET", "/modules/resolve?name=express", {
      headers: { "X-QAPi-Key": "qapi-starter-demo-key" },
    });
    assert.equal(status, 200);
    assert.equal(body.resolved, true);
    assert.equal(body.name, "express");
    assert.ok(body.entrypoint);
  });

  test("returns 404 for unknown module", async () => {
    const { status } = await req("GET", "/modules/resolve?name=totally-unknown-xyz", {
      headers: { "X-QAPi-Key": "qapi-starter-demo-key" },
    });
    assert.equal(status, 404);
  });

  test("starter cannot resolve pro-tier module", async () => {
    const { status, body } = await req("GET", "/modules/resolve?name=@qapi/vps-module-alpha", {
      headers: { "X-QAPi-Key": "qapi-starter-demo-key" },
    });
    assert.equal(status, 403);
    assert.equal(body.code, "RESOLVE_TIER_INSUFFICIENT");
  });

  test("pro can resolve pro-tier module", async () => {
    const { status, body } = await req("GET", "/modules/resolve?name=@qapi/vps-module-alpha", {
      headers: { "X-QAPi-Key": "qapi-pro-demo-key" },
    });
    assert.equal(status, 200);
    assert.equal(body.resolved, true);
  });

  test("returns 400 when name is missing", async () => {
    const { status } = await req("GET", "/modules/resolve", {
      headers: { "X-QAPi-Key": "qapi-starter-demo-key" },
    });
    assert.equal(status, 400);
  });
});

// ── Audit ─────────────────────────────────────────────────────────────────
describe("GET /audit – tier guard", () => {
  test("starter tier cannot access audit scan", async () => {
    const { status, body } = await req("GET", "/audit/scan?name=express", {
      headers: { "X-QAPi-Key": "qapi-starter-demo-key" },
    });
    assert.equal(status, 403);
    assert.equal(body.code, "AUTH_TIER_INSUFFICIENT");
  });

  test("audited tier can scan a module", async () => {
    const { status, body } = await req("GET", "/audit/scan?name=express", {
      headers: { "X-QAPi-Key": "qapi-audited-demo-key" },
    });
    assert.equal(status, 200);
    assert.ok(typeof body.audit.score === "number");
    assert.ok(typeof body.audit.passed === "boolean");
  });

  test("audited tier can get audit report", async () => {
    const { status, body } = await req("GET", "/audit/report", {
      headers: { "X-QAPi-Key": "qapi-audited-demo-key" },
    });
    assert.equal(status, 200);
    assert.ok(body.summary.total >= 1);
    assert.ok(Array.isArray(body.modules));
  });
});

// ── Metrics ───────────────────────────────────────────────────────────────
describe("GET /metrics", () => {
  test("returns operational snapshot without auth", async () => {
    const { status, body } = await req("GET", "/metrics");
    assert.equal(status, 200);
    assert.ok(typeof body.resolvesLastMin === "number");
    assert.ok(typeof body.moduleCount === "number");
    assert.ok(typeof body.avgAuditScore === "number");
    assert.ok(Array.isArray(body.modules));
    assert.ok(Array.isArray(body.tiers));
    assert.ok(body.service.status === "ok");
  });
});

describe("GET /metrics/logs", () => {
  test("returns log ring buffer without auth", async () => {
    const { status, body } = await req("GET", "/metrics/logs");
    assert.equal(status, 200);
    assert.ok(typeof body.count === "number");
    assert.ok(Array.isArray(body.logs));
  });
});

// ── 404 fallback ──────────────────────────────────────────────────────────
describe("404 fallback", () => {
  test("returns 404 for unknown routes", async () => {
    const { status } = await req("GET", "/this-does-not-exist");
    assert.equal(status, 404);
  });
});
