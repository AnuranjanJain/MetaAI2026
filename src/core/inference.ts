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

// --- Belonging search ---

export interface SearchHit {
  belonging: Belonging;
  location?: StorageLocation;
  score: number;
}

/** Token search over names, descriptions, and location names. Returns ranked hits. */
export function searchBelongings(
  query: string, belongings: Belonging[], locations: StorageLocation[],
): SearchHit[] {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));
  if (!tokens.length) return [];
  const locById = new Map(locations.map((l) => [l.id, l]));
  return belongings
    .map((b) => {
      const loc = b.locationId ? locById.get(b.locationId) : undefined;
      const hay = `${b.name} ${b.description ?? ''} ${loc?.name ?? ''}`.toLowerCase();
      let matched = 0;
      for (const t of tokens) if (hay.includes(t)) matched++;
      return { belonging: b, location: loc, score: matched };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.belonging.name.localeCompare(b.belonging.name));
}

const STOP = new Set(['where', 'did', 'put', 'the', 'find', 'what', 'and', 'for', 'with', 'have', 'that', 'this', 'from']);

export type { Outfit };
