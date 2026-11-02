// Open-weights backend: Muse Spark Open via Baseten Model APIs (BYOK).
// Verified 2026-11-02 against
// https://docs.baseten.co/reference/inference-api/chat-completions.md:
// POST https://inference.baseten.co/v1/chat/completions, OpenAI-compatible,
// {model:"meta-models/muse-spark-open-1026", messages} with a Bearer key.
// The hackathon guide names the model slug; the request shape is Baseten's.
// The Baseten key lives only in this browser's localStorage, like byok.ts.

import { postJson, replyText } from './muse.js';

export const OPEN_URL = 'https://inference.baseten.co/v1/chat/completions';
export const OPEN_MODEL = 'meta-models/muse-spark-open-1026';
export const OPEN_LABEL = 'Open Muse via Baseten';

const KEY = 'pocketroom.basetenKey';
const PROVIDER_KEY = 'pocketroom.provider';
const VALIDATE_TIMEOUT_MS = 20000;

export type Provider = 'meta' | 'open';

export function getOpenKey(): string | null {
  try {
    const v = globalThis.localStorage?.getItem(KEY)?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

export function hasOpenKey(): boolean {
  return getOpenKey() !== null;
}

export function setOpenKey(key: string): void {
  const v = key.trim();
  try {
    if (!v) globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, v);
  } catch { /* memory-only */ }
}

export function clearOpenKey(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch { /* noop */ }
}

/** Selected chat backend. 'meta' (Muse Spark) by default. */
export function getProvider(): Provider {
  try {
    return globalThis.localStorage?.getItem(PROVIDER_KEY) === 'open' ? 'open' : 'meta';
  } catch {
    return 'meta';
  }
}

export function setProvider(p: Provider): void {
  try {
    globalThis.localStorage?.setItem(PROVIDER_KEY, p);
  } catch { /* memory-only */ }
}

export type KeyStatus = 'ok' | 'rejected' | 'unreachable';

/** Validate with one tiny chat completion. Never throws. */
export async function validateOpenKey(
  key: string, fetchFn?: typeof fetch, timeoutMs = VALIDATE_TIMEOUT_MS,
): Promise<KeyStatus> {
  const k = key.trim();
  if (!k) return 'rejected';
  const fn = fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fn) return 'unreachable';
  try {
    const payload = await postJson(OPEN_URL, {
      model: OPEN_MODEL,
      messages: [{ role: 'user', content: 'test' }],
    }, { Authorization: `Bearer ${k}` }, fn, timeoutMs);
    return replyText(payload) ? 'ok' : 'unreachable';
  } catch (e) {
    const status = (e as { status?: unknown }).status;
    return status === 401 || status === 403 ? 'rejected' : 'unreachable';
  }
}
