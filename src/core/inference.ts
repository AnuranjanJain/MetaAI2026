// Demo interpretation engine. On-device heuristics only — no model calls.
// Every proposal surface must show DEMO_LABEL so simulated help is never
// mistaken for live inference. A live Muse Spark adapter would live behind
// a server route (see docs/integrations.md); it is not wired here because
// no API key is configured in this environment.

import type { Belonging, Clothing, Id, Outfit, Proposal, StorageLocation } from './types.js';
import { addDaysKey, todayKey } from './model.js';

export const DEMO_LABEL = 'Demo interpretation — on-device heuristics, no model call';

const EVENT_WORDS = [
  'meeting', 'appointment', 'class', 'lecture', 'seminar', 'dentist', 'doctor',
  'interview', 'dinner', 'lunch', 'flight', 'exam', 'deadline', 'party', 'call',
];
const TASK_WORDS = ['buy', 'do', 'finish', 'submit', 'call', 'email', 'send', 'homework', 'read', 'write', 'clean'];
const ITEM_WORDS = ['bring', 'pack', 'remember', 'forget', 'need', 'charger', 'adapter', 'keys', 'passport', 'umbrella', 'laptop'];

const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
const TIME24_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const DURATION_RE = /(\d+)\s*(min|mins|minutes|h|hr|hrs|hour|hours)\b/i;
const PLACE_RE = /\b(?:at|in|room|building)\s+([A-Z][\w .'-]{1,30})/;

function parseTime(text: string): string | undefined {
  const m12 = TIME_RE.exec(text);
  if (m12) {
    let h = Number(m12[1]) % 12;
    if (m12[3].toLowerCase() === 'pm') h += 12;
    return `${String(h).padStart(2, '0')}:${m12[2] ?? '00'}`;
  }
  const m24 = TIME24_RE.exec(text);
  if (m24) return `${m24[1].padStart(2, '0')}:${m24[2]}`;
  return undefined;
}

function parseDate(text: string): string | undefined {
  const lower = text.toLowerCase();
  const today = todayKey();
  if (/\btoday\b/.test(lower)) return today;
  if (/\btomorrow\b/.test(lower)) return addDaysKey(today, 1);
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const now = new Date();
      let delta = (i - now.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      return addDaysKey(today, delta);
    }
  }
  const md = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(text);
  if (md) {
    const year = md[3] ? (md[3].length === 2 ? 2000 + Number(md[3]) : Number(md[3])) : new Date().getFullYear();
    return `${year}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`;
  }
  return undefined;
}

function parseDuration(text: string): number | undefined {
  const m = DURATION_RE.exec(text);
  if (!m) return undefined;
  const n = Number(m[1]);
  return /h/.test(m[2].toLowerCase()) ? n * 60 : n;
}

function firstSentence(text: string): string {
  const line = text.split(/\n+/).map((s) => s.trim()).find(Boolean) ?? '';
  return (line.split(/[.!?]/).map((s) => s.trim()).find(Boolean) ?? line).slice(0, 80) || 'Untitled';
}

function score(text: string, words: string[]): number {
  const tokens = new Set(text.toLowerCase().split(/[^a-z0-9']+/));
  return words.reduce((n, w) => (tokens.has(w) ? n + 1 : n), 0);
}

/** Propose a type + extracted fields. Extracts only supported info; gaps go to `missing`. */
export function propose(text: string, hasImage: boolean): Proposal {
  const clean = text.trim();
  const time = parseTime(clean);
  const date = parseDate(clean);
  const durationMin = parseDuration(clean);
  const placeMatch = PLACE_RE.exec(clean);
  const place = placeMatch ? placeMatch[1].trim() : undefined;

  const eventHits = score(clean, EVENT_WORDS);
  const taskScore = score(clean, TASK_WORDS);
  const itemScore = score(clean, ITEM_WORDS);

  let type: Proposal['type'] = 'reference';
  if (eventHits >= 1 || (time && taskScore === 0 && itemScore === 0)) type = 'event';
  else if (itemScore > taskScore && itemScore > 0) type = 'item';
  else if (taskScore > 0) type = 'task';

  const missing: string[] = [];
  if (type === 'event') {
    if (!date) missing.push('No date found in the source — please pick one.');
    if (!time) missing.push('No time found in the source — please pick one.');
  }
  if (type === 'task' && !durationMin) missing.push('No duration found — assumed 30 minutes, edit as needed.');
  if (type === 'item') missing.push('Storage location unknown — add it in Drawers & shelves.');
  if (hasImage && !clean) missing.push('Image has no caption — describe it so extraction stays grounded.');

  const confidence = missing.length === 0 ? 'high' : missing.length <= 1 ? 'medium' : 'low';
  const rationale =
    type === 'event'
      ? `Looked like an appointment (${eventHits} schedule keyword${eventHits === 1 ? '' : 's'}${time ? ', time found' : ''}${date ? ', date found' : ''}). Used only the date/time/place written in the source.`
      : type === 'task'
        ? 'Read as an action the user wants to do. Duration is a guess unless stated.'
        : type === 'item'
          ? 'Read as something to remember or bring. No location is claimed.'
          : 'No clear schedule, action, or item signals — kept as a reference note.';

  return {
    type,
    title: type === 'item' ? guessItemName(clean) : firstSentence(clean),
    date, time, place, durationMin,
    itemName: type === 'item' ? guessItemName(clean) : undefined,
    confidence, missing, rationale,
  };
}

function guessItemName(text: string): string {
  const lower = text.toLowerCase();
  for (const w of ['adapter', 'charger', 'keys', 'passport', 'umbrella', 'laptop', 'headphones', 'wallet', 'gym bag', 'textbook']) {
    if (lower.includes(w)) return w.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return firstSentence(text);
}

export type ProposalSlot = 'date' | 'time' | 'duration';

/** Fields a voice follow-up can honestly ask for, derived from fields — never
    from parsing the human-readable `missing` strings. */
export function missingSlots(p: Proposal): ProposalSlot[] {
  const slots: ProposalSlot[] = [];
  if (p.type === 'event') {
    if (!p.date) slots.push('date');
    if (!p.time) slots.push('time');
  }
  if (p.type === 'task' && !p.durationMin) slots.push('duration');
  return slots;
}

/** Merge one spoken slot answer into a proposal. Unparseable answers leave
    the proposal untouched — the editable card remains the source of truth. */
export function applySlotAnswer(p: Proposal, slot: ProposalSlot, answerText: string): Proposal {
  const text = answerText.trim().slice(0, 200);
  if (!text) return p;
  const next: Proposal = { ...p, missing: [...p.missing] };
  if (slot === 'date') {
    const date = parseDate(text);
    if (!date) return p;
    next.date = date;
    next.missing = next.missing.filter((m) => !/date/i.test(m));
  } else if (slot === 'time') {
    const time = parseTime(text);
    if (!time) return p;
    next.time = time;
    next.missing = next.missing.filter((m) => !/time/i.test(m));
  } else {
    const durationMin = parseDuration(text);
    if (!durationMin) return p;
    next.durationMin = durationMin;
    next.missing = next.missing.filter((m) => !/duration/i.test(m));
  }
  next.confidence = next.missing.length === 0 ? 'high' : next.missing.length <= 1 ? 'medium' : 'low';
  return next;
}

/** Validate an edited proposal before it becomes a real record. */
export function validateProposal(p: Proposal): string[] {
  const errors: string[] = [];
  if (!p.title.trim()) errors.push('Title is required.');
  if (p.type === 'event') {
    if (!p.date) errors.push('Events need a date.');
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) errors.push('Date must be YYYY-MM-DD.');
    if (!p.time) errors.push('Events need a start time.');
    else if (!/^\d{2}:\d{2}$/.test(p.time)) errors.push('Time must be HH:MM.');
    if (p.endTime && p.time && p.endTime <= p.time) errors.push('End time must be after start time.');
  }
  if (p.type === 'task' && p.durationMin !== undefined && (p.durationMin < 5 || p.durationMin > 480)) {
    errors.push('Duration must be between 5 and 480 minutes.');
  }
  return errors;
}

// --- Wardrobe suggestions (deterministic, catalog-only) ---

export interface OutfitSuggestion {
  itemIds: Id[];
  explanation: string;
}

const OCCASION_TAGS: Record<string, string[]> = {
  class: ['casual', 'class'],
  work: ['smart', 'work'],
  gym: ['sport', 'gym'],
  evening: ['smart', 'evening'],
  weekend: ['casual', 'weekend'],
};

const EVENT_OCCASIONS: [RegExp, string][] = [
  [/\b(gym|workout|run|running|yoga|training|swim|fitness)\b/i, 'gym'],
  [/\b(lecture|class|lesson|exam|school|course|seminar|study)\b/i, 'class'],
  [/\b(meeting|office|interview|work|presentation|client)\b/i, 'work'],
  [/\b(dinner|date|party|evening|concert|theatre|theater)\b/i, 'evening'],
];

/**
 * Map an event title to a wardrobe occasion ("Gym session" → gym).
 * Returns undefined when nothing matches — the UI then asks instead
 * of guessing. Keyword order matters: specific activities win.
 */
export function occasionFromEvent(title: string): string | undefined {
  for (const [pattern, occasion] of EVENT_OCCASIONS) {
    if (pattern.test(title)) return occasion;
  }
  return undefined;
}

/** Suggest combinations strictly from available catalog items. Never invents clothes. */
export function suggestOutfits(catalog: Clothing[], occasion: string, max = 3): OutfitSuggestion[] {
  const tags = OCCASION_TAGS[occasion.toLowerCase()] ?? [occasion.toLowerCase()];
  const avail = catalog.filter((c) => c.state === 'available');
  const scoreItem = (c: Clothing) =>
    c.tags.filter((t) => tags.includes(t.toLowerCase())).length * 2 +
    (c.sample ? 0 : 1); // prefer owned items, still usable samples
  const pick = (cat: Clothing['category']) =>
    avail.filter((c) => c.category === cat).sort((a, b) => scoreItem(b) - scoreItem(a));
  const tops = pick('top'), bottoms = pick('bottom'), shoes = pick('shoes'), outers = pick('outer');
  if (!tops.length || !bottoms.length || !shoes.length) return [];
  const suggestions: OutfitSuggestion[] = [];
  for (let i = 0; i < max; i++) {
    const t = tops[i % tops.length], b = bottoms[i % bottoms.length], s = shoes[i % shoes.length];
    const parts = [t, b, s];
    if (outers.length && i === 0) parts.push(outers[0]);
    if (suggestions.some((prev) => prev.itemIds.join() === parts.map((p) => p.id).join())) continue;
    suggestions.push({
      itemIds: parts.map((p) => p.id),
      explanation: explainOutfit(parts, occasion),
    });
  }
  return suggestions;
}

function explainOutfit(parts: Clothing[], occasion: string): string {
  const names = parts.map((p) => p.name).join(', ');
  const colors = [...new Set(parts.map((p) => p.color).filter(Boolean))].join(' / ');
  const owned = parts.filter((p) => !p.sample).length;
  return `${names}. Picked for “${occasion}” from available items${colors ? ` in ${colors}` : ''} — ${owned} of ${parts.length} from your own clothes.`;
}

// --- On-device text matching (shared by belongings + clothing search) ---

/** Lowercase, split on non-alphanumerics, drop stop-words, expand
    synonyms on the raw tokens, then light stemming (plurals, -ing, -ed)
    so "chargers" and "trainers" both match. Pure. */
export function normalizeTokens(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/-/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
  return [...expandSynonyms(raw)].map(stemToken).filter((t) => t.length > 1);
}

function stemToken(t: string): string {
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('ed')) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

/** Hand-built synonyms for common household + clothing words, looked up
    on raw (unstemmed) tokens so plurals still expand. Small and honest:
    this is lexical matching, not embedding search. */
const SYNONYMS: Record<string, string> = {
  charger: 'adapter', adapter: 'charger', cable: 'charger', cord: 'charger',
  hoodie: 'sweatshirt', sweatshirt: 'hoodie', jumper: 'sweatshirt',
  sneakers: 'trainers', trainers: 'sneakers', kicks: 'sneakers',
  tee: 'shirt', shirt: 'tee', tshirt: 'shirt',
  jeans: 'denim', denim: 'jeans',
  specs: 'glasses', shades: 'sunglasses',
  laptop: 'notebook', mobile: 'phone', cellphone: 'phone',
  keys: 'keyring', wallet: 'purse', purse: 'wallet',
  brolly: 'umbrella',
};

function expandSynonyms(tokens: string[]): Set<string> {
  const out = new Set(tokens);
  for (const t of tokens) {
    const s = SYNONYMS[t];
    if (s) out.add(s);
  }
  return out;
}

/** Edit distance capped at 2 — enough for a typo, cheap on short tokens. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
    if (Math.min(...prev) > 1) return 2;
  }
  return prev[b.length];
}

/** Score how well haystack tokens cover the query: exact/stem/synonym hits
    weigh 2, one-typo fuzzy hits weigh 1 (tokens ≥ 5 chars only). */
export function tokenMatchScore(queryTokens: Set<string>, hayTokens: string[]): number {
  let score = 0;
  const hay = new Set(hayTokens);
  for (const q of queryTokens) {
    if (hay.has(q)) { score += 2; continue; }
    let fuzzy = false;
    if (q.length >= 5) {
      for (const h of hay) {
        if (h.length >= 5 && editDistance(q, h) <= 1) { fuzzy = true; break; }
      }
    }
    if (fuzzy) score += 1;
  }
  return score;
}

/** Expand query text into matchable tokens (normalized + synonyms). */
export function queryTokenSet(query: string): Set<string> {
  return new Set(normalizeTokens(query));
}

export interface SearchHit {
  belonging: Belonging;
  location?: StorageLocation;
  score: number;
}

/** Token search over names, descriptions, and location names, with
    stemming, synonyms, and typo tolerance. Exact hits rank above fuzzy.
    Returns ranked hits. */
export function searchBelongings(
  query: string, belongings: Belonging[], locations: StorageLocation[],
): SearchHit[] {
  const tokens = queryTokenSet(query);
  if (!tokens.size) return [];
  const locById = new Map(locations.map((l) => [l.id, l]));
  return belongings
    .map((b) => {
      const loc = b.locationId ? locById.get(b.locationId) : undefined;
      const hay = normalizeTokens(`${b.name} ${b.description ?? ''} ${loc?.name ?? ''}`);
      return { belonging: b, location: loc, score: tokenMatchScore(tokens, hay) };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.belonging.name.localeCompare(b.belonging.name));
}

export interface ClothingHit {
  item: Clothing;
  score: number;
}

/** Token search over clothing names, colors, categories, and tags. */
export function searchClothing(query: string, catalog: Clothing[]): ClothingHit[] {
  const tokens = queryTokenSet(query);
  if (!tokens.size) return [];
  return catalog
    .map((c) => {
      const hay = normalizeTokens(`${c.name} ${c.color ?? ''} ${c.category} ${c.tags.join(' ')}`);
      return { item: c, score: tokenMatchScore(tokens, hay) };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
}

const STOP = new Set(['where', 'did', 'put', 'the', 'find', 'what', 'and', 'for', 'with', 'have', 'that', 'this', 'from']);

export type { Outfit };
