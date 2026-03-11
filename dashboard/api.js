/**
 * QAPi Dashboard — shared browser API client
 *
 * Exposes window.QAPI with helpers for every dashboard page:
 *   - Auto-detects the API base URL (local dev vs. production)
 *   - Persists the API key in localStorage
 *   - Wraps all API calls with a consistent timeout + error shape
 *
 * Usage:
 *   <script src="api.js"></script>
 *   <script>
 *     const data = await QAPI.fetchMetrics();
 *     const tier = await QAPI.fetchTier("pro");
 *   </script>
 */
(function () {
  "use strict";

  const STORAGE_KEY = "qapi_api_key";
  const TIMEOUT_MS  = 8_000;

  // ── Base URL detection ──────────────────────────────────────────────────────
  // • file:// or localhost → relative URLs (dev-server proxies them to :3000)
  // • Deployed origin      → same-origin (when API serves the dashboard)
  // • Other origins        → production API
  function getBaseUrl() {
    if (typeof window === "undefined") return "http://localhost:3000";
    const { protocol, hostname } = window.location;
    if (protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:3000";
    }
    // When the dashboard is deployed at the same origin as the API, use ""
    // (relative URLs). Otherwise fall back to the public production API.
    return "https://api.qapi.dev";
  }

  const BASE = getBaseUrl();

  // ── Raw fetch with timeout ──────────────────────────────────────────────────
  async function apiFetch(path, options) {
    const url = `${BASE}${path}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...options,
    });
    return res;
  }

  // ── Key storage ─────────────────────────────────────────────────────────────
  function getStoredKey() {
    try { return localStorage.getItem(STORAGE_KEY) || null; }
    catch { return null; }
  }

  function storeKey(key) {
    try { localStorage.setItem(STORAGE_KEY, key); }
    catch { /* ignore */ }
  }

  function clearKey() {
    try { localStorage.removeItem(STORAGE_KEY); }
    catch { /* ignore */ }
  }

  // ── Public API calls ────────────────────────────────────────────────────────

  /** Fetch live operational metrics (public, no auth needed). */
  async function fetchMetrics() {
    const res = await apiFetch("/metrics");
    if (!res.ok) throw new Error(`Metrics fetch failed (${res.status})`);
    return res.json();
  }

  /**
   * Fetch config for a specific tier.
   * @param {"starter"|"pro"|"audited"} tierId
   */
  async function fetchTier(tierId) {
    const res = await apiFetch(`/v1/tiers/${encodeURIComponent(tierId)}`);
    if (!res.ok) throw new Error(`Tier '${tierId}' not found (${res.status})`);
    return res.json();
  }

  /** Fetch all tier definitions. Optionally pass an API key to get callerTier. */
  async function fetchTiers(apiKey) {
    const headers = apiKey ? { "X-QAPi-Key": apiKey } : {};
    const res = await apiFetch("/v1/tiers", { headers });
    if (!res.ok) throw new Error(`Tiers fetch failed (${res.status})`);
    return res.json();
  }

  /**
   * Fetch modules accessible to the caller's tier.
   * @param {string} apiKey
   */
  async function fetchModules(apiKey) {
    const res = await apiFetch("/v1/modules", {
      headers: { "X-QAPi-Key": apiKey },
    });
    if (!res.ok) throw new Error(`Modules fetch failed (${res.status})`);
    return res.json();
  }

  /**
   * Fetch metadata for a module pinned to a specific commit SHA.
   * Falls back to GitHub synthesis when owner/repo/path are provided.
   * @param {string} sha   40-char hex commit SHA
   * @param {string} apiKey
   * @param {{owner?:string, repo?:string, path?:string}} [opts]
   */
  async function fetchModuleBySha(sha, apiKey, opts) {
    let path = `/v1/modules/${encodeURIComponent(sha)}`;
    if (opts && opts.owner && opts.repo && opts.path) {
      const q = new URLSearchParams({ owner: opts.owner, repo: opts.repo, path: opts.path });
      path += `?${q}`;
    }
    const res = await apiFetch(path, { headers: { "X-QAPi-Key": apiKey } });
    if (!res.ok) throw new Error(`Module SHA lookup failed (${res.status})`);
    return res.json();
  }

  /**
   * Resolve a module by name (calls GET /modules/resolve).
   * @param {string} name
   * @param {string} apiKey
   */
  async function resolveModule(name, apiKey) {
    const res = await apiFetch(`/modules/resolve?name=${encodeURIComponent(name)}`, {
      headers: { "X-QAPi-Key": apiKey },
    });
    const data = await res.json();
    if (!res.ok) {
      const message = (data && (data.error || data.message)) || `Module resolve failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  }

  /**
   * Fetch the authenticated caller's profile.
   * Returns null if the key is invalid or not provided.
   * @param {string} apiKey
   */
  async function getMe(apiKey) {
    if (!apiKey) return null;
    try {
      const res = await apiFetch("/auth/me", {
        headers: { "X-QAPi-Key": apiKey },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  /**
   * Sign up for a new API key.
   * @param {string} email
   * @param {"starter"|"pro"|"audited"} tier
   * @returns {{ apiKey, tier, email, createdAt, tierConfig }}
   */
  async function signup(email, tier) {
    const res = await apiFetch("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, tier }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Signup failed");
    return data;
  }

  // ── Exports ─────────────────────────────────────────────────────────────────
  window.QAPI = {
    getBaseUrl,
    // key persistence
    getStoredKey,
    storeKey,
    clearKey,
    // API calls
    fetchMetrics,
    fetchTier,
    fetchTiers,
    fetchModules,
    fetchModuleBySha,
    resolveModule,
    getMe,
    signup,
  };
}());
