// resolve.ts — Vercel "Brain" serverless function
// Canonical endpoint: GET /api/resolve?name=<module>&version=<version>
//
// This handler is the single entry-point for the QAPi Brain deployed on Vercel.
// It proxies the request to the QAPi Core API, attaches CORS headers so the
// GitHub Pages dashboard can call it directly, and caches safe responses via
// Cache-Control headers (never caches streaming or auth-gated data).

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Allowed origins: GitHub Pages dashboard + local dev
const ALLOWED_ORIGINS = [
  'https://smsdao.github.io',
  'https://qapi.github.io',
  'http://localhost:3000',
];

// Core API base URL — set QAPI_CORE_URL in Vercel environment variables
const CORE_URL = process.env.QAPI_CORE_URL ?? 'https://api.qapi.dev';

function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin as string | undefined;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-QAPi-Key, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true; // preflight handled
  }
  return false;
}

/** Detect the module source tier from its identifier prefix. */
export function parseTier(moduleId: string): 'github' | 'blob' | 'vps' | null {
  if (moduleId.startsWith('gh:')) return 'github';
  if (moduleId.startsWith('blob:')) return 'blob';
  if (moduleId.startsWith('vps:')) return 'vps';
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (applyCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed', allowed: 'GET' });
  }

  const { name, version } = req.query as Record<string, string>;
  if (!name) {
    return res.status(400).json({ error: 'Missing required query parameter: name' });
  }

  // Forward the API key from the caller to the Core API
  const apiKey =
    (req.headers['x-qapi-key'] as string | undefined) ??
    (req.headers['authorization'] as string | undefined);

  const upstreamUrl = new URL('/modules/resolve', CORE_URL);
  upstreamUrl.searchParams.set('name', name);
  if (version) upstreamUrl.searchParams.set('version', version);

  let upstreamRes: Response;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;

    upstreamRes = await fetch(upstreamUrl.toString(), { headers });
  } catch (err) {
    return res.status(502).json({ error: 'Bad Gateway', detail: 'Core API unreachable' });
  }

  let body: unknown;
  try {
    body = await upstreamRes.json();
  } catch {
    return res.status(502).json({ error: 'Bad Gateway', detail: 'Invalid response from Core API' });
  }

  // Propagate cache hints for safe (public) responses only
  const ttl =
    upstreamRes.status === 200 &&
    typeof (body as Record<string, unknown>)?.cachedTtlSeconds === 'number' &&
    (body as Record<string, unknown>).cachedTtlSeconds as number > 0
      ? (body as Record<string, unknown>).cachedTtlSeconds as number
      : null;

  if (ttl !== null) {
    res.setHeader('Cache-Control', `public, max-age=${ttl}, stale-while-revalidate=60`);
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }

  return res.status(upstreamRes.status).json(body);
}
