// Voice assistant intent layer (pure, testable). Speech-to-text lives in
// voice.ts; this module only decides what an utterance means. Anything that
// would mutate state is returned as an intent for the UI to confirm — the
// assistant never creates, completes, or deletes records on its own.

import { searchBelongings } from './inference.js';
import type { AppState, Id, Proposal } from './types.js';

export type AssistantIntent =
  | { kind: 'add'; text: string }
  | { kind: 'done'; taskId: Id; title: string }
  | { kind: 'where'; query: string }
  | { kind: 'next' }
  | { kind: 'unknown'; text: string };

const clean = (text: string) => text.trim().replace(/\s+/g, ' ').slice(0, 1000);
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

/** Classify one utterance. Ambiguous or unmatched commands fall back to
    `add`, so the words are captured and reviewed — never silently acted on. */
export function classifyIntent(rawText: string, state: AppState): AssistantIntent {
  const text = clean(rawText);
  if (!text) return { kind: 'unknown', text: '' };
  const lower = text.toLowerCase();

  if (/^(what'?s|what is)\s+(next|coming up)\b/.test(lower) || /^next up\b/.test(lower)) {
    return { kind: 'next' };
  }

  const where = /^(?:where(?:'s| is| did i put| are)|find|locate)\s+(?:my\s+|the\s+)?(.+)$/i.exec(stripEnd(text));
  if (where) return { kind: 'where', query: stripEnd(where[1]) };

  const candidate = taskCandidate(text);
  if (candidate) {
    const match = matchTask(candidate, state);
    if (match) return { kind: 'done', taskId: match.taskId, title: match.title };
  }

  return { kind: 'add', text };
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
