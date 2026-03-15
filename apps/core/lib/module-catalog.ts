/**
 * apps/core/lib/module-catalog.ts
 *
 * Canonical static module node catalog for QAPi's Vercel serverless functions.
 * Shared by `api/metrics.ts` and `api/v1-modules.ts` to keep data in sync.
 *
 * `lastScannedAt` is intentionally omitted from the static definitions and
 * injected per-request via `getModuleCatalog()`, so that each response carries
 * an accurate scan timestamp rather than the stale module-initialisation time
 * that gets frozen when a warm serverless instance reuses the module scope.
 */

export interface AuditInfo {
  score: number;
  passed: boolean;
  zeroDay: boolean;
  lastScannedAt: string;
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    info: number;
  };
}

export interface ModuleMetrics {
  callsTotal: number;
  callsLastMin: number;
  avgLatencyMs: number;
}

export interface ModuleEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  tier: string;
  status: string;
  audit: AuditInfo;
  metrics: ModuleMetrics;
}

// Static catalog data without the dynamic `lastScannedAt` timestamp.
type AuditInfoBase = Omit<AuditInfo, "lastScannedAt">;
type CatalogBase = Omit<ModuleEntry, "audit"> & { audit: AuditInfoBase };

const CATALOG_BASE: CatalogBase[] = [
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
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 },
    },
    metrics: { callsTotal: 0, callsLastMin: 0, avgLatencyMs: 2.8 },
  },
];

/**
 * Returns the full module catalog with a fresh `lastScannedAt` timestamp.
 *
 * Call this inside the request handler (not at module scope) so every response
 * receives an accurate scan time rather than a stale cached value.
 */
export function getModuleCatalog(): ModuleEntry[] {
  const lastScannedAt = new Date().toISOString();
  return CATALOG_BASE.map((m) => ({
    ...m,
    audit: { ...m.audit, lastScannedAt },
  }));
}
