import { parseBearerToken, tierFromToken, redactToken, type Tier } from "../lib/tier-manager.js";

const ALLOWED_ORIGINS = new Set(["https://qapi.github.io", "http://localhost:3000"]);
const SHA40_RE = /^[0-9a-f]{40}$/i;

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://qapi.github.io";

  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, X-QAPI-Mode, Content-Type, If-None-Match",
    "Vary": "Origin"
  };
}

function jsHeaders(extra: Record<string, string> = {}) {
  return {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    ...extra
  };
}

function auditLog(entry: Record<string, unknown>) {
  console.log(JSON.stringify(entry));
}

function parseGhModuleId(id: string) {
  const m = id.match(/^gh:([^\/\s]+)\/([^@\s]+)@([^:\s]+):(.+)$/);
  if (!m) return null;

  const [, owner, repo, ref, filePath] = m;

  if (!SHA40_RE.test(ref)) return null;
  if (!filePath || filePath.includes("..") || filePath.startsWith("/") || filePath.includes("\\")) return null;

  return { owner, repo, sha: ref, filePath };
}

function parseBlobModuleId(id: string) {
  const m = id.match(/^blob:(.+)$/);
  if (!m) return null;

  const path = m[1].trim();
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) return null;

  return { path };
}

function ghRawUrl(owner: string, repo: string, sha: string, filePath: string) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${filePath}`;
}

function blobUrl(path: string) {
  const base = (process.env.QAPI_BLOB_BASE_URL || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/${encodeURI(path)}`;
}

export default async function handler(req: Request): Promise<Response> {
  const started = Date.now();
  const url = new URL(req.url);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders(req) });

  const token = parseBearerToken(req.headers.get("authorization"));
  if (!token) return new Response("Missing Authorization: Bearer <TOKEN>", { status: 401, headers: corsHeaders(req) });

  const tier: Tier = tierFromToken(token);

  const moduleId = url.searchParams.get("module")?.trim() || "";
  if (!moduleId) return new Response("Missing query param: module", { status: 400, headers: corsHeaders(req) });

  const gh = parseGhModuleId(moduleId);
  const bl = parseBlobModuleId(moduleId);

  const upstream =
    gh ? ghRawUrl(gh.owner, gh.repo, gh.sha, gh.filePath)
    : bl ? blobUrl(bl.path)
    : null;

  if (!upstream) {
    return new Response("Invalid module id. Use gh:OWNER/REPO@<40-hex-sha>:PATH or blob:PATH", {
      status: 400,
      headers: corsHeaders(req)
    });
  }

  const ifNoneMatch = req.headers.get("if-none-match") || undefined;

  const upstreamRes = await fetch(upstream, {
    method: "GET",
    headers: { ...(ifNoneMatch ? { "If-None-Match": ifNoneMatch } : {}) }
  });

  const etag = upstreamRes.headers.get("etag") || "";

  if (upstreamRes.status === 304) {
    const headers = {
      ...corsHeaders(req),
      ...jsHeaders({
        ...(etag ? { "ETag": etag } : {}),
        "Vary": "Origin, If-None-Match"
      })
    };

    if (tier === "audited") {
      auditLog({
        ts: new Date().toISOString(),
        event: "audit",
        tier,
        token: redactToken(token),
        module: moduleId,
        upstream,
        status: 304,
        latencyMs: Date.now() - started,
        cache: "not-modified"
      });
    }

    return new Response(null, { status: 304, headers });
  }

  if (!upstreamRes.ok) {
    const text = await upstreamRes.text().catch(() => "");
    return new Response(`Upstream error (${upstreamRes.status})\n${text}`.slice(0, 4000), {
      status: 502,
      headers: corsHeaders(req)
    });
  }

  const body = await upstreamRes.text();

  const headers = {
    ...corsHeaders(req),
    ...jsHeaders({
      ...(etag ? { "ETag": etag } : {}),
      "Vary": "Origin, If-None-Match"
    })
  };

  if (tier === "audited") {
    auditLog({
      ts: new Date().toISOString(),
      event: "audit",
      tier,
      token: redactToken(token),
      module: moduleId,
      upstream,
      status: 200,
      bytes: body.length,
      latencyMs: Date.now() - started
    });
  }

  return new Response(body, { status: 200, headers });
}