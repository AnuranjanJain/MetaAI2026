// Vercel server function: POST { text, today } → validated desk proposal.
// Same key handling as interpret.ts: MUSE_API_KEY from process.env only.
// The extraction prompt is fixed server-side; note words are data.

import { MUSE_MODEL, MUSE_URL, PROPOSE_PROMPT, extractJsonObject, replyText, toProposal } from '../src/core/muse.js';

const MAX_TEXT = 2000;
const UPSTREAM_TIMEOUT_MS = 20000;

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
  const text = (body as { text?: unknown } | null)?.text;
  const today = (body as { today?: unknown } | null)?.today;
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) {
    err(res, 400, 'text is required (≤2000 chars)');
    return;
  }
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    err(res, 400, 'today must be YYYY-MM-DD');
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
          { role: 'developer', content: PROPOSE_PROMPT },
          { role: 'user', content: `Today is ${today}.\n\n${text.trim()}` },
        ],
      }),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    err(res, 502, 'proposal unavailable');
    return;
  }
  clearTimeout(timer);
  if (!upstream.ok) {
    err(res, 502, 'proposal unavailable');
    return;
  }

  let payload: unknown;
  try {
    payload = (await upstream.json()) as unknown;
  } catch {
    err(res, 502, 'proposal unavailable');
    return;
  }
  const content = replyText(payload);
  if (!content) {
    err(res, 502, 'proposal unavailable');
    return;
  }

  let proposal: ReturnType<typeof toProposal>;
  try {
    proposal = toProposal(extractJsonObject(content));
  } catch {
    proposal = null;
  }
  if (!proposal) {
    err(res, 502, 'proposal unavailable');
    return;
  }
  res.status(200).json({ proposal, model: MUSE_MODEL });
}
