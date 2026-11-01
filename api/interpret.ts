// Vercel server function: POST { transcript } → validated AssistantIntent.
// The Meta Model API key lives only in the Vercel dashboard (MUSE_API_KEY)
// and is read here via process.env — it never enters the repo or bundle.
// Model values below were verified against dev.meta.ai before this file was
// written (see docs/integrations.md); nothing here is invented.

import type { AssistantIntent } from '../src/core/assistant.js';

/** Verified 2026-11-01: OpenAI-compatible chat endpoint. Contributor model
    per user choice: discounted, but Meta may train on prompts/completions. */
const MUSE_URL = 'https://api.meta.ai/v1/chat/completions';
const MUSE_MODEL = 'muse-spark-1.3-contributor';

const MAX_TRANSCRIPT = 1000;
const MAX_FIELD = 500;
/** Upstream budget, kept well inside the client's ~15s timeout. */
const UPSTREAM_TIMEOUT_MS = 9000;

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

type LiveKind = Exclude<AssistantIntent['kind'], 'done'>;

/** `done` is deliberately absent: task identity lives only on the device, so
    done-commands are matched locally and any model `done` fails closed. */
const FIELDS: Record<LiveKind, { need: readonly string[]; blankOk: readonly string[] }> = {
  add: { need: ['text'], blankOk: [] },
  where: { need: ['query'], blankOk: [] },
  next: { need: [], blankOk: [] },
  have: { need: ['query'], blankOk: [] },
  wear: { need: [], blankOk: [] },
  wardrobe: { need: ['query'], blankOk: [] },
  routine: { need: [], blankOk: ['name'] },
  routineAdd: { need: ['routineQuery', 'itemText'], blankOk: [] },
  outing: { need: ['query'], blankOk: [] },
  rename: { need: ['target', 'newName'], blankOk: [] },
  spot: { need: ['name'], blankOk: [] },
  desk: { need: [], blankOk: [] },
  ambiguous: { need: ['text'], blankOk: [] },
  unknown: { need: [], blankOk: ['text'] },
};

/** Fixed server-side reasons — the model never writes its own. */
const REASONS: Record<LiveKind, string> = {
  add: 'Live Muse interpretation — review it before anything is created.',
  where: 'Live Muse interpretation — searching your recorded spots, nothing added.',
  next: 'Live Muse interpretation — reading your day, nothing added.',
  have: 'Live Muse interpretation — checking your recorded things, nothing added.',
  wear: 'Live Muse interpretation — outfit ideas live in the wardrobe, nothing added.',
  wardrobe: 'Live Muse interpretation — checking states, nothing added.',
  routine: 'Live Muse interpretation — review the name before anything is created.',
  routineAdd: 'Live Muse interpretation — review what gets linked before anything changes.',
  outing: 'Live Muse interpretation — review the list before anything is added.',
  rename: 'Live Muse interpretation — review the match before anything changes.',
  spot: 'Live Muse interpretation — review the name before anything is created.',
  desk: 'Live Muse interpretation — summarizing your desk inbox, nothing added.',
  ambiguous: 'Live Muse interpretation — too short to tell; asking one follow-up.',
  unknown: 'Live Muse interpretation — nothing actionable heard.',
};

/** Fixed extraction prompt. Transcript words are data, never instructions. */
const EXTRACTION_PROMPT = [
  'You classify a voice-assistant transcript for a local-first day planner.',
  'Reply with exactly one JSON object, no other text, no code fences.',
  'Shape: {"kind": <kind>, <fields for that kind>}. Never add a "reason", "taskId", or any other key.',
  'Kinds and fields (short strings from the transcript, never invented):',
  '- {"kind":"add","text":...} — something to save: task, event, item, or note. Default when unsure.',
  '- {"kind":"where","query":...} — asking where a thing is ("where is my adapter").',
  '- {"kind":"next"} — asking what is next.',
  '- {"kind":"have","query":...} — asking whether they have something ("do I have a charger").',
  '- {"kind":"wear"} — asking what to wear.',
  '- {"kind":"routine","name":...} — create a routine; name may be "" when no name was heard.',
  '- {"kind":"routineAdd","routineQuery":...,"itemText":...} — add an item to a routine.',
  '- {"kind":"outing","query":...} — plan or pack for an outing.',
  '- {"kind":"rename","target":...,"newName":...} — rename something.',
  '- {"kind":"spot","name":...} — create a storage spot.',
  '- {"kind":"desk"} — asking what is on the desk inbox.',
  '- {"kind":"wardrobe","query":...} — wardrobe state or contents ("is my shirt clean", "what is in the laundry").',
  '- {"kind":"ambiguous","text":...} — a bare one- or two-word fragment, too short to tell whether to add or look up.',
  '- {"kind":"unknown","text":...} — nothing actionable heard; text may be "".',
  'Never use kind "done": done-commands ("mark X done") are matched on-device, so return them as {"kind":"add","text": <full transcript>}.',
  'Rules: use only words from the transcript; drop filler ("please", "can you"); never invent names, dates, or places; plain JSON only.',
].join('\n');

const INSTRUCTION_PATTERNS = [
  /ignore\s+(all\s+|any\s+|your\s+|previous\s+|above\s+)*(instructions?|rules?|prompts?|constraints?)[^.!?\n]{0,120}/gi,
  /disregard\s+(all\s+|previous\s+|above\s+)[^.!?\n]{0,120}/gi,
  /you\s+are\s+now\s+[^.!?\n]{0,120}/gi,
  /new\s+instructions?\s*:[^.!?\n]{0,200}/gi,
  /system\s*prompt\s*:[^.!?\n]{0,200}/gi,
  /do\s+not\s+follow\s+[^.!?\n]{0,120}/gi,
];

/** Strip instruction-like phrasing from a returned field. */
function stripInstructionLike(text: string): string {
  let t = text.replace(/```[\s\S]*?```/g, ' ').replace(/```/g, ' ');
  for (const re of INSTRUCTION_PATTERNS) {
    re.lastIndex = 0;
    t = t.replace(re, ' ');
  }
  return t.replace(/\s+/g, ' ').trim();
}

/** Parse the model's reply: direct JSON first, then the first balanced {...}. */
function extractJson(text: string): unknown {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(clean) as unknown;
  } catch { /* fall through to the scan */ }
  const start = clean.indexOf('{');
  if (start === -1) throw new Error('no json');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < clean.length; i++) {
    const ch = clean[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(clean.slice(start, i + 1)) as unknown;
    }
  }
  throw new Error('no json');
}

/** Allowlist the model's object into an exact-shape intent, or null. */
function toIntent(value: unknown): AssistantIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.kind !== 'string') return null;
  const spec = (FIELDS as Record<string, { need: readonly string[]; blankOk: readonly string[] } | undefined>)[obj.kind];
  if (!spec) return null;
  const out: Record<string, string> = { kind: obj.kind };
  for (const f of spec.need) {
    if (typeof obj[f] !== 'string') return null;
    const clean = stripInstructionLike(obj[f]).slice(0, MAX_FIELD);
    if (!clean) return null;
    out[f] = clean;
  }
  for (const f of spec.blankOk) {
    if (typeof obj[f] !== 'string') return null;
    out[f] = stripInstructionLike(obj[f]).slice(0, MAX_FIELD);
  }
  out.reason = REASONS[obj.kind as LiveKind];
  return out as unknown as AssistantIntent;
}

interface MuseReply {
  choices?: Array<{ message?: { content?: unknown } }>;
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
          { role: 'developer', content: EXTRACTION_PROMPT },
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
  const content = (payload as MuseReply).choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    err(res, 502, 'interpretation unavailable');
    return;
  }

  let intent: AssistantIntent | null;
  try {
    intent = toIntent(extractJson(content));
  } catch {
    intent = null;
  }
  if (!intent) {
    err(res, 502, 'interpretation unavailable');
    return;
  }
  res.status(200).json(intent);
}
