/**
 * apps/core/api/metrics.ts
 *
 * Vercel serverless function: GET /metrics
 *
 * Returns a public operational snapshot of the QAPi service:
 * module node catalog, per-tier config, and aggregate audit scores.
 * No authentication required — used by the dashboard for live polling.
 */

import { SUBSCRIPTION_FEATURES } from "../lib/subscription-tiers.js";

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
    "Access-Control-Allow-Methods": "GET,OPTIONS",
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
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
      ...extra,
    },
  });
}

// ── Static module node catalog (mirrors api/src/data/moduleStore.js seeds) ──

const MODULES = [
  {
    id: "mod-express",
    name: "express",
    version: "4.18.2",
    description: "Fast web framework for Node.js",
    tier: "starter",
    status: "active",
    audit: {
      score: 98,
      passed: true,
      zeroDay: false,
      lastScannedAt: new Date().toISOString(),
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 1, info: 2 },
    },
    metrics: { callsTotal: 5_000_000, callsLastMin: 0, avgLatencyMs: 4.2 },
  },
  {
    id: "mod-lodash",
    name: "lodash",
    version: "4.17.21",
    description: "A modern JavaScript utility library",
    tier: "starter",
    status: "active",
    audit: {
      score: 95,
      passed: true,
      zeroDay: false,
      lastScannedAt: new Date().toISOString(),
      vulnerabilities: { critical: 0, high: 0, moderate: 1, low: 2, info: 0 },
    },
    metrics: { callsTotal: 3_200_000, callsLastMin: 0, avgLatencyMs: 3.1 },
  },
  {
    id: "mod-vps-alpha",
    name: "@solanar/vps-module-alpha",
    version: "1.0.0",
    description: "Private VPS-hosted module (Pro tier)",
    tier: "pro",
    status: "active",
    audit: {
      score: 100,
      passed: true,
      zeroDay: false,
      lastScannedAt: new Date().toISOString(),
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 },
    },
    metrics: { callsTotal: 0, callsLastMin: 0, avgLatencyMs: 2.8 },
  },
];

const TIERS = [
  {
    name: "starter",
    price: SUBSCRIPTION_FEATURES.starter.price,
    callsPerMin: SUBSCRIPTION_FEATURES.starter.callsPerMinute,
    maxParallelBuilds: SUBSCRIPTION_FEATURES.starter.maxParallelBuilds,
  },
  {
    name: "pro",
    price: SUBSCRIPTION_FEATURES.pro.price,
    callsPerMin: SUBSCRIPTION_FEATURES.pro.callsPerMinute,
    maxParallelBuilds: SUBSCRIPTION_FEATURES.pro.maxParallelBuilds,
  },
  {
    name: "audited",
    price: SUBSCRIPTION_FEATURES.audited.price,
    callsPerMin: SUBSCRIPTION_FEATURES.audited.callsPerMinute,
    maxParallelBuilds: SUBSCRIPTION_FEATURES.audited.maxParallelBuilds,
  },
];

export default async function handler(req: Request): Promise<Response> {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "GET") {
    return json({ error: "Method Not Allowed", code: "METHOD_NOT_ALLOWED" }, 405, cors);
  }

  const activeModules = MODULES.filter((m) => m.status === "active");
  const avgAuditScore =
    activeModules.length > 0
      ? Math.round(
          activeModules.reduce((s, m) => s + m.audit.score, 0) /
            activeModules.length
        )
      : 0;

  return json(
    {
      generatedAt: new Date().toISOString(),
      service: { status: "ok" },
      tiers: TIERS,
      resolvesLastMin: 0,
      tierCallCounts: { starter: 0, pro: 0, audited: 0 },
      moduleCount: MODULES.length,
      avgAuditScore,
      modules: MODULES,
    },
    200,
    cors
  );
}
