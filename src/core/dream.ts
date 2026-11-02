// Dream poster prompt + reply parsing. Pure + DOM-free.
// Verified 2026-11-02 against https://dev.meta.ai/docs/image-generation:
// POST https://api.meta.ai/v1/images/generations (OpenAI-compatible)
// {model:"muse-image-1.0", prompt, n:1} → {data:[{b64_json|url}]}.

import { dayVibe } from './share.js';
import type { AppState } from './types.js';

export const DREAM_URL = 'https://api.meta.ai/v1/images/generations';
export const DREAM_MODEL = 'muse-image-1.0';
/** Fixed cozy style prefix, applied server-side. Day words append after it. */
export const DREAM_STYLE = 'Cozy storybook illustration, warm ivory and sage palette, soft morning light, no text, no words, no letters: ';

/** Day words for the dream prompt: occasion + headline + first events.
    Capped and text-only; the style prefix is added by the proxy. */
export function dreamWords(state: AppState, date: string): string {
  const vibe = dayVibe(state, date);
  const events = state.events
    .filter((e) => e.date === date)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 3)
    .map((e) => e.title)
    .join(', ');
  const words = `${vibe.occasion} day, ${vibe.headline}${events ? `, ${events}` : ''}`
    .replace(/[^a-zA-Z0-9 ,'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return words || 'a calm day';
}

/** Parse an OpenAI-shaped images reply into a displayable image string:
    a PNG data URL when b64_json arrives, else the https URL. */
export function dreamImage(payload: unknown): string | null {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || !data.length) return null;
  const first = data[0] as { b64_json?: unknown; url?: unknown };
  if (typeof first.b64_json === 'string' && /^[A-Za-z0-9+/=\s]+$/.test(first.b64_json)) {
    const clean = first.b64_json.replace(/\s+/g, '');
    if (clean.length > 1000 && clean.length < 15000000) return `data:image/png;base64,${clean}`;
    return null;
  }
  if (typeof first.url === 'string' && first.url.startsWith('https://')) {
    return first.url.slice(0, 2000);
  }
  return null;
}
