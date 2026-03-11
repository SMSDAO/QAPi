export type Tier = "starter" | "pro" | "audited";

export function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return token || null;
}

export function tierFromToken(token: string): Tier {
  const m = token.match(/^qapi-(starter|pro|audited)-/i);
  return ((m?.[1]?.toLowerCase() ?? "starter") as Tier);
}

export function redactToken(token: string): string {
  if (!token) return "";
  if (token.length <= 12) return token.slice(0, 4) + "…";
  return token.slice(0, 8) + "…" + token.slice(-4);
}