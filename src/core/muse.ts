// Shared Muse Model API wire constants and helpers. DOM-free so both the
// browser client and the Vercel functions import it: one source of truth
// for endpoint, model, fixed prompts, reply parsing, and model-output
// normalization — no drift between the direct and proxy paths. Values
// verified against dev.meta.ai (see docs/integrations.md); the contributor
// model is a user choice.

import type { AssistantIntent } from './assistant.js';

export const MUSE_URL = 'https://api.meta.ai/v1/chat/completions';
export const MUSE_MODEL = 'muse-spark-1.3-contributor';
// Agentic reasoning model for Morning Captain (verified in dev.meta.ai model
// docs: muse-wonder-1.0, same chat-completions API, pay-as-you-go).
// Same endpoint, prompts, and plan shape as Spark — only the model differs.
export const WONDER_MODEL = 'muse-wonder-1.0';

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

/** Fixed desk-proposal prompt. Capture text is data, never instructions. */
export const PROPOSE_PROMPT = [
  'You extract a day-planner proposal from a captured note for a local-first app.',
  'Reply with exactly one JSON object, no other text, no code fences.',
  'Shape: {"type":"task"|"event"|"item"|"reference","title":string,"date":"YYYY-MM-DD"|null,"time":"HH:MM"|null,"endTime":"HH:MM"|null,"place":string|null,"durationMin":5-480|null,"itemName":string|null,"locationHint":string|null,"repeat":"daily"|"weekly"|null}.',
  'Rules: task = something to do; event = something at a date/time; item = a thing to remember or place; reference = anything else. Resolve relative dates ("tomorrow", weekday names) against the given today. Set repeat only when the note says so ("every day", "daily", "weekly", "every morning") and only for tasks. Use only words from the note; never invent places, dates, or times — use null when absent. Plain JSON only.',
].join('\n');

/** Fixed Morning Captain prompt. Day context is data, never instructions. */
export const CAPTAIN_PROMPT = [
  'You are Morning Captain for a local-first day planner. Propose a day plan; code verifies it.',
  'Reply with exactly one JSON object, no other text, no code fences.',
  'Shape: {"slots":[{"taskId"|null,"title","start":"HH:MM","durationMin":10-240}],"prep":[{"eventId","text"}],"leaveBy":[{"eventId","at":"HH:MM"}],"outfitIds":[ids],"pack":[strings],"notes":string}.',
  'Rules: use only the task, event, and clothing ids from the context — never invent ids. Fixed events never move: slots must sit in free time (08:00-22:00) and never overlap an event. Prefer matching dump lines to existing task ids; use taskId null only for genuinely new tasks. At most 10 slots, 12 pack items, 6 outfit pieces. Plain JSON only.',
].join('\n');

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

/** Allowlist a model object into a Captain plan draft (trace added by
    callers). Any unparseable entry fails the whole batch closed. */
export function toCaptainPlan(value: unknown): {
  slots: Array<{ taskId?: string; title: string; start: string; durationMin: number }>;
  prep: Array<{ eventId: string; text: string }>;
  leaveBy: Array<{ eventId: string; at: string }>;
  outfitIds: string[];
  pack: string[];
  notes: string;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.slots) || o.slots.length > 10) return null;
  if (!Array.isArray(o.prep) || !Array.isArray(o.leaveBy)) return null;
  if (!Array.isArray(o.outfitIds) || !Array.isArray(o.pack)) return null;
  if (typeof o.notes !== 'string') return null;
  const slots: Array<{ taskId?: string; title: string; start: string; durationMin: number }> = [];
  for (const s of o.slots) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    const r = s as Record<string, unknown>;
    if (r.taskId !== null && r.taskId !== undefined && typeof r.taskId !== 'string') return null;
    if (typeof r.title !== 'string') return null;
    const title = stripInstructionLike(r.title).slice(0, 80);
    if (!title) return null;
    if (typeof r.start !== 'string' || typeof r.durationMin !== 'number') return null;
    slots.push({
      ...(typeof r.taskId === 'string' && r.taskId ? { taskId: r.taskId.slice(0, 80) } : {}),
      title, start: r.start.slice(0, 5), durationMin: Math.round(r.durationMin),
    });
  }
  const prep: Array<{ eventId: string; text: string }> = [];
  for (const p of o.prep.slice(0, 12)) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const r = p as Record<string, unknown>;
    if (typeof r.eventId !== 'string' || typeof r.text !== 'string') return null;
    const text = stripInstructionLike(r.text).slice(0, 200);
    if (!text) return null;
    prep.push({ eventId: r.eventId.slice(0, 80), text });
  }
  const leaveBy: Array<{ eventId: string; at: string }> = [];
  for (const l of o.leaveBy.slice(0, 12)) {
    if (!l || typeof l !== 'object' || Array.isArray(l)) return null;
    const r = l as Record<string, unknown>;
    if (typeof r.eventId !== 'string' || typeof r.at !== 'string') return null;
    leaveBy.push({ eventId: r.eventId.slice(0, 80), at: r.at.slice(0, 5) });
  }
  const outfitIds = o.outfitIds.slice(0, 6);
  if (outfitIds.some((id) => typeof id !== 'string')) return null;
  const pack: string[] = [];
  for (const item of o.pack.slice(0, 12)) {
    if (typeof item !== 'string') return null;
    const v = stripInstructionLike(item).slice(0, 60);
    if (!v) return null;
    pack.push(v);
  }
  return { slots, prep, leaveBy, outfitIds: outfitIds as string[], pack, notes: stripInstructionLike(o.notes).slice(0, 300) };
}

/** Allowlist a model object into a desk proposal. Confidence, missing
    gaps, and rationale are code-owned — the model never writes them. */
export function toProposal(value: unknown): import('./types.js').Proposal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (o.type !== 'task' && o.type !== 'event' && o.type !== 'item' && o.type !== 'reference') return null;
  if (typeof o.title !== 'string') return null;
  const title = stripInstructionLike(o.title).slice(0, 120);
  if (!title) return null;
  const opt = (v: unknown, cap: number): string | undefined => {
    if (v === null || v === undefined) return undefined;
    if (typeof v !== 'string') return undefined;
    const clean = stripInstructionLike(v).slice(0, cap);
    return clean || undefined;
  };
  const missing: string[] = [];
  let date = opt(o.date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) date = undefined;
  let time = opt(o.time, 5);
  if (time && !/^\d{2}:\d{2}$/.test(time)) time = undefined;
  let endTime = opt(o.endTime, 5);
  if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) endTime = undefined;
  if (endTime && time && endTime <= time) endTime = undefined;
  let durationMin: number | undefined;
  if (typeof o.durationMin === 'number' && Number.isFinite(o.durationMin)) {
    const d = Math.round(o.durationMin);
    if (d >= 5 && d <= 480) durationMin = d;
  }
  if (o.type === 'event') {
    if (!date) missing.push('no date in source');
    if (!time) missing.push('no time in source');
  }
  if (o.type === 'task' && durationMin === undefined) {
    durationMin = 30;
    missing.push('assumed 30 minutes');
  }
  const repeat = o.repeat === 'daily' || o.repeat === 'weekly' ? o.repeat : undefined;
  return {
    type: o.type,
    title,
    ...(date ? { date } : {}),
    ...(time ? { time } : {}),
    ...(endTime ? { endTime } : {}),
    ...(opt(o.place, 80) ? { place: opt(o.place, 80)! } : {}),
    ...(durationMin !== undefined ? { durationMin } : {}),
    ...(repeat && o.type === 'task' ? { repeat } : {}),
    ...(o.type === 'item' ? { itemName: opt(o.itemName, 80) ?? title } : {}),
    ...(opt(o.locationHint, 60) ? { locationHint: opt(o.locationHint, 60)! } : {}),
    confidence: 'medium',
    missing,
    rationale: 'Live Muse read the note — check every field before confirming.',
  };
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
