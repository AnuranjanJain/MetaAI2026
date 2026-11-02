// Vercel server function: POST { words } → { image, model }.
// Prepends the fixed cozy style prefix server-side; day words are data.
// Key handling matches interpret.ts: MUSE_API_KEY from process.env only.
// Verified 2026-11-02 against https://dev.meta.ai/docs/image-generation.

import { DREAM_MODEL, DREAM_STYLE, DREAM_URL, dreamImage } from '../src/core/dream.js';

const MAX_WORDS = 200;
const UPSTREAM_TIMEOUT_MS = 55000;

interface ProxyReq {
  method?: string;
  body?: unknown;
}

interface ProxyRes {
  status: (code: number) => ProxyRes;
  json: (obj: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

function err(res: ProxyRes, code: number, message: string): void {
  res.status(code).json({ error: message });
}

export default async function handler(req: ProxyReq, res: ProxyRes): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).json({});
    return;
  }
  if (req.method !== 'POST') {
    err(res, 405, 'method not allowed');
    return;
  }

  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      err(res, 400, 'invalid json');
      return;
    }
  }
  const words = (body as { words?: unknown } | null)?.words;
  if (typeof words !== 'string' || !words.trim() || words.length > MAX_WORDS) {
    err(res, 400, 'words is required (≤200 chars)');
    return;
  }

  const key = process.env.MUSE_API_KEY;
  if (!key) {
    err(res, 500, 'proxy not configured');
    return;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(DREAM_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: DREAM_MODEL, prompt: DREAM_STYLE + words.trim(), n: 1 }),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    err(res, 502, 'dream unavailable');
    return;
  }
  clearTimeout(timer);
  if (!upstream.ok) {
    err(res, 502, 'dream unavailable');
    return;
  }

  let payload: unknown;
  try {
    payload = (await upstream.json()) as unknown;
  } catch {
    err(res, 502, 'dream unavailable');
    return;
  }
  const image = dreamImage(payload);
  if (!image) {
    err(res, 502, 'dream unavailable');
    return;
  }
  res.status(200).json({ image, model: DREAM_MODEL });
}
