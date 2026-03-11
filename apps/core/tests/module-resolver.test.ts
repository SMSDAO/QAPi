// apps/core – module-resolver unit tests (Node.js built-in test runner)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseGhModuleId,
  parseBlobModuleId,
  ghRawUrl,
  blobUrl,
} from "../lib/module-resolver.ts";

const VALID_SHA = "a".repeat(40);

// ── parseGhModuleId ────────────────────────────────────────────────────────
describe("parseGhModuleId", () => {
  test("parses a valid gh: module id", () => {
    const result = parseGhModuleId(`gh:owner/repo@${VALID_SHA}:src/index.js`);
    assert.deepEqual(result, {
      owner: "owner",
      repo: "repo",
      sha: VALID_SHA,
      filePath: "src/index.js",
    });
  });

  test("parses nested file paths", () => {
    const result = parseGhModuleId(`gh:org/lib@${VALID_SHA}:dist/esm/index.js`);
    assert.ok(result);
    assert.equal(result.filePath, "dist/esm/index.js");
  });

  test("returns null for non-gh: prefix", () => {
    assert.equal(parseGhModuleId(`npm:express@4.18.2`), null);
  });

  test("returns null when sha is not 40 hex chars", () => {
    assert.equal(parseGhModuleId("gh:owner/repo@abc123:index.js"), null);
  });

  test("returns null for path traversal in filePath", () => {
    assert.equal(parseGhModuleId(`gh:owner/repo@${VALID_SHA}:../etc/passwd`), null);
  });

  test("returns null for absolute filePath", () => {
    assert.equal(parseGhModuleId(`gh:owner/repo@${VALID_SHA}:/etc/passwd`), null);
  });

  test("returns null for backslash in filePath", () => {
    assert.equal(parseGhModuleId(`gh:owner/repo@${VALID_SHA}:src\\index.js`), null);
  });

  test("returns null for missing filePath", () => {
    assert.equal(parseGhModuleId(`gh:owner/repo@${VALID_SHA}:`), null);
  });

  test("returns null for empty string", () => {
    assert.equal(parseGhModuleId(""), null);
  });
});

// ── parseBlobModuleId ──────────────────────────────────────────────────────
describe("parseBlobModuleId", () => {
  test("parses a valid blob: module id", () => {
    const result = parseBlobModuleId("blob:libs/util.js");
    assert.deepEqual(result, { path: "libs/util.js" });
  });

  test("returns null for non-blob: prefix", () => {
    assert.equal(parseBlobModuleId("gh:owner/repo@abc:file.js"), null);
  });

  test("returns null for path traversal", () => {
    assert.equal(parseBlobModuleId("blob:../../../etc/passwd"), null);
  });

  test("returns null for absolute path", () => {
    assert.equal(parseBlobModuleId("blob:/etc/passwd"), null);
  });

  test("returns null for backslash path", () => {
    assert.equal(parseBlobModuleId("blob:..\\evil"), null);
  });

  test("returns null for empty string", () => {
    assert.equal(parseBlobModuleId(""), null);
  });
});

// ── ghRawUrl ──────────────────────────────────────────────────────────────
describe("ghRawUrl", () => {
  test("builds a correct raw.githubusercontent.com URL", () => {
    const url = ghRawUrl("expressjs", "express", VALID_SHA, "index.js");
    assert.equal(
      url,
      `https://raw.githubusercontent.com/expressjs/express/${VALID_SHA}/index.js`
    );
  });

  test("handles nested file paths", () => {
    const url = ghRawUrl("org", "lib", VALID_SHA, "src/core/index.js");
    assert.ok(url.endsWith("/src/core/index.js"));
  });
});

// ── blobUrl ────────────────────────────────────────────────────────────────
describe("blobUrl", () => {
  test("returns null when QAPI_BLOB_BASE_URL is not set", () => {
    delete process.env.QAPI_BLOB_BASE_URL;
    assert.equal(blobUrl("libs/util.js"), null);
  });

  test("builds correct URL when base URL is configured", () => {
    process.env.QAPI_BLOB_BASE_URL = "https://blobs.qapi.dev";
    const url = blobUrl("libs/util.js");
    assert.equal(url, "https://blobs.qapi.dev/libs/util.js");
    delete process.env.QAPI_BLOB_BASE_URL;
  });

  test("strips trailing slash from base URL", () => {
    process.env.QAPI_BLOB_BASE_URL = "https://blobs.qapi.dev/";
    const url = blobUrl("a/b.js");
    assert.equal(url, "https://blobs.qapi.dev/a/b.js");
    delete process.env.QAPI_BLOB_BASE_URL;
  });

  test("URI-encodes spaces in path", () => {
    process.env.QAPI_BLOB_BASE_URL = "https://blobs.qapi.dev";
    const url = blobUrl("my module/index.js");
    assert.ok(url?.includes("my%20module"));
    delete process.env.QAPI_BLOB_BASE_URL;
  });
});
