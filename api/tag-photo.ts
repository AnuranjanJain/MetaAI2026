// Vercel server function: POST { image } → validated garment pieces.
// Same key handling as interpret.ts: MUSE_API_KEY from process.env only.
// Endpoint, model, prompt, and parsing are shared with the direct client
// path via src/core/muse.ts (verified values, see docs/integrations.md).

import { MUSE_MODEL, MUSE_URL, TAG_PROMPT, TAG_USER_TEXT, extractJsonArray, replyText, toPieces, type NormalizedPiece } from '../src/core/muse.js';

const MAX_IMAGE_CHARS = 2000000;
/** Upstream budget for image reasoning, inside the client's 30s timeout. */
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
  const image = (body as { image?: unknown } | null)?.image;
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    err(res, 400, 'image data URL is required');
    return;
  }
  if (image.length > MAX_IMAGE_CHARS) {
    err(res, 413, 'image too large');
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
          { role: 'developer', content: TAG_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: TAG_USER_TEXT },
              { type: 'image_url', image_url: { url: image.trim() } },
            ],
          },
        ],
      }),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    err(res, 502, 'detection unavailable');
    return;
  }
  clearTimeout(timer);
  if (!upstream.ok) {
    err(res, 502, 'detection unavailable');
    return;
  }

  let payload: unknown;
  try {
    payload = (await upstream.json()) as unknown;
  } catch {
    err(res, 502, 'detection unavailable');
    return;
  }
  const content = replyText(payload);
  if (!content) {
    err(res, 502, 'detection unavailable');
    return;
  }

  let pieces: NormalizedPiece[] | null;
  try {
    pieces = toPieces(extractJsonArray(content));
  } catch {
    pieces = null;
  }
  if (!pieces) {
    err(res, 502, 'detection unavailable');
    return;
  }
  res.status(200).json({ pieces });
}
