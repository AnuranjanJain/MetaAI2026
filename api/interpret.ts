// Vercel server function: POST { transcript } → validated AssistantIntent.
// The Meta Model API key lives only in the Vercel dashboard (MUSE_API_KEY)
// and is read here via process.env — it never enters the repo or bundle.
// Endpoint, model, prompt, and parsing are shared with the direct client
// path via src/core/muse.ts (verified values, see docs/integrations.md).

import type { AssistantIntent } from '../src/core/assistant.js';
import { INTERPRET_PROMPT, MUSE_MODEL, MUSE_URL, extractJsonObject, replyText, toIntent } from '../src/core/muse.js';

const MAX_TRANSCRIPT = 1000;
/** Upstream budget, kept inside the client's ~30s timeout. */
const UPSTREAM_TIMEOUT_MS = 25000;

/** Minimal structural types so this file needs no extra dependency. */
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
  const transcript = (body as { transcript?: unknown } | null)?.transcript;
  if (typeof transcript !== 'string' || !transcript.trim()) {
    err(res, 400, 'transcript is required');
    return;
  }
  if (transcript.trim().length > MAX_TRANSCRIPT) {
    err(res, 413, 'transcript too long');
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
    upstream = await fetch(MUSE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MUSE_MODEL,
        messages: [
          { role: 'developer', content: INTERPRET_PROMPT },
          { role: 'user', content: transcript.trim() },
        ],
      }),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    err(res, 502, 'interpretation unavailable');
    return;
  }
  clearTimeout(timer);
  if (!upstream.ok) {
    err(res, 502, 'interpretation unavailable');
    return;
  }

  let payload: unknown;
  try {
    payload = (await upstream.json()) as unknown;
  } catch {
    err(res, 502, 'interpretation unavailable');
    return;
  }
  const content = replyText(payload);
  if (!content) {
    err(res, 502, 'interpretation unavailable');
    return;
  }

  let intent: AssistantIntent | null;
  try {
    intent = toIntent(extractJsonObject(content));
  } catch {
    intent = null;
  }
  if (!intent) {
    err(res, 502, 'interpretation unavailable');
    return;
  }
  res.status(200).json(intent);
}
