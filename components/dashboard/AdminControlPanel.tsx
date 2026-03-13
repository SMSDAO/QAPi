"use client";
/**
 * components/dashboard/AdminControlPanel.tsx
 *
 * Admin Control Panel component for QAPi (Audited-tier only).
 * Includes sections for: user management, system health, tier allocation,
 * audit logs, database monitor, and rate limit configuration.
 *
 * Note: All data is fetched from the QAPi REST API. Mutation stubs are
 * provided but left unimplemented pending backend endpoints.
 */

import React, { useState } from "react";
import { SubscriptionTier, SUBSCRIPTION_FEATURES } from "../../apps/core/lib/subscription-tiers.js";
import { formatNumber, formatPercent, timeAgo } from "./utils.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminControlPanelProps {
  viewerTier: SubscriptionTier;
}

interface UserRecord {
  id: string;
  email: string;
  tier: SubscriptionTier;
  createdAt: string;
  callsToday: number;
}

interface HealthStatus {
  service: string;
  status: "ok" | "warn" | "error";
  latencyMs?: number;
  note?: string;
}

interface AuditLogEntry {
  id: string;
  ts: string;
  actor: string;
  action: string;
  resource: string;
  outcome: "allow" | "deny";
}

// ── Stubs ─────────────────────────────────────────────────────────────────────

const MOCK_USERS: UserRecord[] = [
  { id: "u1", email: "alice@example.com", tier: SubscriptionTier.Audited, createdAt: "2025-01-15T10:00:00Z", callsToday: 1200 },
  { id: "u2", email: "bob@example.com",   tier: SubscriptionTier.Pro,     createdAt: "2025-03-01T08:00:00Z", callsToday: 340  },
  { id: "u3", email: "carol@example.com", tier: SubscriptionTier.Starter, createdAt: "2025-06-10T14:00:00Z", callsToday: 55   },
];

const MOCK_HEALTH: HealthStatus[] = [
  { service: "API",       status: "ok",   latencyMs: 12  },
  { service: "Redis",     status: "ok",   latencyMs: 1   },
  { service: "Postgres",  status: "ok",   latencyMs: 5   },
  { service: "S3",        status: "warn", latencyMs: 280, note: "Elevated latency" },
  { service: "Prometheus",status: "ok"   },
];

const MOCK_AUDIT: AuditLogEntry[] = [
  { id: "a1", ts: new Date(Date.now() - 60_000).toISOString(),  actor: "alice@example.com", action: "key.rotate",    resource: "qapi-audited-…xyz", outcome: "allow" },
  { id: "a2", ts: new Date(Date.now() - 300_000).toISOString(), actor: "bob@example.com",   action: "module.resolve", resource: "express",          outcome: "allow" },
  { id: "a3", ts: new Date(Date.now() - 900_000).toISOString(), actor: "carol@example.com", action: "tier.upgrade",   resource: "pro",              outcome: "allow" },
  { id: "a4", ts: new Date(Date.now() - 3_600_000).toISOString(),actor: "unknown",          action: "auth.login",    resource: "API",              outcome: "deny"  },
];

// ── Sub-sections ──────────────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-700 pb-2 mb-4">
      <span className="text-lg">{icon}</span>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{title}</h3>
    </div>
  );
}

function PanelCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-700 bg-gray-800 p-4 ${className}`}>
      {children}
    </div>
  );
}

// ── User Management ───────────────────────────────────────────────────────────

function UserManagement() {
  const [search, setSearch] = useState("");
  const filtered = MOCK_USERS.filter(
    (u) => u.email.includes(search) || u.tier.includes(search)
  );

  return (
    <PanelCard>
      <SectionHeader title="User Management" icon="👥" />
      <input
        className="mb-3 w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-indigo-500"
        placeholder="Search by email or tier…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="pb-2 font-medium">Email</th>
            <th className="pb-2 font-medium">Tier</th>
            <th className="pb-2 font-medium">Calls today</th>
            <th className="pb-2 font-medium">Joined</th>
            <th className="pb-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((u) => (
            <tr key={u.id} className="border-t border-gray-700/50">
              <td className="py-2 text-gray-200">{u.email}</td>
              <td className="py-2">
                <span className="rounded bg-gray-700 px-1.5 py-0.5 font-mono">{u.tier}</span>
              </td>
              <td className="py-2 text-gray-300">{formatNumber(u.callsToday)}</td>
              <td className="py-2 text-gray-500">{timeAgo(u.createdAt)}</td>
              <td className="py-2">
                <button className="mr-2 rounded bg-indigo-700/50 px-2 py-0.5 text-indigo-300 hover:bg-indigo-700 transition-colors">
                  Edit
                </button>
                <button className="rounded bg-red-900/40 px-2 py-0.5 text-red-400 hover:bg-red-900/70 transition-colors">
                  Suspend
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelCard>
  );
}

// ── System Health ─────────────────────────────────────────────────────────────

function SystemHealth() {
  const statusIcon: Record<HealthStatus["status"], string> = {
    ok: "✅",
    warn: "⚠️",
    error: "❌",
  };

  return (
    <PanelCard>
      <SectionHeader title="System Health" icon="💓" />
      <div className="space-y-2">
        {MOCK_HEALTH.map((h) => (
          <div key={h.service} className="flex items-center justify-between rounded-lg bg-gray-700/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <span>{statusIcon[h.status]}</span>
              <span className="font-medium text-gray-200 text-xs">{h.service}</span>
              {h.note && <span className="text-gray-500 text-xs">({h.note})</span>}
            </div>
            {h.latencyMs !== undefined && (
              <span className="font-mono text-xs text-gray-400">{h.latencyMs}ms</span>
            )}
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

// ── Tier Allocation ───────────────────────────────────────────────────────────

function TierAllocation() {
  const totals = MOCK_USERS.reduce<Record<string, number>>((acc, u) => {
    acc[u.tier] = (acc[u.tier] ?? 0) + 1;
    return acc;
  }, {});
  const total = MOCK_USERS.length;

  return (
    <PanelCard>
      <SectionHeader title="Tier Allocation" icon="📊" />
      <div className="space-y-3">
        {Object.values(SubscriptionTier).map((tier) => {
          const count = totals[tier] ?? 0;
          const pct = total > 0 ? count / total : 0;
          const features = SUBSCRIPTION_FEATURES[tier];
          return (
            <div key={tier}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-gray-300">{features.displayName}</span>
                <span className="text-gray-500">{count} users · {formatPercent(pct)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </PanelCard>
  );
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

function AuditLogs() {
  return (
    <PanelCard>
      <SectionHeader title="Audit Logs" icon="📋" />
      <div className="space-y-1">
        {MOCK_AUDIT.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 rounded-lg bg-gray-700/30 px-3 py-2 text-xs">
            <span className={entry.outcome === "allow" ? "text-green-400" : "text-red-400"}>
              {entry.outcome === "allow" ? "✔" : "✘"}
            </span>
            <span className="font-mono text-gray-400">{timeAgo(entry.ts)}</span>
            <span className="text-gray-300 font-medium">{entry.actor}</span>
            <span className="text-indigo-400">{entry.action}</span>
            <span className="truncate text-gray-500">{entry.resource}</span>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

// ── DB Monitor (stub) ─────────────────────────────────────────────────────────

function DbMonitor() {
  return (
    <PanelCard>
      <SectionHeader title="Database Monitor" icon="🗄️" />
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active connections", value: "12 / 100" },
          { label: "Query time (avg)", value: "4ms" },
          { label: "Cache hit ratio", value: formatPercent(0.94) },
          { label: "Replication lag", value: "0ms" },
          { label: "Pending migrations", value: "0" },
          { label: "Table size", value: "1.2 GB" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-gray-700/40 px-3 py-2">
            <p className="text-[10px] text-gray-500">{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-200">{value}</p>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

// ── Rate Limits ───────────────────────────────────────────────────────────────

function RateLimits() {
  return (
    <PanelCard>
      <SectionHeader title="Rate Limits" icon="⏱️" />
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="pb-2 font-medium">Tier</th>
            <th className="pb-2 font-medium">Limit (calls/min)</th>
            <th className="pb-2 font-medium">Max parallel builds</th>
            <th className="pb-2 font-medium">SLA</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(SubscriptionTier).map((tier) => {
            const f = SUBSCRIPTION_FEATURES[tier];
            return (
              <tr key={tier} className="border-t border-gray-700/50">
                <td className="py-2 font-medium text-gray-200">{f.displayName}</td>
                <td className="py-2 text-gray-300">{f.callsPerMinute ?? "Unlimited"}</td>
                <td className="py-2 text-gray-300">{f.maxParallelBuilds ?? "Unlimited"}</td>
                <td className="py-2 text-gray-400">{f.sla}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PanelCard>
  );
}

// ── AdminControlPanel ─────────────────────────────────────────────────────────

/**
 * AdminControlPanel
 *
 * Full admin interface, gated to Audited-tier viewers.
 * Shows an upgrade prompt for lower-tier callers.
 */
export function AdminControlPanel({ viewerTier }: AdminControlPanelProps) {
  if (viewerTier !== SubscriptionTier.Audited) {
    return (
      <div className="rounded-xl border border-dashed border-gray-600 bg-gray-800/50 p-8 text-center">
        <p className="text-2xl mb-2">🔒</p>
        <p className="font-medium text-gray-200">Admin Panel requires the Audited tier</p>
        <p className="mt-1 text-xs text-gray-500">
          Contact <a href="mailto:sales@qapi.dev" className="text-indigo-400 underline">sales@qapi.dev</a> to upgrade.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 text-sm">
      <h2 className="text-xl font-semibold text-white">Admin Control Panel</h2>
      <div className="grid gap-6 md:grid-cols-2">
        <UserManagement />
        <SystemHealth />
        <TierAllocation />
        <AuditLogs />
        <DbMonitor />
        <RateLimits />
      </div>
    </div>
  );
}

export default AdminControlPanel;
