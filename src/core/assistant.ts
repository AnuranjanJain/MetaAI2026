// Voice assistant intent layer (pure, testable). Speech-to-text lives in
// voice.ts; this module only decides what an utterance means. Anything that
// would mutate state is returned as an intent for the UI to confirm — the
// assistant never creates, completes, or deletes records on its own.

import { cleanItemText, collapseRepeats, normalizeTokens, queryTokenSet, searchBelongings, searchClothing, suggestOutfits, occasionFromEvent, tokenMatchScore } from './inference.js';
import { todayKey } from './model.js';
import type { AppState, Id, Proposal } from './types.js';

export type AssistantIntent =
  | { kind: 'add'; text: string; reason: string }
  | { kind: 'done'; taskId: Id; title: string; reason: string }
  | { kind: 'where'; query: string; reason: string }
  | { kind: 'next'; reason: string }
  | { kind: 'have'; query: string; reason: string }
  | { kind: 'wear'; reason: string }
  | { kind: 'wardrobe'; query: string; reason: string }
  | { kind: 'routine'; name: string; reason: string }
  | { kind: 'routineAdd'; routineQuery: string; itemText: string; reason: string }
  | { kind: 'outing'; query: string; reason: string }
  | { kind: 'rename'; target: string; newName: string; reason: string }
  | { kind: 'spot'; name: string; reason: string }
  | { kind: 'desk'; reason: string }
  | { kind: 'ambiguous'; text: string; reason: string }
  | { kind: 'unknown'; text: string; reason: string };

const clean = (text: string) => collapseRepeats(text.trim().replace(/\s+/g, ' ').slice(0, 1000));
const stripEnd = (text: string) => text.replace(/[.?!]+$/, '').trim();
const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function taskCandidate(raw: string): string | null {
  const text = stripEnd(clean(raw));
  const patterns = [
    /^(?:please\s+)?(?:mark|set)\s+(.+?)\s+(?:as\s+)?done$/i,
    /^(?:i\s+)?(?:finished|completed|did)\s+(.+)$/i,
    /^(.+?)\s+is\s+done$/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return stripEnd(m[1]);
  }
  return null;
}

export function matchRoutine(candidate: string, state: AppState): { id: Id; name: string } | null {
  const wanted = norm(candidate);
  if (!wanted) return null;
  const wantedTokens = new Set(wanted.split(' '));
  let best: { id: Id; name: string; score: number } | null = null;
  let tied = false;
  for (const r of state.routines) {
    const name = norm(r.name);
    let score = 0;
    if (name === wanted) score = 100;
    else if (name.includes(wanted) || wanted.includes(name)) score = 60;
    else {
      const overlap = name.split(' ').filter((t) => wantedTokens.has(t)).length;
      score = overlap >= 1 ? overlap * 10 : 0;
    }
    if (score > 0 && (!best || score > best.score)) { best = { id: r.id, name: r.name, score }; tied = false; }
    else if (score > 0 && best && score === best.score) tied = true;
  }
  return best && !tied ? { id: best.id, name: best.name } : null;
}

/** Match an event by title words; prefers today-or-later outings. */
export function matchEvent(candidate: string, state: AppState): { id: Id; title: string } | null {
  const wanted = norm(candidate);
  if (!wanted) return null;
  const wantedTokens = new Set(wanted.split(' '));
  let best: { id: Id; title: string; score: number } | null = null;
  let tied = false;
  for (const e of state.events) {
    const title = norm(e.title);
    let score = 0;
    if (title === wanted) score = 100;
    else if (title.includes(wanted) || wanted.includes(title)) score = 60;
    else {
      const overlap = title.split(' ').filter((t) => wantedTokens.has(t)).length;
      score = overlap >= 1 ? overlap * 10 : 0;
    }
    if (score > 0 && (!best || score > best.score)) { best = { id: e.id, title: e.title, score }; tied = false; }
    else if (score > 0 && best && score === best.score) tied = true;
  }
  return best && !tied ? { id: best.id, title: best.title } : null;
}

export interface Renamable {
  scope: 'capture' | 'spot' | 'belonging';
  id: Id;
  name: string;
}

/** Find records a "rename X" target could mean, across desk items,
    spots, and belongings. The view acts only on exactly one match. */
export function findRenamable(target: string, state: AppState): Renamable[] {
  const tokens = queryTokenSet(target);
  if (!tokens.size) return [];
  const out: Renamable[] = [];
  for (const c of state.captures) {
    if (tokenMatchScore(tokens, normalizeTokens(c.name)) > 0) {
      out.push({ scope: 'capture', id: c.id, name: c.name });
    }
  }
  for (const l of state.locations) {
    if (tokenMatchScore(tokens, normalizeTokens(l.name)) > 0) {
      out.push({ scope: 'spot', id: l.id, name: l.name });
    }
  }
  for (const b of state.belongings) {
    if (tokenMatchScore(tokens, normalizeTokens(`${b.name} ${b.description ?? ''}`)) > 0) {
      out.push({ scope: 'belonging', id: b.id, name: b.name });
    }
  }
  return out;
}

/** Pull an "in <spot>" tail off item text ("passport in top drawer").
    Returns the item words and the spot hint. Pure. */
export function splitLocationHint(text: string): { item: string; hint: string | null } {
  const m = /\bin\s+(?:the\s+|my\s+)?([a-z0-9][\w\s-]{0,40})[.?!]*$/i.exec(text.trim());
  if (!m) return { item: text.trim(), hint: null };
  const item = text.slice(0, m.index).trim().replace(/[,;.]+$/, '').trim();
  if (!item) return { item: text.trim(), hint: null };
  return { item, hint: m[1].trim() };
}

/** Match a spot hint uniquely against location names, or null. */
export function matchLocationHint(hint: string, state: AppState): { id: Id; name: string } | null {
  const tokens = queryTokenSet(hint);
  if (!tokens.size) return null;
  const hits = state.locations.filter(
    (l) => tokenMatchScore(tokens, normalizeTokens(l.name)) > 0,
  );
  return hits.length === 1 ? { id: hits[0].id, name: hits[0].name } : null;
}

function matchTask(candidate: string, state: AppState): { taskId: Id; title: string } | null {
  const wanted = norm(candidate);
  if (!wanted) return null;
  const wantedTokens = new Set(wanted.split(' '));
  let best: { taskId: Id; title: string; score: number } | null = null;
  let tied = false;
  for (const task of state.tasks) {
    if (task.done) continue;
    const title = norm(task.title);
    let score = 0;
    if (title === wanted) score = 100;
    else if (title.includes(wanted) || wanted.includes(title)) score = 60;
    else {
      const overlap = title.split(' ').filter((t) => wantedTokens.has(t)).length;
      score = overlap >= 2 ? overlap * 10 : 0;
    }
    if (score > 0 && (!best || score > best.score)) { best = { taskId: task.id, title: task.title, score }; tied = false; }
    else if (score > 0 && best && score === best.score) tied = true;
  }
  return best && !tied ? { taskId: best.taskId, title: best.title } : null;
}

/** Classify one utterance. Order matters: explicit commands override
    question grammar ("remind me to…" is a task, not a question); read-only
    questions never create anything; ambiguous fragments get one clarifying
    follow-up instead of a guess. Every intent carries a human-readable
    reason so misclassification is visible and correctable. */
export function classifyIntent(rawText: string, state: AppState): AssistantIntent {
  const text = clean(rawText);
  if (!text) return { kind: 'unknown', text: '', reason: 'Nothing heard.' };
  const lower = text.toLowerCase();
  const stripped = stripEnd(text);

  // 1. Explicit commands — question grammar does not override these.
  const remind = /^(?:can you\s+)?(?:please\s+)?remind me to\s+(.+)$/i.exec(stripped);
  if (remind && stripEnd(remind[1])) {
    return {
      kind: 'add', text: stripEnd(remind[1]),
      reason: 'Heard as a reminder command — review it as a task before anything is saved.',
    };
  }

  const candidate = taskCandidate(text);
  if (candidate) {
    const match = matchTask(candidate, state);
    if (match) {
      return {
        kind: 'done', taskId: match.taskId, title: match.title,
        reason: 'Heard as a done command for a task that matches exactly one open item.',
      };
    }
    // Command shape but no unique match: capture the words, never guess.
    return {
      kind: 'add', text,
      reason: 'Sounded like a done command but matched no single task — captured for review instead.',
    };
  }

  // 1b. Routine, outing, rename, and spot commands.
  const makeRoutine =
    /^(?:please\s+)?(?:make|create|start|add)\s+(?:me\s+)?(?:a\s+|me\s+a\s+)?routine(?:\s+(?:called|named)\s+(.+))?$/i.exec(stripped) ??
    /^(?:please\s+)?(?:make|create)\s+(?:a\s+)?(.+?)\s+routine$/i.exec(stripped);
  if (makeRoutine) {
    const name = stripEnd(makeRoutine[1] ?? '');
    return {
      kind: 'routine', name,
      reason: name
        ? 'Heard as a new-routine command — review the name before anything is created.'
        : 'Heard as a new-routine command — needs a name first.',
    };
  }

  const routineAdd = /^(?:please\s+)?add\s+(.+?)\s+to\s+(?:the\s+|my\s+)?(.+?)\s+routine$/i.exec(stripped);
  if (routineAdd && stripEnd(routineAdd[1]) && stripEnd(routineAdd[2])) {
    const itemText = cleanItemText(stripEnd(routineAdd[1]));
    if (!itemText) {
      return {
        kind: 'ambiguous', text,
        reason: 'Could not tell what to add to the routine — say it once more.',
      };
    }
    return {
      kind: 'routineAdd', itemText, routineQuery: stripEnd(routineAdd[2]),
      reason: 'Heard as add-to-routine — review what gets linked before anything changes.',
    };
  }

  const outing = /^(?:outing\s+plan|pack)(?:\s+for)?\s+(.+)$/i.exec(stripped);
  if (outing && stripEnd(outing[1])) {
    return {
      kind: 'outing', query: stripEnd(outing[1]),
      reason: 'Heard as an outing-plan request — review the list before anything is added.',
    };
  }

  const rename = /^(?:please\s+)?rename\s+(.+?)\s+to\s+(.+)$/i.exec(stripped);
  if (rename && stripEnd(rename[1]) && stripEnd(rename[2])) {
    return {
      kind: 'rename', target: stripEnd(rename[1]), newName: stripEnd(rename[2]),
      reason: 'Heard as a rename — review the match before anything changes.',
    };
  }

  const spot = /^(?:please\s+)?(?:add|create|make|remember)\s+(?:a\s+|a new\s+)?(?:storage\s+)?spot\s+(?:called\s+|named\s+)?(.+)$/i.exec(stripped);
  if (spot && stripEnd(spot[1])) {
    return {
      kind: 'spot', name: stripEnd(spot[1]),
      reason: 'Heard as a new-spot command — review the name before anything is created.',
    };
  }

  // 2. Information questions — read-only, answered from local records.
  if (/^(what'?s|what is)\s+(next|coming up)\b/.test(lower) || /^next up\b/.test(lower)) {
    return { kind: 'next', reason: 'Heard as a question — reading your day, nothing added.' };
  }

  const deskQ = /^(what'?s|what is)\s+on my desk\b/i.exec(stripped);
  if (deskQ) return { kind: 'desk', reason: 'Heard as a question — summarizing your desk inbox, nothing added.' };

  const have = /^(?:do i have|have i got|is there (?:a|an)|do we have)\s+(.+?)\??$/i.exec(stripped);
  if (have && stripEnd(have[2] ?? have[1])) {
    const query = stripEnd(have[2] ?? have[1]).replace(/^(?:a|an|the)\s+/i, '');
    if (!query) return { kind: 'unknown', text: '', reason: 'Nothing heard.' };
    // Availability/state questions belong to the wardrobe, not yes/no.
    if (/\b(available|clean|ready|laundry|worn|wardrobe|closet)\b/i.test(query)) {
      return {
        kind: 'wardrobe', query,
        reason: 'Heard as a wardrobe question — checking states, nothing added.',
      };
    }
    return {
      kind: 'have', query,
      reason: 'Heard as a question — checking your recorded things, nothing added.',
    };
  }

  // "is my white shirt clean?" — availability check on a named piece.
  const availQ = /^is\s+(?:my\s+|the\s+)?(.+?)\s+(available|clean|ready|washed)\??$/i.exec(stripped);
  if (availQ && stripEnd(availQ[1])) {
    return {
      kind: 'wardrobe', query: stripEnd(availQ[1]),
      reason: 'Heard as a wardrobe question — checking states, nothing added.',
    };
  }

  // "what's in my wardrobe / the laundry" — collection listing.
  const closetQ = /^(?:what'?s|what is)\s+in\s+(?:my\s+|the\s+)?(wardrobe|closet|cupboard|laundry)\??$/i.exec(stripped);
  if (closetQ) {
    return {
      kind: 'wardrobe', query: closetQ[1].toLowerCase(),
      reason: 'Heard as a wardrobe question — listing recorded clothes, nothing added.',
    };
  }

  if (/\bwhat should i wear\b|\bwhat to wear\b/i.test(lower) ||
      (/\boutfit\b/i.test(lower) && /\b(today|tonight|for|to)\b/i.test(lower))) {
    return { kind: 'wear', reason: 'Heard as a question — outfit ideas live in the wardrobe, nothing added.' };
  }

  const where = /^(?:where(?:'s| is| did i put| are)|find|locate)\s+(?:my\s+|the\s+)?(.+)$/i.exec(stripped);
  if (where) {
    return {
      kind: 'where', query: stripEnd(where[1]),
      reason: 'Heard as a question — searching your recorded spots, nothing added.',
    };
  }

  // 3. Statements/proposals go to the confirm card — unless too thin to act on.
  const words = stripped.split(/\s+/).filter(Boolean);
  const hasCue = /\d/.test(stripped) || /\b(tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|evening|afternoon|at|minutes?|hours?|pack|buy|call|remind|add)\b/i.test(stripped);
  if (words.length <= 2 && !hasCue) {
    return {
      kind: 'ambiguous', text,
      reason: 'Too short to tell whether to add it or look it up — asking one follow-up.',
    };
  }

  return { kind: 'add', text, reason: 'Heard as something to save — review it before anything is created.' };
}

/** Answer text for a `where` intent, using the same ranked search as the UI. */
export function whereAnswer(query: string, state: AppState): string {
  const hits = searchBelongings(query, state.belongings, state.locations);
  if (!hits.length) return `I don't have a recorded place for ${query} yet.`;
  const top = hits[0];
  return top.location
    ? `${top.belonging.name} was last recorded in ${top.location.name}.`
    : `${top.belonging.name} has no confirmed location yet.`;
}

/** Answer text for a `have` intent — yes/no from belongings + clothing names. */
export function haveAnswer(query: string, state: AppState): string {
  const q = query.trim().toLowerCase();
  if (!q) return 'Tell me what to look for and I will check.';
  const inBelongings = searchBelongings(query, state.belongings, state.locations);
  const inClothing = searchClothing(query, state.clothing);
  const parts: string[] = [];
  if (inBelongings.length) {
    const b = inBelongings[0].belonging;
    const loc = inBelongings[0].location?.name;
    parts.push(`${b.name}${loc ? `, last recorded in ${loc}` : ''}${inBelongings.length > 1 ? ` (plus ${inBelongings.length - 1} more)` : ''}`);
  }
  if (inClothing.length) {
    const c = inClothing[0].item;
    parts.push(`${c.name} (${c.state})${inClothing.length > 1 ? ` (plus ${inClothing.length - 1} more)` : ''}`);
  }
  return parts.length
    ? `Yes — ${parts.join('; ')}.`
    : `No — nothing called ${query} is recorded.`;
}

const STATE_WORDS = ['available', 'worn', 'laundry', 'unavailable'] as const;

/** Answer text for a `wardrobe` intent — state-aware: only `available`
    counts as available; worn/laundry/unavailable are named explicitly. */
export function wardrobeAnswer(query: string, state: AppState): string {
  const q = query.trim().toLowerCase();
  if (!q) return 'Tell me what to look for and I will check.';
  // Bare state words ("what's in the laundry") list that shelf.
  if ((STATE_WORDS as readonly string[]).includes(q)) {
    const items = state.clothing.filter((c) => c.state === q);
    if (!items.length) return `Nothing is in ${q} right now.`;
    const names = items.slice(0, 4).map((c) => c.name).join('; ');
    return `In ${q}: ${names}${items.length > 4 ? `, and ${items.length - 4} more` : ''}.`;
  }
  if (q === 'wardrobe' || q === 'closet' || q === 'cupboard') {
    if (!state.clothing.length) return 'Your wardrobe has nothing recorded yet.';
    const avail = state.clothing.filter((c) => c.state === 'available');
    const names = avail.slice(0, 4).map((c) => c.name).join('; ');
    return `Your wardrobe holds ${state.clothing.length} piece${state.clothing.length === 1 ? '' : 's'}, ${avail.length} available${avail.length ? `: ${names}${avail.length > 4 ? ', and more' : ''}` : ''}.`;
  }
  const hits = searchClothing(query, state.clothing);
  if (!hits.length) return `No — nothing called ${query} is in your wardrobe.`;
  const lines = hits.slice(0, 3).map((h) => {
    const c = h.item;
    const detail = [c.color, c.category].filter(Boolean).join(' ');
    return c.state === 'available'
      ? `${c.name}${detail ? ` (${detail})` : ''} — available`
      : `${c.name}${detail ? ` (${detail})` : ''} — ${c.state}, not available right now`;
  });
  return `Yes — ${lines.join('; ')}${hits.length > 3 ? ` (plus ${hits.length - 3} more)` : ''}.`;
}

/** Name one concrete outfit for today's occasion, or null when there is
    nothing to suggest. Pure — the view still opens the wardrobe card. */
export function wearPick(state: AppState): { occasion?: string; names: string } | null {
  const occasion = state.events
    .filter((e) => e.date === todayKey())
    .map((e) => occasionFromEvent(e.title))
    .find((o) => o);
  const suggestions = suggestOutfits(state.clothing, occasion ?? 'weekend', 1);
  if (!suggestions.length) return null;
  const names = suggestions[0].itemIds
    .map((id) => state.clothing.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  if (!names.length) return null;
  return { occasion, names: names.join(', ') };
}

/** Summary text for a `desk` intent — inbox size plus what is waiting. */
export function deskSummary(state: AppState): string {
  const inbox = state.captures.filter((c) => c.status === 'inbox');
  if (!inbox.length) return 'Your desk is clear — inbox zero.';
  const names = inbox.slice(0, 3).map((c) => c.name).join('; ');
  return `${inbox.length} item${inbox.length === 1 ? ' is' : 's are'} waiting on your desk: ${names}${inbox.length > 3 ? ', and more' : ''}.`;
}

function spokenTime(hhmm: string): string {
  const [hRaw, m] = hhmm.split(':').map(Number);
  const suffix = hRaw >= 12 ? 'PM' : 'AM';
  const h = hRaw % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')} ${suffix}` : `${h} ${suffix}`;
}

/** One short sentence describing what the assistant thinks it heard. */
export function summarizeProposal(p: Proposal): string {
  if (p.type === 'event') return `I heard an event: ${p.title}${p.date ? ` on ${p.date}` : ''}${p.time ? ` at ${spokenTime(p.time)}` : ''}. Please check it before confirming.`;
  if (p.type === 'task') return `I heard a task: ${p.title}${p.durationMin ? `, about ${p.durationMin} minutes` : ''}. Please check it before confirming.`;
  if (p.type === 'item') return `I heard an item to remember: ${p.itemName ?? p.title}. Please check it before confirming.`;
  return `I saved that as a note: ${p.title}. Please check it before confirming.`;
}

/** Read-back spoken after the user confirms creation. */
export function summarizeCreated(p: Proposal): string {
  if (p.type === 'event') return `Added event: ${p.title}${p.date ? ` on ${p.date}` : ''}${p.time ? ` at ${spokenTime(p.time)}` : ''}.`;
  if (p.type === 'task') return `Added task: ${p.title}${p.durationMin ? `, ${p.durationMin} minutes` : ''}.`;
  if (p.type === 'item') return `Added item: ${p.itemName ?? p.title}.`;
  return `Saved note: ${p.title}.`;
}
