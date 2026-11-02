// Live Muse adapter (client side). interpretViaMuse POSTs a transcript to the
// Vercel proxy and schema-checks the reply; resolveIntent tries live first and
// falls back to local classifyIntent. Proxy responses are untrusted input:
// exact-keys validation, null on any failure, timeout, or mismatch.

import { classifyIntent, type AssistantIntent } from './assistant.js';
import { stripTrailingStopPhrase } from '../voice.js';
import { PHOTO_ITEM_CAP } from './wardrobeVision.js';
import { getKey, hasKey } from './byok.js';
import { getOpenKey, getProvider, hasOpenKey, OPEN_LABEL, OPEN_MODEL, OPEN_URL } from './openweights.js';
import { CAPTAIN_PROMPT, INTERPRET_PROMPT, MUSE_MODEL, MUSE_URL, PROPOSE_PROMPT, TAG_PROMPT, TAG_USER_TEXT, extractJsonArray, extractJsonObject, postJson, replyText, toCaptainPlan, toIntent, toPieces, toProposal } from './muse.js';
import { TRANSCRIBE_URL, transcribeRequestJson, transcribeText } from './transcribe.js';
import { DREAM_MODEL, DREAM_STYLE, DREAM_URL, dreamImage } from './dream.js';
import type { CaptainPlan } from './captain.js';
import type { AppState, Clothing, Proposal } from './types.js';

export const LIVE_LABEL = 'Live Muse interpretation';
export const LIVE_INTRO = 'Live Muse interpretation is on — spoken transcripts go to the proxy';
export const DIRECT_LABEL = 'Direct Muse interpretation — your key, this browser';
export const DIRECT_INTRO = 'Direct Muse mode is on — your key, this browser';
export const OFFLINE_LABEL = 'Muse unreachable — on-device fallback, no model call';
export const DEMO_OFF_LABEL = 'Demo mode — on-device heuristics, no model call (Live is off)';
export const OPEN_INTRO = 'Open-weights mode is on — Muse Spark Open on Baseten with your key, this browser';

const LIVE_KEY = 'pocketroom.liveMuse';
const MAX_TRANSCRIPT = 1000;
const MAX_FIELD = 500;
/** Live interpret budget: must exceed the proxy's ~25s upstream budget. */
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_IMAGE_CHARS = 2000000;
const DEFAULT_TAG_TIMEOUT_MS = 30000;

/** True unless explicitly opted out. ON by default so judges and new
    users see Live Muse immediately; set '0' to force demo mode. */
export function liveModeEnabled(): boolean {
  try {
    const v = globalThis.localStorage?.getItem(LIVE_KEY);
    return v !== '0';
  } catch {
    return true;
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

/** Fire-and-forget OPTIONS pings to warm cold serverless routes before the
    first turn. Never throws, never sends user data, no-ops when live is
    off or unconfigured. */
export function warmProxy(fetchFn?: typeof fetch): void {
  try {
    const base = configuredProxyUrl();
    if (!base || !liveModeEnabled()) return;
    const fn = fetchFn ?? globalThis.fetch?.bind(globalThis);
    if (!fn) return;
    const urls = new Set([base,
      proxySibling(base, 'captain'), proxySibling(base, 'propose'),
      proxySibling(base, 'transcribe'), proxySibling(base, 'tag-photo'),
    ]);
    for (const url of urls) {
      if (url) void fn(url, { method: 'OPTIONS' }).catch(() => {});
    }
  } catch { /* warmup is best-effort */ }
}

/** True when live mode is enabled and a proxy URL reached the build. */
export function liveModeActive(): boolean {
  return liveModeEnabled() && proxyConfigured();
}

/** UI-facing status: direct key wins, then proxy live, then visible
    offline fallback, then explicit demo-off. Never silent. */
export type LiveStatus = 'direct' | 'live' | 'offline' | 'demo';
export function liveStatus(): LiveStatus {
  if (hasKey()) return 'direct';
  if (liveModeActive()) return 'live';
  if (liveModeEnabled()) return 'offline';
  return 'demo';
}

/** Short chip text for the topbar + assistant badge. Names the model. */
export function liveBadge(): string {
  if (getProvider() === 'open' && hasOpenKey()) return `Open Muse • ${OPEN_MODEL} (Baseten)`;
  const s = liveStatus();
  if (s === 'direct') return `Direct Muse • ${MUSE_MODEL}`;
  if (s === 'live') return `Live Muse • ${MUSE_MODEL}`;
  if (s === 'offline') return 'Muse offline • demo fallback';
  return 'Demo • on-device';
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

/** Parse one direct-model reply into an intent, or null. */
function directIntent(payload: unknown, prefix = 'Direct Muse interpretation'): AssistantIntent | null {
  const content = replyText(payload);
  if (!content) return null;
  try {
    return toIntent(extractJsonObject(content), prefix);
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

/** POST one transcript straight to a chat backend with the user's key.
    Null on any failure, timeout, rejection, or shape mismatch. */
async function interpretWith(
  url: string, model: string, transcript: string, key: string,
  prefix: string, opts: LiveOpts,
): Promise<AssistantIntent | null> {
  const text = transcript.trim();
  const k = key.trim();
  if (!text || text.length > MAX_TRANSCRIPT || !k) return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  try {
    const payload = await postJson(url, {
      model,
      messages: [
        { role: 'developer', content: INTERPRET_PROMPT },
        { role: 'user', content: text },
      ],
    }, { Authorization: `Bearer ${k}` }, fetchFn, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return directIntent(payload, prefix);
  } catch {
    return null;
  }
}

/** POST one transcript straight to the Muse API with the user's key. */
export async function interpretDirect(transcript: string, key: string, opts: LiveOpts = {}): Promise<AssistantIntent | null> {
  return interpretWith(MUSE_URL, MUSE_MODEL, transcript, key, 'Direct Muse interpretation', opts);
}

/** POST one transcript to Muse Spark Open on Baseten with the user's key. */
export async function interpretOpen(transcript: string, key: string, opts: LiveOpts = {}): Promise<AssistantIntent | null> {
  return interpretWith(OPEN_URL, OPEN_MODEL, transcript, key, `${OPEN_LABEL} (${OPEN_MODEL})`, opts);
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

export interface ResolvedOk {
  intent: AssistantIntent;
  live: boolean;
  direct: boolean;
  /** Wall-clock ms for the winning path (live call or local fallback). */
  latencyMs: number;
  /** Model id when live, null on local fallback. */
  model: string | null;
  /** True when live was attempted but fell back — UI must show it. */
  offline: boolean;
}
export type ResolvedIntent = ResolvedOk | 'empty';

/** Key-direct first (provider order), then proxy, then local. A live `done`
    is never trusted — task identity is local-only — so it falls back to
    local matching too. */
export async function resolveIntent(text: string, state: AppState, opts: LiveOpts = {}): Promise<ResolvedIntent> {
  const t0 = Date.now();
  let attemptedLive = false;
  for (const b of directBackends()) {
    if (!b.key) continue;
    attemptedLive = true;
    const direct = b.open
      ? await interpretOpen(text, b.key, opts)
      : await interpretDirect(text, b.key, opts);
    if (direct && direct.kind !== 'done') {
      return {
        intent: direct, live: true, direct: true, latencyMs: Date.now() - t0,
        model: b.open ? OPEN_MODEL : MUSE_MODEL, offline: false,
      };
    }
  }
  if (liveModeEnabled()) {
    // Count as attempted when a URL could exist (build env or test override).
    if (proxyConfigured() || opts.proxyUrl !== undefined) attemptedLive = true;
    const live = await interpretViaMuse(text, opts);
    if (live && live.kind !== 'done') {
      return { intent: live, live: true, direct: false, latencyMs: Date.now() - t0, model: MUSE_MODEL, offline: false };
    }
  }
  let intent = classifyIntent(text, state);
  if (intent.kind !== 'done') {
    const stripped = stripTrailingStopPhrase(text);
    if (!stripped) return 'empty';
    if (stripped !== text) intent = classifyIntent(stripped, state);
  }
  return { intent, live: false, direct: false, latencyMs: Date.now() - t0, model: null, offline: attemptedLive };
}

const DEFAULT_CAPTAIN_TIMEOUT_MS = 30000;
const MAX_CONTEXT_CHARS = 8000;

export interface CaptainResult {
  plan: Omit<CaptainPlan, 'trace'> & { trace: string[] };
  latencyMs: number;
  model: string;
  direct: boolean;
}

function asCaptain(value: unknown): Omit<CaptainPlan, 'trace'> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const raw = obj.plan !== undefined ? obj.plan : value;
  return toCaptainPlan(raw);
}

/** POST day context to the sibling captain route; null on any failure. */
export async function captainViaMuse(context: string, opts: LiveOpts = {}): Promise<CaptainResult | null> {
  const ctx = context.trim();
  if (!ctx || ctx.length > MAX_CONTEXT_CHARS) return null;
  const url = opts.proxyUrl !== undefined
    ? opts.proxyUrl.trim()
    : proxySibling(configuredProxyUrl(), 'captain');
  if (!url) return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  const t0 = Date.now();
  try {
    const draft = asCaptain(await postJson(url, { context: ctx }, {}, fetchFn, opts.timeoutMs ?? DEFAULT_CAPTAIN_TIMEOUT_MS));
    if (!draft) return null;
    return { plan: { ...draft, trace: [`Live Captain via proxy • ${MUSE_MODEL}`] }, latencyMs: Date.now() - t0, model: MUSE_MODEL, direct: false };
  } catch {
    return null;
  }
}

/** POST day context straight to a chat backend with the user's key. */
async function captainWith(
  url: string, model: string, context: string, key: string,
  trace: string, opts: LiveOpts,
): Promise<CaptainResult | null> {
  const ctx = context.trim();
  const k = key.trim();
  if (!ctx || ctx.length > MAX_CONTEXT_CHARS || !k) return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  const t0 = Date.now();
  try {
    const payload = await postJson(url, {
      model,
      messages: [
        { role: 'developer', content: CAPTAIN_PROMPT },
        { role: 'user', content: ctx },
      ],
    }, { Authorization: `Bearer ${k}` }, fetchFn, opts.timeoutMs ?? DEFAULT_CAPTAIN_TIMEOUT_MS);
    const content = replyText(payload);
    if (!content) return null;
    const draft = toCaptainPlan(extractJsonObject(content));
    if (!draft) return null;
    return { plan: { ...draft, trace: [trace] }, latencyMs: Date.now() - t0, model, direct: true };
  } catch {
    return null;
  }
}

/** POST day context straight to Muse with the user's key. */
export async function captainDirect(context: string, key: string, opts: LiveOpts = {}): Promise<CaptainResult | null> {
  return captainWith(MUSE_URL, MUSE_MODEL, context, key, `Direct Captain • ${MUSE_MODEL}`, opts);
}

/** POST day context to Muse Spark Open on Baseten with the user's key. */
export async function captainOpen(context: string, key: string, opts: LiveOpts = {}): Promise<CaptainResult | null> {
  return captainWith(OPEN_URL, OPEN_MODEL, context, key, `Open Captain • ${OPEN_MODEL} (Baseten)`, opts);
}

/** Direct backends in provider order: selected first, other as fallback. */
function directBackends(): Array<{ open: boolean; key: string | null }> {
  const metaKey = getKey();
  const openKey = getOpenKey();
  return getProvider() === 'open'
    ? [{ open: true, key: openKey }, { open: false, key: metaKey }]
    : [{ open: false, key: metaKey }, { open: true, key: openKey }];
}

/** Captain resolver: direct (provider order) → proxy → null (heuristic). */
export async function resolveCaptain(context: string, opts: LiveOpts = {}): Promise<CaptainResult | null> {
  for (const b of directBackends()) {
    if (!b.key) continue;
    const direct = b.open
      ? await captainOpen(context, b.key, opts)
      : await captainDirect(context, b.key, opts);
    if (direct) return direct;
  }
  if (liveModeEnabled()) return captainViaMuse(context, opts);
  return null;
}

export interface ProposalResult {
  proposal: Proposal;
  model: string;
  latencyMs: number;
  direct: boolean;
}

const DEFAULT_PROPOSE_TIMEOUT_MS = 25000;
const MAX_PROPOSE_TEXT = 2000;

function asProposal(value: unknown): Proposal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  return toProposal(obj.proposal !== undefined ? obj.proposal : value);
}

/** POST note text straight to a chat backend; proposal or null. */
async function proposeWith(
  url: string, model: string, text: string, today: string, key: string, opts: LiveOpts,
): Promise<Proposal | null> {
  const t = text.trim();
  const k = key.trim();
  if (!t || t.length > MAX_PROPOSE_TEXT || !k || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  try {
    const payload = await postJson(url, {
      model,
      messages: [
        { role: 'developer', content: PROPOSE_PROMPT },
        { role: 'user', content: `Today is ${today}.\n\n${t}` },
      ],
    }, { Authorization: `Bearer ${k}` }, fetchFn, opts.timeoutMs ?? DEFAULT_PROPOSE_TIMEOUT_MS);
    const content = replyText(payload);
    if (!content) return null;
    return toProposal(extractJsonObject(content));
  } catch {
    return null;
  }
}

/** POST note text straight to Muse with the user's key. */
export async function proposeDirect(text: string, today: string, key: string, opts: LiveOpts = {}): Promise<Proposal | null> {
  return proposeWith(MUSE_URL, MUSE_MODEL, text, today, key, opts);
}

/** POST note text to Muse Spark Open on Baseten with the user's key. */
export async function proposeOpen(text: string, today: string, key: string, opts: LiveOpts = {}): Promise<Proposal | null> {
  return proposeWith(OPEN_URL, OPEN_MODEL, text, today, key, opts);
}

/** POST note text to the sibling propose route; proposal or null. */
export async function proposeViaMuse(text: string, today: string, opts: LiveOpts = {}): Promise<Proposal | null> {
  const t = text.trim();
  if (!t || t.length > MAX_PROPOSE_TEXT || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const url = opts.proxyUrl !== undefined
    ? opts.proxyUrl.trim()
    : proxySibling(configuredProxyUrl(), 'propose');
  if (!url) return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  try {
    return asProposal(await postJson(url, { text: t, today }, {}, fetchFn, opts.timeoutMs ?? DEFAULT_PROPOSE_TIMEOUT_MS));
  } catch {
    return null;
  }
}

/** Proposal resolver: direct (provider order) → proxy → null (local). */
export async function resolveProposal(text: string, today: string, opts: LiveOpts = {}): Promise<ProposalResult | null> {
  const t0 = Date.now();
  for (const b of directBackends()) {
    if (!b.key) continue;
    const proposal = b.open
      ? await proposeOpen(text, today, b.key, opts)
      : await proposeDirect(text, today, b.key, opts);
    if (proposal) {
      return { proposal, model: b.open ? OPEN_MODEL : MUSE_MODEL, latencyMs: Date.now() - t0, direct: true };
    }
  }
  if (!liveModeEnabled()) return null;
  const proposal = await proposeViaMuse(text, today, opts);
  if (!proposal) return null;
  return { proposal, model: MUSE_MODEL, latencyMs: Date.now() - t0, direct: false };
}

const DEFAULT_TRANSCRIBE_TIMEOUT_MS = 30000;
const MAX_WAV_B64 = 2000000;

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    if (typeof (globalThis as { Buffer?: unknown }).Buffer === 'function') {
      const buf = (globalThis as unknown as { Buffer: { from(s: string, e: string): Uint8Array } }).Buffer.from(b64, 'base64');
      return new Uint8Array(buf);
    }
    const atobFn = (globalThis as { atob?: (s: string) => string }).atob;
    if (!atobFn) return null;
    const bin = atobFn(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function asTranscript(value: unknown): string | null {
  const t = (value as { transcript?: unknown } | null)?.transcript;
  return typeof t === 'string' && t.trim() ? t.trim().slice(0, 1000) : null;
}

/** POST base64 WAV to the sibling transcribe route; transcript or null. */
export async function transcribeViaMuse(audioB64: string, opts: LiveOpts = {}): Promise<string | null> {
  const audio = audioB64.trim();
  if (!audio || audio.length > MAX_WAV_B64) return null;
  const url = opts.proxyUrl !== undefined
    ? opts.proxyUrl.trim()
    : proxySibling(configuredProxyUrl(), 'transcribe');
  if (!url) return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  try {
    return asTranscript(await postJson(url, { audio }, {}, fetchFn, opts.timeoutMs ?? DEFAULT_TRANSCRIBE_TIMEOUT_MS));
  } catch {
    return null;
  }
}

export interface DreamResult {
  image: string;
  model: string;
  latencyMs: number;
  direct: boolean;
}

function asDream(value: unknown): { image: string; model: string } | null {
  const obj = value as { image?: unknown; model?: unknown } | null;
  if (!obj || typeof obj.image !== 'string') return null;
  const img = obj.image;
  const ok = img.startsWith('data:image/') || img.startsWith('https://');
  if (!ok || img.length > 15000000) return null;
  return { image: img, model: typeof obj.model === 'string' ? obj.model : 'muse-image-1.0' };
}

/** POST day words to the sibling dream route; image or null. */
export async function dreamViaMuse(words: string, opts: LiveOpts = {}): Promise<DreamResult | null> {
  const w = words.trim();
  if (!w || w.length > 200) return null;
  const url = opts.proxyUrl !== undefined
    ? opts.proxyUrl.trim()
    : proxySibling(configuredProxyUrl(), 'dream');
  if (!url) return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  const t0 = Date.now();
  try {
    const out = asDream(await postJson(url, { words: w }, {}, fetchFn, opts.timeoutMs ?? 60000));
    if (!out) return null;
    return { ...out, latencyMs: Date.now() - t0, direct: false };
  } catch {
    return null;
  }
}

/** POST day words straight to Muse Image with the user's key. */
export async function dreamDirect(words: string, key: string, opts: LiveOpts = {}): Promise<DreamResult | null> {
  const w = words.trim();
  const k = key.trim();
  if (!w || w.length > 200 || !k) return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  const t0 = Date.now();
  try {
    const payload = await postJson(DREAM_URL, {
      model: DREAM_MODEL, prompt: DREAM_STYLE + w, n: 1,
    }, { Authorization: `Bearer ${k}` }, fetchFn, opts.timeoutMs ?? 60000);
    const image = dreamImage(payload);
    if (!image) return null;
    return { image, model: DREAM_MODEL, latencyMs: Date.now() - t0, direct: true };
  } catch {
    return null;
  }
}

/** POST base64 WAV straight to Muse Voice Transcribe with the user's key. */
export async function transcribeDirect(audioB64: string, key: string, opts: LiveOpts = {}): Promise<string | null> {
  const audio = audioB64.trim();
  const k = key.trim();
  if (!audio || audio.length > MAX_WAV_B64 || !k) return null;
  const bytes = b64ToBytes(audio);
  if (!bytes || typeof FormData === 'undefined') return null;
  const fetchFn = opts.fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return null;
  const form = new FormData();
  form.append('request', new Blob([transcribeRequestJson()], { type: 'application/json' }));
  form.append('audio', new Blob([bytes as unknown as BlobPart], { type: 'audio/wav' }), 'clip.wav');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TRANSCRIBE_TIMEOUT_MS);
  try {
    const res = await fetchFn(TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${k}` },
      body: form,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return transcribeText((await res.json()) as unknown);
  } catch {
    clearTimeout(timer);
    return null;
  }
}
