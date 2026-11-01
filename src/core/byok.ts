// Bring-your-own-key storage + validation. The key lives only in this
// browser's localStorage (per-origin), is never displayed back, and is sent
// only to api.meta.ai. Clear it on shared devices.

import { postJson, replyText, MUSE_MODEL, MUSE_URL, INTERPRET_PROMPT } from './muse.js';

const KEY = 'pocketroom.museKey';
const VALIDATE_TIMEOUT_MS = 15000;

export function getKey(): string | null {
  try {
    const v = globalThis.localStorage?.getItem(KEY)?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

export function hasKey(): boolean {
  return getKey() !== null;
}

export function setKey(key: string): void {
  const v = key.trim();
  try {
    if (!v) globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, v);
  } catch { /* memory-only */ }
}

export function clearKey(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch { /* noop */ }
}

export type KeyStatus = 'ok' | 'rejected' | 'unreachable';

/** Validate with one tiny direct interpretation. Never throws. */
export async function validateKey(
  key: string, fetchFn?: typeof fetch, timeoutMs = VALIDATE_TIMEOUT_MS,
): Promise<KeyStatus> {
  const k = key.trim();
  if (!k) return 'rejected';
  const fn = fetchFn ?? globalThis.fetch?.bind(globalThis);
  if (!fn) return 'unreachable';
  try {
    const payload = await postJson(MUSE_URL, {
      model: MUSE_MODEL,
      messages: [
        { role: 'developer', content: INTERPRET_PROMPT },
        { role: 'user', content: 'test' },
      ],
    }, { Authorization: `Bearer ${k}` }, fn, timeoutMs);
    return replyText(payload) ? 'ok' : 'unreachable';
  } catch (e) {
    const status = (e as { status?: unknown }).status;
    return status === 401 || status === 403 ? 'rejected' : 'unreachable';
  }
}
