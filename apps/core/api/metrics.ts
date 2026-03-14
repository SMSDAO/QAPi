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
import { corsHeaders, jsonResponse } from "../lib/serverless-utils.js";
import { getModuleCatalog } from "../lib/module-catalog.js";

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
  const cors = corsHeaders(req, "GET,OPTIONS");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "GET") {
    return jsonResponse(
      { error: "Method Not Allowed", code: "METHOD_NOT_ALLOWED" },
      405,
      cors
    );
  }

  // getModuleCatalog() is called inside the handler so each request receives
  // a fresh lastScannedAt timestamp rather than the stale module-load value.
  const modules = getModuleCatalog();
  const activeModules = modules.filter((m) => m.status === "active");
  const avgAuditScore =
    activeModules.length > 0
      ? Math.round(
          activeModules.reduce((s, m) => s + m.audit.score, 0) /
            activeModules.length
        )
      : 0;

  return jsonResponse(
    {
      generatedAt: new Date().toISOString(),
      service: { status: "ok" },
      tiers: TIERS,
      resolvesLastMin: 0,
      tierCallCounts: { starter: 0, pro: 0, audited: 0 },
      moduleCount: modules.length,
      avgAuditScore,
      modules,
    },
    200,
    {
      ...cors,
      "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
    }
  );
}
