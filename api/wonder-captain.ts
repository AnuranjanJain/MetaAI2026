// Vercel server function: POST { context } → Morning Captain plan from Muse Wonder.
// Same shape and verification contract as api/captain.ts (Spark); only the
// model differs. Wonder is positioned for long-running agentic work, so this
// route gets a 55s upstream budget. Model output is allowlisted by
// toCaptainPlan; fixed-event protection stays client-side in captain.ts.

import { CAPTAIN_PROMPT, MUSE_URL, WONDER_MODEL, extractJsonObject, replyText, toCaptainPlan } from '../src/core/muse.js';

const MAX_CONTEXT = 8000;
/** Upstream budget for Wonder reasoning, inside the client's ~65s timeout. */
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
  const context = (body as { context?: unknown } | null)?.context;
  if (typeof context !== 'string' || !context.trim()) {
    err(res, 400, 'context is required');
    return;
  }
  if (context.length > MAX_CONTEXT) {
    err(res, 413, 'context too long');
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
        model: WONDER_MODEL,
        messages: [
          { role: 'developer', content: CAPTAIN_PROMPT },
          { role: 'user', content: context },
        ],
      }),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    err(res, 502, 'wonder unavailable');
    return;
  }
  clearTimeout(timer);
  if (!upstream.ok) {
    err(res, 502, 'wonder unavailable');
    return;
  }

  let payload: unknown;
  try {
    payload = (await upstream.json()) as unknown;
  } catch {
    err(res, 502, 'wonder unavailable');
    return;
  }
  const content = replyText(payload);
  if (!content) {
    err(res, 502, 'wonder unavailable');
    return;
  }

  let plan: ReturnType<typeof toCaptainPlan>;
  try {
    plan = toCaptainPlan(extractJsonObject(content));
  } catch {
    plan = null;
  }
  if (!plan) {
    err(res, 502, 'wonder unavailable');
    return;
  }
  res.status(200).json({ plan, model: WONDER_MODEL });
}
