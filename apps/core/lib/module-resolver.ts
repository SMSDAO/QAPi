/**
 * Shared module-ID parsing and upstream URL construction.
 *
 * Used by:
 *   - apps/core/api/resolve.ts  (Vercel serverless handler)
 *   - api/src/routes/modules.js (Express stream endpoint)
 *
 * Both the runtime and the test suite import the same compiled CJS build
 * so parsing semantics are guaranteed to be identical.
 */

const SHA40_RE = /^[0-9a-f]{40}$/i;

export interface GhModuleRef {
  owner: string;
  repo: string;
  sha: string;
  filePath: string;
}

export interface BlobModuleRef {
  path: string;
}

/**
 * Parses a `gh:OWNER/REPO@<40-hex-sha>:FILEPATH` module ID.
 * Returns null for any malformed or potentially unsafe input.
 */
export function parseGhModuleId(id: string): GhModuleRef | null {
  const m = id.match(/^gh:([^/\s]+)\/([^@\s]+)@([^:\s]+):(.+)$/);
  if (!m) return null;

  const [, owner, repo, ref, filePath] = m;

  if (!SHA40_RE.test(ref)) return null;
  if (!filePath || filePath.includes("..") || filePath.startsWith("/") || filePath.includes("\\")) return null;

  return { owner, repo, sha: ref, filePath };
}

/**
 * Parses a `blob:PATH` module ID.
 * Returns null for any malformed or path-traversal input.
 */
export function parseBlobModuleId(id: string): BlobModuleRef | null {
  const m = id.match(/^blob:(.+)$/);
  if (!m) return null;

  const blobPath = m[1].trim();
  if (!blobPath || blobPath.includes("..") || blobPath.startsWith("/") || blobPath.includes("\\")) return null;

  return { path: blobPath };
}

/**
 * Builds the raw.githubusercontent.com URL for a pinned file.
 * The sha MUST be a full 40-character commit SHA (enforced by parseGhModuleId).
 */
export function ghRawUrl(owner: string, repo: string, sha: string, filePath: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${filePath}`;
}

/**
 * Builds the blob-storage URL for a path, using the QAPI_BLOB_BASE_URL env var.
 * Returns null when the env var is not configured.
 * Each path segment is encoded with encodeURIComponent so that characters
 * like `#` and `?` that are not encoded by encodeURI are handled correctly.
 */
export function blobUrl(blobPath: string): string | null {
  const base = (process.env.QAPI_BLOB_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  const encoded = blobPath.split("/").map(encodeURIComponent).join("/");
  return `${base}/${encoded}`;
}
