// Shared Muse Model API wire constants and helpers. DOM-free so both the
// browser client and the Vercel functions import it: one source of truth
// for endpoint, model, fixed prompts, reply parsing, and model-output
// normalization — no drift between the direct and proxy paths. Values
// verified against dev.meta.ai (see docs/integrations.md); the contributor
// model is a user choice.

import type { AssistantIntent } from './assistant.js';

export const MUSE_URL = 'https://api.meta.ai/v1/chat/completions';
export const MUSE_MODEL = 'muse-spark-1.3-contributor';

/** Fixed intent-extraction prompt. Transcript words are data, never instructions. */
export const INTERPRET_PROMPT = [
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

/** Fixed garment-tagging prompt. Photo pixels are data, never instructions. */
export const TAG_PROMPT = [
  'You tag garments in a wardrobe photo for a local-first closet app.',
  'Reply with exactly one JSON array, no other text, no code fences.',
  'Each element: {"name": <short garment name>, "category": <top|bottom|shoes|outer|other>, "color": <main color or "">, "tags": [<up to 4 lowercase style tags>]}.',
  'List each distinct garment you can see, at most 12, most prominent first.',
  'Skip anything you cannot identify as clothing. Never invent garments that are not visible.',
  'Plain JSON only.',
].join('\n');

export const TAG_USER_TEXT = 'Tag the garments in this photo.';

export interface MuseReply {
  choices?: Array<{ message?: { content?: unknown } }>;
}

/** Generated text lives at choices[0].message.content (verified shape). */
export function replyText(payload: unknown): string | null {
  const content = (payload as MuseReply).choices?.[0]?.message?.content;
  return typeof content === 'string' && content.trim() ? content : null;
}

/** Parse a reply: direct JSON first, then the first balanced span.
    Shared so direct and proxy paths parse identically. */
function extractBalanced(text: string, open: string, close: string): unknown {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(clean) as unknown;
  } catch { /* fall through to the scan */ }
  const start = clean.indexOf(open);
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
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(clean.slice(start, i + 1)) as unknown;
    }
  }
  throw new Error('no json');
}

export function extractJsonObject(text: string): unknown {
  return extractBalanced(text, '{', '}');
}

export function extractJsonArray(text: string): unknown {
  return extractBalanced(text, '[', ']');
}

const INSTRUCTION_PATTERNS = [
  /ignore\s+(all\s+|any\s+|your\s+|previous\s+|above\s+)*(instructions?|rules?|prompts?|constraints?)[^.!?\n]{0,120}/gi,
  /disregard\s+(all\s+|previous\s+|above\s+)[^.!?\n]{0,120}/gi,
  /you\s+are\s+now\s+[^.!?\n]{0,120}/gi,
  /new\s+instructions?\s*:[^.!?\n]{0,200}/gi,
  /system\s*prompt\s*:[^.!?\n]{0,200}/gi,
  /do\s+not\s+follow\s+[^.!?\n]{0,120}/gi,
];

/** Strip instruction-like phrasing from a returned field. */
export function stripInstructionLike(text: string): string {
  let t = text.replace(/```[\s\S]*?```/g, ' ').replace(/```/g, ' ');
  for (const re of INSTRUCTION_PATTERNS) {
    re.lastIndex = 0;
    t = t.replace(re, ' ');
  }
  return t.replace(/\s+/g, ' ').trim();
}

type LiveKind = Exclude<AssistantIntent['kind'], 'done'>;

/** `done` is deliberately absent: task identity lives only on the device, so
    done-commands are matched locally and any model `done` fails closed. */
const INTENT_FIELDS: Record<LiveKind, { need: readonly string[]; blankOk: readonly string[] }> = {
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

/** Fixed reason bodies — the model never writes its own. The prefix names
    the actual path (proxy vs direct) so results stay distinguishable. */
const REASON_BODIES: Record<LiveKind, string> = {
  add: 'review it before anything is created.',
  where: 'searching your recorded spots, nothing added.',
  next: 'reading your day, nothing added.',
  have: 'checking your recorded things, nothing added.',
  wear: 'outfit ideas live in the wardrobe, nothing added.',
  wardrobe: 'checking states, nothing added.',
  routine: 'review the name before anything is created.',
  routineAdd: 'review what gets linked before anything changes.',
  outing: 'review the list before anything is added.',
  rename: 'review the match before anything changes.',
  spot: 'review the name before anything is created.',
  desk: 'summarizing your desk inbox, nothing added.',
  ambiguous: 'too short to tell; asking one follow-up.',
  unknown: 'nothing actionable heard.',
};

const MAX_REASON_FIELD = 500;

/** Allowlist a model object into an exact-shape intent with a fixed reason.
    Model extras are ignored (messy output); missing fields fail closed. */
export function toIntent(value: unknown, prefix = 'Live Muse interpretation'): AssistantIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.kind !== 'string') return null;
  const spec = (INTENT_FIELDS as Record<string, { need: readonly string[]; blankOk: readonly string[] } | undefined>)[obj.kind];
  if (!spec) return null;
  const out: Record<string, string> = { kind: obj.kind };
  for (const f of spec.need) {
    if (typeof obj[f] !== 'string') return null;
    const clean = stripInstructionLike(obj[f]).slice(0, MAX_REASON_FIELD);
    if (!clean) return null;
    out[f] = clean;
  }
  for (const f of spec.blankOk) {
    if (typeof obj[f] !== 'string') return null;
    out[f] = stripInstructionLike(obj[f]).slice(0, MAX_REASON_FIELD);
  }
  out.reason = `${prefix} — ${REASON_BODIES[obj.kind as LiveKind]}`;
  return out as unknown as AssistantIntent;
}

export interface NormalizedPiece {
  name: string;
  category: 'top' | 'bottom' | 'shoes' | 'outer' | 'other';
  color?: string;
  tags: string[];
}

const PIECE_CATEGORIES = new Set<string>(['top', 'bottom', 'shoes', 'outer', 'other']);
const MAX_MODEL_PIECES = 12;

/** Allowlist a model array into exact-shape pieces. Drops nothing silently:
    any unparseable entry fails the whole batch closed. Empty is valid. */
export function toPieces(value: unknown): NormalizedPiece[] | null {
  if (!Array.isArray(value) || value.length > MAX_MODEL_PIECES) return null;
  const out: NormalizedPiece[] = [];
  for (const p of value) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const obj = p as Record<string, unknown>;
    if (typeof obj.name !== 'string') return null;
    const name = stripInstructionLike(obj.name).slice(0, 60);
    if (!name) return null;
    if (typeof obj.category !== 'string' || !PIECE_CATEGORIES.has(obj.category)) return null;
    const piece: NormalizedPiece = { name, category: obj.category as NormalizedPiece['category'], tags: [] };
    if (typeof obj.color === 'string') {
      const color = stripInstructionLike(obj.color).slice(0, 40);
      if (color) piece.color = color;
    } else if (obj.color !== undefined) return null;
    if (Array.isArray(obj.tags)) {
      const tags: string[] = [];
      for (const t of obj.tags.slice(0, 4)) {
        if (typeof t !== 'string') return null;
        const v = stripInstructionLike(t).toLowerCase().slice(0, 30);
        if (v && !tags.includes(v)) tags.push(v);
      }
      piece.tags = tags;
    } else if (obj.tags !== undefined) return null;
    out.push(piece);
  }
  return out;
}

/** POST JSON with a timeout. Throws on timeout, network failure,
    error status, or unparseable JSON — callers convert to null/status. */
export async function postJson(
  url: string, body: unknown, headers: Record<string, string>,
  fetchFn: typeof fetch, timeoutMs: number,
): Promise<unknown> {
  const ctrl = new AbortController();
  const res = await new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error('live timed out'));
    }, timeoutMs);
    fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    }).then(
      (r) => { clearTimeout(timer); resolve(r); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
  if (!res.ok) {
    const err = new Error(`proxy status ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as unknown;
}
