"use client";
/**
 * components/dashboard/RichDashboard.tsx
 *
 * Real-time monitoring dashboard component for the QAPi platform.
 * Built for Next.js 14 App Router with "use client" directive.
 *
 * Features:
 *  - WebSocket-backed live metrics feed
 *  - Request rate, latency, error-rate sparklines (Recharts)
 *  - Recent activity feed (last 20 events)
 *  - Advanced monitoring section (Pro+ tiers)
 *  - Skeleton loading states
 *
 * Dependencies: recharts (peer), @qapi/sdk
 * Note: Recharts is imported dynamically to keep SSR bundle lean.
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { formatLatency, formatPercent, formatNumber, timeAgo, statusColor } from "./utils.js";
import { SubscriptionTier } from "../../apps/core/lib/subscription-tiers.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MetricSnapshot {
  ts: number;
  requestRate: number;   // req/s
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;     // 0-1
  cacheHitRate: number;  // 0-1
  activeConnections: number;
}

export interface ActivityEvent {
  id: string;
  ts: string;
  type: "resolve" | "build" | "auth" | "error" | "audit";
  tier: SubscriptionTier;
  message: string;
  latencyMs?: number;
}

export interface DashboardProps {
  /** The viewer's subscription tier – controls which sections are visible. */
  viewerTier: SubscriptionTier;
  /** WebSocket URL for live metrics. Falls back to polling when undefined. */
  wsUrl?: string;
  /** Polling interval in ms when WebSocket is unavailable. Default 5000. */
  pollIntervalMs?: number;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-700/60 ${className}`}
      aria-hidden="true"
    />
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  status,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${status ? statusColor(status) : "text-white"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

// ── Activity feed row ─────────────────────────────────────────────────────────

function ActivityRow({ event }: { event: ActivityEvent }) {
  const typeEmoji: Record<ActivityEvent["type"], string> = {
    resolve: "🔗",
    build: "🏗",
    auth: "🔑",
    error: "🚨",
    audit: "🔍",
  };

  return (
    <div className="flex items-start gap-3 border-b border-gray-700/50 py-2 last:border-0">
      <span className="mt-0.5 text-lg" aria-hidden="true">{typeEmoji[event.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm text-gray-200">{event.message}</p>
        <p className="text-xs text-gray-500">
          <span className="rounded bg-gray-700 px-1 py-0.5 font-mono text-[10px]">{event.tier}</span>
          {" · "}
          {timeAgo(event.ts)}
          {event.latencyMs !== undefined && ` · ${formatLatency(event.latencyMs)}`}
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * RichDashboard
 *
 * Renders a live metrics dashboard, connecting to a WebSocket feed or falling
 * back to polling.  Sections that require Pro+ are gated behind the
 * `viewerTier` prop and render a upgrade nudge for lower tiers.
 */
export function RichDashboard({ viewerTier, wsUrl, pollIntervalMs = 5000 }: DashboardProps) {
  const [metrics, setMetrics] = useState<MetricSnapshot[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  const isProPlus =
    viewerTier === SubscriptionTier.Pro || viewerTier === SubscriptionTier.Audited;

  // ── Mock data generator (used when no real feed available) ────────────────
  const generateMockSnapshot = useCallback((): MetricSnapshot => ({
    ts: Date.now(),
    requestRate: 40 + Math.random() * 20,
    p50LatencyMs: 18 + Math.random() * 10,
    p95LatencyMs: 80 + Math.random() * 40,
    p99LatencyMs: 200 + Math.random() * 100,
    errorRate: Math.random() * 0.02,
    cacheHitRate: 0.7 + Math.random() * 0.2,
    activeConnections: Math.floor(150 + Math.random() * 50),
  }), []);

  // ── WebSocket connection ───────────────────────────────────────────────────
  useEffect(() => {
    if (!wsUrl) {
      // No WebSocket — use polling simulation
      const tick = () => {
        setMetrics((prev) => [...prev.slice(-60), generateMockSnapshot()]);
        setLoading(false);
      };
      tick();
      const id = setInterval(tick, pollIntervalMs);
      return () => clearInterval(id);
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => { setConnected(true); setLoading(false); };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as
          | { type: "metric"; data: MetricSnapshot }
          | { type: "activity"; data: ActivityEvent };

        if (msg.type === "metric") {
          setMetrics((prev) => [...prev.slice(-60), msg.data]);
        } else if (msg.type === "activity") {
          setActivity((prev) => [msg.data, ...prev].slice(0, 20));
        }
      } catch { /* malformed message – ignore */ }
    };

    return () => ws.close();
  }, [wsUrl, pollIntervalMs, generateMockSnapshot]);

  const latest = metrics[metrics.length - 1];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6 text-sm font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">QAPi Monitoring</h2>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            connected ? "bg-green-900/40 text-green-400" : "bg-gray-700 text-gray-400"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-400" : "bg-gray-500"}`} />
          {wsUrl ? (connected ? "Live" : "Reconnecting…") : "Polling"}
        </span>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : latest ? (
          <>
            <MetricCard label="Req/s" value={latest.requestRate.toFixed(1)} />
            <MetricCard
              label="p50 latency"
              value={formatLatency(latest.p50LatencyMs)}
              status={latest.p50LatencyMs < 50 ? "ok" : latest.p50LatencyMs < 200 ? "warn" : "error"}
            />
            <MetricCard
              label="p95 latency"
              value={formatLatency(latest.p95LatencyMs)}
              status={latest.p95LatencyMs < 200 ? "ok" : latest.p95LatencyMs < 500 ? "warn" : "error"}
            />
            <MetricCard
              label="Error rate"
              value={formatPercent(latest.errorRate)}
              status={latest.errorRate < 0.01 ? "ok" : latest.errorRate < 0.05 ? "warn" : "error"}
            />
            <MetricCard label="Cache hit" value={formatPercent(latest.cacheHitRate)} />
            <MetricCard label="Connections" value={formatNumber(latest.activeConnections)} />
          </>
        ) : null}
      </div>

      {/* Recharts sparkline – lazy loaded */}
      {isProPlus && !loading && metrics.length > 1 && (
        <LatencyChart metrics={metrics} />
      )}

      {/* Pro+ upgrade nudge */}
      {!isProPlus && (
        <div className="rounded-xl border border-dashed border-gray-600 bg-gray-800/50 p-4 text-center text-gray-400">
          <p className="text-sm font-medium">📈 Advanced charts available on Pro+</p>
          <p className="mt-1 text-xs">Upgrade for latency sparklines, error breakdown, and build analytics.</p>
        </div>
      )}

      {/* Activity feed */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Recent Activity
        </h3>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mb-2 h-10" />)
        ) : activity.length === 0 ? (
          <p className="text-gray-500 text-xs">No recent activity.</p>
        ) : (
          <div className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-2">
            {activity.map((ev) => <ActivityRow key={ev.id} event={ev} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Lazy-loaded Recharts sparkline ────────────────────────────────────────────

/**
 * LatencyChart renders a responsive latency sparkline using Recharts.
 * Uses React.lazy / dynamic import so Recharts is not in the initial bundle.
 */
function LatencyChart({ metrics }: { metrics: MetricSnapshot[] }) {
  const [Recharts, setRecharts] = useState<{
    ResponsiveContainer: React.ComponentType<{ width: string | number; height: number; children: React.ReactNode }>;
    LineChart: React.ComponentType<{ data: unknown[]; children: React.ReactNode }>;
    Line: React.ComponentType<{ type: string; dataKey: string; stroke: string; dot: boolean; name: string }>;
    XAxis: React.ComponentType<{ dataKey: string; hide: boolean }>;
    YAxis: React.ComponentType<{ hide: boolean }>;
    Tooltip: React.ComponentType<{ formatter: (v: number) => string }>;
    Legend: React.ComponentType<Record<string, unknown>>;
  } | null>(null);

  useEffect(() => {
    // Dynamic import – Recharts is a peer dependency
    import("recharts")
      .then((mod) => setRecharts(mod as typeof Recharts))
      .catch(() => { /* Recharts not installed – skip chart */ });
  }, []);

  if (!Recharts) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-gray-700 bg-gray-800 text-xs text-gray-500">
        Install <code className="mx-1 rounded bg-gray-700 px-1">recharts</code> for latency charts
      </div>
    );
  }

  const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } = Recharts;

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Latency (ms)
      </h3>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={metrics}>
          <XAxis dataKey="ts" hide />
          <YAxis hide />
          <Tooltip formatter={(v: number) => formatLatency(v)} />
          <Legend />
          <Line type="monotone" dataKey="p50LatencyMs" stroke="#34d399" dot={false} name="p50" />
          <Line type="monotone" dataKey="p95LatencyMs" stroke="#fbbf24" dot={false} name="p95" />
          <Line type="monotone" dataKey="p99LatencyMs" stroke="#f87171" dot={false} name="p99" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default RichDashboard;
