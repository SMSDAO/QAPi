// apps/core – resolve handler unit tests (Node.js built-in test runner)
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// ── Helpers ──────────────────────────────────────────────────────────────

const VALID_SHA = "a".repeat(40);
const ALLOWED_ORIGIN = "https://qapi-omega.vercel.app";
const LOCALHOST_ORIGIN = "http://localhost:3000";
const FOREIGN_ORIGIN = "https://evil.example.com";

function makeRequest(
  url: string,
  {
    method = "GET",
    headers = {},
  }: { method?: string; headers?: Record<string, string> } = {}
): Request {
  return new Request(url, { method, headers });
}

// Minimal mock fetch that returns a 200 JS response
function mockFetch200(body = "export default 42;", etag?: string) {
  const responseHeaders: Record<string, string> = {
    "Content-Type": "application/javascript",
  };
  if (etag) responseHeaders["ETag"] = etag;
  return async (_url: string) =>
    new Response(body, { status: 200, headers: responseHeaders });
}

function mockFetch304(etag = '"abc"') {
  return async (_url: string) =>
    new Response(null, { status: 304, headers: { ETag: etag } });
}

function mockFetch404() {
  return async (_url: string) =>
    new Response("not found", { status: 404 });
}

// We dynamically import the handler fresh for each suite that needs to swap
// the global fetch mock, so this helper keeps it clean.
let handler: (req: Request) => Promise<Response>;

// Store the original fetch so it can be restored
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  // Reset env var
  delete process.env.QAPI_BLOB_BASE_URL;
  // Re-import handler each test (Node caches modules, so we always use the
  // same module instance — that's fine; we only mock `globalThis.fetch`).
  const mod = await import("../api/resolve.ts");
  handler = mod.default;
});

afterEach(() => {
  // Restore global fetch
  (globalThis as Record<string, unknown>).fetch = originalFetch;
});

// ── OPTIONS (preflight) ──────────────────────────────────────────────────
describe("OPTIONS /api/resolve", () => {
  test("returns 204 with CORS headers", async () => {
    const req = makeRequest("https://qapi.vercel.app/api/resolve", {
      method: "OPTIONS",
      headers: { origin: ALLOWED_ORIGIN },
    });
    const res = await handler(req);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN);
    assert.ok(res.headers.get("Access-Control-Allow-Methods")?.includes("GET"));
  });
});

// ── Method Not Allowed ────────────────────────────────────────────────────
describe("Non-GET request", () => {
  test("POST returns 405", async () => {
    const req = makeRequest("https://qapi.vercel.app/api/resolve", {
      method: "POST",
      headers: { authorization: "Bearer qapi-starter-tok" },
    });
    const res = await handler(req);
    assert.equal(res.status, 405);
  });

  test("DELETE returns 405", async () => {
    const req = makeRequest("https://qapi.vercel.app/api/resolve", {
      method: "DELETE",
      headers: { authorization: "Bearer qapi-pro-tok" },
    });
    const res = await handler(req);
    assert.equal(res.status, 405);
  });
});

// ── Authorization ─────────────────────────────────────────────────────────
describe("Authorization", () => {
  test("missing Authorization header returns 401", async () => {
    const req = makeRequest("https://qapi.vercel.app/api/resolve?module=foo");
    const res = await handler(req);
    assert.equal(res.status, 401);
  });
});

// ── Missing module param ──────────────────────────────────────────────────
describe("module query param", () => {
  test("missing module param returns 400", async () => {
    const req = makeRequest("https://qapi.vercel.app/api/resolve", {
      headers: { authorization: "Bearer qapi-starter-demo" },
    });
    const res = await handler(req);
    assert.equal(res.status, 400);
    assert.ok((await res.text()).includes("module"));
  });

  test("empty module param returns 400", async () => {
    const req = makeRequest("https://qapi.vercel.app/api/resolve?module=", {
      headers: { authorization: "Bearer qapi-starter-demo" },
    });
    const res = await handler(req);
    assert.equal(res.status, 400);
  });
});

// ── SHA-only enforcement ──────────────────────────────────────────────────
describe("SHA-only module id enforcement", () => {
  test("branch name ref is rejected with 400", async () => {
    const moduleId = "gh:owner/repo@main:src/index.js";
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.ok(text.includes("40-hex-sha"), `expected hint in body, got: ${text}`);
  });

  test("tag ref (vX.Y.Z) is rejected with 400", async () => {
    const moduleId = "gh:owner/repo@v1.2.3:src/index.js";
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 400);
  });

  test("39-char hex ref is rejected (too short)", async () => {
    const shortSha = "a".repeat(39);
    const moduleId = `gh:owner/repo@${shortSha}:src/index.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 400);
  });

  test("41-char hex ref is rejected (too long)", async () => {
    const longSha = "a".repeat(41);
    const moduleId = `gh:owner/repo@${longSha}:src/index.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 400);
  });

  test("valid 40-char SHA is accepted and proxied", async () => {
    (globalThis as Record<string, unknown>).fetch = mockFetch200("export default 1;");
    const moduleId = `gh:owner/repo@${VALID_SHA}:src/index.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "export default 1;");
  });
});

// ── Path traversal prevention ─────────────────────────────────────────────
describe("Path traversal prevention", () => {
  test("gh module with .. in path is rejected", async () => {
    const moduleId = `gh:owner/repo@${VALID_SHA}:../secret.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 400);
  });

  test("gh module with absolute path is rejected", async () => {
    const moduleId = `gh:owner/repo@${VALID_SHA}:/etc/passwd`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 400);
  });

  test("blob module with .. in path is rejected", async () => {
    process.env.QAPI_BLOB_BASE_URL = "https://blob.example.com";
    const moduleId = "blob:../../secret.js";
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 400);
  });
});

// ── Upstream proxying ─────────────────────────────────────────────────────
describe("Upstream proxying (gh: module)", () => {
  test("returns 200 with JS body and correct Content-Type", async () => {
    (globalThis as Record<string, unknown>).fetch = mockFetch200("export const x = 1;");
    const moduleId = `gh:foo/bar@${VALID_SHA}:lib/mod.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("Content-Type")?.includes("application/javascript"));
    assert.equal(await res.text(), "export const x = 1;");
  });

  test("returns 200 with ETag when upstream provides it", async () => {
    (globalThis as Record<string, unknown>).fetch = mockFetch200("export default true;", '"etag123"');
    const moduleId = `gh:foo/bar@${VALID_SHA}:index.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("ETag"), '"etag123"');
  });

  test("returns 304 when upstream returns 304", async () => {
    (globalThis as Record<string, unknown>).fetch = mockFetch304('"etag-abc"');
    const moduleId = `gh:foo/bar@${VALID_SHA}:index.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      {
        headers: {
          authorization: "Bearer qapi-starter-demo",
          "if-none-match": '"etag-abc"',
        },
      }
    );
    const res = await handler(req);
    assert.equal(res.status, 304);
  });

  test("returns 502 when upstream returns 404", async () => {
    (globalThis as Record<string, unknown>).fetch = mockFetch404();
    const moduleId = `gh:foo/bar@${VALID_SHA}:missing.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 502);
    assert.ok((await res.text()).includes("404"));
  });
});

// ── Blob module ───────────────────────────────────────────────────────────
describe("Blob module", () => {
  test("blob module with no QAPI_BLOB_BASE_URL returns 503", async () => {
    const moduleId = "blob:some/module.js";
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 503);
  });

  test("blob module with QAPI_BLOB_BASE_URL set is proxied", async () => {
    process.env.QAPI_BLOB_BASE_URL = "https://blob.example.com";
    (globalThis as Record<string, unknown>).fetch = mockFetch200("export default 'blob';");
    const moduleId = "blob:modules/foo.js";
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo" } }
    );
    const res = await handler(req);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "export default 'blob';");
  });
});

// ── CORS headers ──────────────────────────────────────────────────────────
describe("CORS headers", () => {
  test("allowed origin (qapi-omega.vercel.app) is echoed back", async () => {
    (globalThis as Record<string, unknown>).fetch = mockFetch200();
    const moduleId = `gh:foo/bar@${VALID_SHA}:a.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo", origin: ALLOWED_ORIGIN } }
    );
    const res = await handler(req);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN);
  });

  test("allowed origin (localhost:3000) is echoed back", async () => {
    (globalThis as Record<string, unknown>).fetch = mockFetch200();
    const moduleId = `gh:foo/bar@${VALID_SHA}:a.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo", origin: LOCALHOST_ORIGIN } }
    );
    const res = await handler(req);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), LOCALHOST_ORIGIN);
  });

  test("unknown origin falls back to qapi-omega.vercel.app", async () => {
    (globalThis as Record<string, unknown>).fetch = mockFetch200();
    const moduleId = `gh:foo/bar@${VALID_SHA}:a.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-demo", origin: FOREIGN_ORIGIN } }
    );
    const res = await handler(req);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), ALLOWED_ORIGIN);
  });
});

// ── Audit tier logging ────────────────────────────────────────────────────
describe("Audited tier logging", () => {
  test("audited token triggers console.log with audit entry on 200", async () => {
    (globalThis as Record<string, unknown>).fetch = mockFetch200("export default 99;");
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    const moduleId = `gh:foo/bar@${VALID_SHA}:index.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-audited-tok123456" } }
    );
    const res = await handler(req);
    console.log = origLog;

    assert.equal(res.status, 200);
    assert.equal(logs.length, 1);
    const entry = JSON.parse(logs[0]);
    assert.equal(entry.event, "audit");
    assert.equal(entry.tier, "audited");
    assert.equal(entry.status, 200);
    assert.ok(entry.token, "token field should be present");
    assert.ok(entry.ts, "timestamp should be present");
  });

  test("starter token does NOT trigger audit logging", async () => {
    (globalThis as Record<string, unknown>).fetch = mockFetch200("export default 1;");
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    const moduleId = `gh:foo/bar@${VALID_SHA}:index.js`;
    const req = makeRequest(
      `https://qapi.vercel.app/api/resolve?module=${encodeURIComponent(moduleId)}`,
      { headers: { authorization: "Bearer qapi-starter-tok" } }
    );
    await handler(req);
    console.log = origLog;

    assert.equal(logs.length, 0);
  });
});
