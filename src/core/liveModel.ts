// Live Muse adapter (client side). interpretViaMuse POSTs a transcript to the
// Vercel proxy and schema-checks the reply; resolveIntent tries live first and
// falls back to local classifyIntent. Proxy responses are untrusted input:
// exact-keys validation, null on any failure, timeout, or mismatch.

import { classifyIntent, type AssistantIntent } from './assistant.js';
import { stripTrailingStopPhrase } from '../voice.js';
import type { AppState } from './types.js';

export const LIVE_LABEL = 'Live Muse interpretation';

const LIVE_KEY = 'pocketroom.liveMuse';
const MAX_TRANSCRIPT = 1000;
const MAX_FIELD = 500;
const DEFAULT_TIMEOUT_MS = 15000;

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
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ctrl = new AbortController();
  try {
    const res = await new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        ctrl.abort();
        reject(new Error('live timed out'));
      }, timeoutMs);
      fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text }),
        signal: ctrl.signal,
      }).then(
        (r) => { clearTimeout(timer); resolve(r); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });
    if (!res.ok) return null;
    return asIntent((await res.json()) as unknown);
  } catch {
    return null;
  }
}

export type ResolvedIntent = { intent: AssistantIntent; live: boolean } | 'empty';

/** Live-first resolution with local fallback. A live `done` is never trusted
    — task identity is local-only — so it falls back to local matching too. */
export async function resolveIntent(text: string, state: AppState, opts: LiveOpts = {}): Promise<ResolvedIntent> {
  if (liveModeEnabled()) {
    const live = await interpretViaMuse(text, opts);
    if (live && live.kind !== 'done') return { intent: live, live: true };
  }
  let intent = classifyIntent(text, state);
  if (intent.kind !== 'done') {
    const stripped = stripTrailingStopPhrase(text);
    if (!stripped) return 'empty';
    if (stripped !== text) intent = classifyIntent(stripped, state);
  }
  return { intent, live: false };
}
