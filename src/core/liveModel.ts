// Live Muse adapter (client side). interpretViaMuse POSTs a transcript to the
// Vercel proxy and schema-checks the reply; resolveIntent tries live first and
// falls back to local classifyIntent. Proxy responses are untrusted input:
// exact-keys validation, null on any failure, timeout, or mismatch.

import { classifyIntent, type AssistantIntent } from './assistant.js';
import { stripTrailingStopPhrase } from '../voice.js';
import { PHOTO_ITEM_CAP } from './wardrobeVision.js';
import { getKey, hasKey } from './byok.js';
import { INTERPRET_PROMPT, MUSE_MODEL, MUSE_URL, TAG_PROMPT, TAG_USER_TEXT, extractJsonArray, extractJsonObject, postJson, replyText, toIntent, toPieces } from './muse.js';
import type { AppState, Clothing } from './types.js';

export const LIVE_LABEL = 'Live Muse interpretation';
export const LIVE_INTRO = 'Live Muse interpretation is on — spoken transcripts go to the proxy';
export const DIRECT_LABEL = 'Direct Muse interpretation — your key, this browser';
export const DIRECT_INTRO = 'Direct Muse mode is on — your key, this browser';

const LIVE_KEY = 'pocketroom.liveMuse';
const MAX_TRANSCRIPT = 1000;
const MAX_FIELD = 500;
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_IMAGE_CHARS = 2000000;
const DEFAULT_TAG_TIMEOUT_MS = 30000;

/** True only after an explicit opt-in. Off by default. */
export function liveModeEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(LIVE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setLiveMode(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(LIVE_KEY, on ? '1' : '0');
  } catch { /* memory-only */ }
}

function configuredProxyUrl(): string | null {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const url = env?.VITE_MUSE_PROXY_URL?.trim();
    return url ? url : null;
  } catch {
    return null;
  }
}

/** True when a proxy URL reached the build (per-result labels still show
    which path each answer actually took). */
export function proxyConfigured(): boolean {
  return configuredProxyUrl() !== null;
}

/** True when live mode is both opted-in and configured. */
export function liveModeActive(): boolean {
  return liveModeEnabled() && proxyConfigured();
}

type IntentKind = AssistantIntent['kind'];

/** Required fields per kind: `need` must be non-empty, `blankOk` may be ''.
    `reason` is required non-empty on every kind. Local semantics decide which:
    a routine name can be empty (needs a name first), as can unknown text. */
const FIELDS: Record<IntentKind, { need: readonly string[]; blankOk: readonly string[] }> = {
  add: { need: ['text'], blankOk: [] },
  done: { need: ['taskId', 'title'], blankOk: [] },
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

/** Strict shape check: exact keys per kind, string types, length caps. */
function asIntent(value: unknown): AssistantIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.kind !== 'string') return null;
  const spec = (FIELDS as Record<string, { need: readonly string[]; blankOk: readonly string[] } | undefined>)[obj.kind];
  if (!spec) return null;
  const want = new Set(['kind', 'reason', ...spec.need, ...spec.blankOk]);
  const keys = Object.keys(obj);
  if (keys.length !== want.size || keys.some((k) => !want.has(k))) return null;
  for (const f of spec.need) {
    if (typeof obj[f] !== 'string' || !obj[f].trim() || obj[f].length > MAX_FIELD) return null;
  }
  for (const f of spec.blankOk) {
    if (typeof obj[f] !== 'string' || obj[f].length > MAX_FIELD) return null;
  }
  if (typeof obj.reason !== 'string' || !obj.reason.trim() || obj.reason.length > MAX_FIELD) return null;
  return value as AssistantIntent;
}

export interface LiveOpts {
  /** Overrides the build-time VITE_MUSE_PROXY_URL (tests use this). */
  proxyUrl?: string;
  /** Injectable fetch so tests never touch the network. */
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/** POST one transcript to the proxy; null on any failure, timeout, or
    shape mismatch. Never throws for network/shape causes. */
export async function interpretViaMuse(transcript: string, opts: LiveOpts = {}): Promise<AssistantIntent | null> {
  const text = transcript.trim();
  if (!text || text.length > MAX_TRANSCRIPT) return null;
  const url = opts.proxyUrl !== undefined ? opts.proxyUrl.trim() : configuredProxyUrl();
  if (!url) return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  try {
    return asIntent(await postJson(url, { transcript: text }, {}, fetchFn, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  } catch {
    return null;
  }
}

/** Parse one direct Muse reply into an intent, or null. */
function directIntent(payload: unknown): AssistantIntent | null {
  const content = replyText(payload);
  if (!content) return null;
  try {
    return toIntent(extractJsonObject(content), 'Direct Muse interpretation');
  } catch {
    return null;
  }
}

/** Parse one direct Muse reply into pieces, or null. */
function directPieces(payload: unknown): LivePiece[] | null {
  const content = replyText(payload);
  if (!content) return null;
  try {
    return toPieces(extractJsonArray(content));
  } catch {
    return null;
  }
}

/** POST one transcript straight to the Muse API with the user's key.
    Null on any failure, timeout, rejection, or shape mismatch. */
export async function interpretDirect(transcript: string, key: string, opts: LiveOpts = {}): Promise<AssistantIntent | null> {
  const text = transcript.trim();
  const k = key.trim();
  if (!text || text.length > MAX_TRANSCRIPT || !k) return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  try {
    const payload = await postJson(MUSE_URL, {
      model: MUSE_MODEL,
      messages: [
        { role: 'developer', content: INTERPRET_PROMPT },
        { role: 'user', content: text },
      ],
    }, { Authorization: `Bearer ${k}` }, fetchFn, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return directIntent(payload);
  } catch {
    return null;
  }
}

/** Derive a sibling proxy path on the same deployment
    (…/api/interpret → …/api/tag-photo). Pure. */
export function proxySibling(base: string | null | undefined, path: string): string | null {
  if (!base) return null;
  const clean = base.trim().replace(/\/+$/, '');
  const i = clean.lastIndexOf('/');
  if (i <= 8) return null; // keep scheme+host intact (https://…)
  return `${clean.slice(0, i)}/${path}`;
}

export interface LivePiece {
  name: string;
  category: Clothing['category'];
  color?: string;
  tags: string[];
}

const PIECE_KEYS = new Set(['name', 'category', 'color', 'tags']);
const PIECE_CATEGORIES = new Set(['top', 'bottom', 'shoes', 'outer', 'other']);

/** Strict pieces check: exactly {pieces}, known keys, typed fields, caps.
    An empty array is valid — "no garments" is an honest answer. */
function asPieces(value: unknown): LivePiece[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 1 || keys[0] !== 'pieces' || !Array.isArray(obj.pieces)) return null;
  const arr = obj.pieces as unknown[];
  if (arr.length > PHOTO_ITEM_CAP) return null;
  const out: LivePiece[] = [];
  for (const p of arr) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const r = p as Record<string, unknown>;
    if (Object.keys(r).some((k) => !PIECE_KEYS.has(k))) return null;
    if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 60) return null;
    if (typeof r.category !== 'string' || !PIECE_CATEGORIES.has(r.category)) return null;
    if (r.color !== undefined && (typeof r.color !== 'string' || r.color.length > 40)) return null;
    if (!Array.isArray(r.tags)) return null;
    const tags = r.tags as unknown[];
    if (tags.length > 8 || tags.some((t) => typeof t !== 'string' || !t.trim() || t.length > 30)) return null;
    out.push({
      name: r.name,
      category: r.category as LivePiece['category'],
      ...(r.color === undefined ? {} : { color: r.color }),
      tags: tags as string[],
    });
  }
  return out;
}

/** POST one photo to the sibling tag-photo route; pieces on success, null
    on any failure, timeout, or shape mismatch. Only ever called from an
    explicit Detect tap. Never throws for network/shape causes. */
export async function tagPhotoViaMuse(imageDataUrl: string, opts: LiveOpts = {}): Promise<LivePiece[] | null> {
  const img = imageDataUrl.trim();
  if (!img.startsWith('data:image/') || img.length > MAX_IMAGE_CHARS) return null;
  const url = opts.proxyUrl !== undefined
    ? opts.proxyUrl.trim()
    : proxySibling(configuredProxyUrl(), 'tag-photo');
  if (!url) return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  try {
    return asPieces(await postJson(url, { image: img }, {}, fetchFn, opts.timeoutMs ?? DEFAULT_TAG_TIMEOUT_MS));
  } catch {
    return null;
  }
}

/** POST one photo straight to the Muse API with the user's key. Pieces on
    success (empty means no garments), null on any failure or rejection. */
export async function tagPhotoDirect(imageDataUrl: string, key: string, opts: LiveOpts = {}): Promise<LivePiece[] | null> {
  const img = imageDataUrl.trim();
  const k = key.trim();
  if (!img.startsWith('data:image/') || img.length > MAX_IMAGE_CHARS || !k) return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  try {
    const payload = await postJson(MUSE_URL, {
      model: MUSE_MODEL,
      messages: [
        { role: 'developer', content: TAG_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: TAG_USER_TEXT },
            { type: 'image_url', image_url: { url: img } },
          ],
        },
      ],
    }, { Authorization: `Bearer ${k}` }, fetchFn, opts.timeoutMs ?? DEFAULT_TAG_TIMEOUT_MS);
    return directPieces(payload);
  } catch {
    return null;
  }
}

export type ResolvedIntent = { intent: AssistantIntent; live: boolean; direct: boolean } | 'empty';

/** Key-direct first, then proxy, then local. A live `done` is never trusted
    — task identity is local-only — so it falls back to local matching too. */
export async function resolveIntent(text: string, state: AppState, opts: LiveOpts = {}): Promise<ResolvedIntent> {
  if (hasKey()) {
    const direct = await interpretDirect(text, getKey() ?? '', opts);
    if (direct && direct.kind !== 'done') return { intent: direct, live: true, direct: true };
  }
  if (liveModeEnabled()) {
    const live = await interpretViaMuse(text, opts);
    if (live && live.kind !== 'done') return { intent: live, live: true, direct: false };
  }
  let intent = classifyIntent(text, state);
  if (intent.kind !== 'done') {
    const stripped = stripTrailingStopPhrase(text);
    if (!stripped) return 'empty';
    if (stripped !== text) intent = classifyIntent(stripped, state);
  }
  return { intent, live: false, direct: false };
}
