/**
 * components/dashboard/utils.ts
 *
 * Shared formatter utilities for the QAPi monitoring dashboard.
 */

/** Formats a number of bytes to a human-readable string (KB, MB, GB). */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/** Formats a latency in ms to a human-readable string. */
export function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Formats a USD cost to 4 decimal places. */
export function formatCostUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

/** Formats a percentage (0-1) to a human-readable string. */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Formats a large number with commas (e.g. 1000000 → "1,000,000"). */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** Returns a friendly relative-time label (e.g. "2 minutes ago"). */
export function timeAgo(date: Date | string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/** Returns the CSS class for a given status string. */
export function statusClass(status: "ok" | "warn" | "error" | string): string {
  switch (status) {
    case "ok": return "text-green-500";
    case "warn": return "text-yellow-500";
    case "error": return "text-red-500";
    default: return "text-gray-400";
  }
}
