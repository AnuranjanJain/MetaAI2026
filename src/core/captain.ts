// Morning Captain: verifiable day agent. Muse proposes, code verifies.
// Fixed events never move; every mutation is reviewable and undoable.
// Pure: no DOM, no store writes — the view commits via one store.update.

import { eventWindow, freeWindows, proposeRevision, toHHMM, toMinutes, DAY_START, DAY_END } from './schedule.js';
import { normalizeTokens, occasionFromEvent, suggestOutfits } from './inference.js';
import { todayKey } from './model.js';
import type { AppState, Id } from './types.js';

export interface CaptainSlot {
  /** Existing open task id, or absent for a new task from the dump. */
  taskId?: Id;
  title: string;
  /** HH:MM 24h. */
  start: string;
  durationMin: number;
}

export interface CaptainPrep { eventId: Id; text: string }
export interface CaptainLeave { eventId: Id; at: string }

export interface CaptainPlan {
  slots: CaptainSlot[];
  prep: CaptainPrep[];
  leaveBy: CaptainLeave[];
  outfitIds: Id[];
  pack: string[];
  notes: string;
  /** Human-readable trace of propose → verify steps. */
  trace: string[];
}

export interface CaptainVerdict {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_SLOTS = 10;
const MAX_PACK = 12;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** Verify a proposed plan against code-owned constraints. Muse output is
    untrusted input: invented ids, moved fixed events, and overlaps fail. */
export function verifyCaptainPlan(plan: CaptainPlan, state: AppState, date: string): CaptainVerdict {
  const errors: string[] = [];
  const warnings: string[] = [];
  const events = state.events.filter((e) => e.date === date);
  const eventIds = new Set(events.map((e) => e.id));
  const openTasks = new Map(state.tasks.filter((t) => !t.done).map((t) => [t.id, t]));

  if (plan.slots.length > MAX_SLOTS) errors.push(`Too many slots (${plan.slots.length}, max ${MAX_SLOTS}).`);
  const ranges: Array<{ s: number; e: number; title: string }> = [];
  for (const slot of plan.slots) {
    if (!slot.title.trim()) { errors.push('A slot has no title.'); continue; }
    if (!HHMM.test(slot.start)) { errors.push(`Bad start time "${slot.start}" for "${slot.title}".`); continue; }
    const dur = Math.round(slot.durationMin);
    if (!Number.isFinite(dur) || dur < 10 || dur > 240) {
      errors.push(`Bad duration for "${slot.title}" (10–240 min).`); continue;
    }
    if (slot.taskId && !openTasks.has(slot.taskId)) {
      errors.push(`Unknown task id for "${slot.title}" — not scheduled.`);
      continue;
    }
    const s = toMinutes(slot.start);
    const e = s + dur;
    if (s < DAY_START || e > DAY_END) {
      errors.push(`"${slot.title}" falls outside 08:00–22:00.`);
      continue;
    }
    for (const ev of events) {
      const w = eventWindow(ev);
      if (overlaps(s, e, w.start, w.end)) {
        errors.push(`"${slot.title}" overlaps fixed event "${ev.title}" — left out.`);
      }
    }
    for (const r of ranges) {
      if (overlaps(s, e, r.s, r.e)) warnings.push(`"${slot.title}" overlaps "${r.title}" — review order.`);
    }
    ranges.push({ s, e, title: slot.title });
  }

  for (const p of plan.prep) {
    if (!eventIds.has(p.eventId)) errors.push('Prep names an unknown event.');
    else if (!p.text.trim()) errors.push('Empty prep note.');
    else if (p.text.length > 200) errors.push('Prep note too long (200 chars).');
  }
  for (const l of plan.leaveBy) {
    const ev = events.find((e) => e.id === l.eventId);
    if (!ev) { errors.push('Leave-by names an unknown event.'); continue; }
    if (!HHMM.test(l.at)) { errors.push('Bad leave-by time.'); continue; }
    if (toMinutes(l.at) >= toMinutes(ev.start)) errors.push(`Leave-by for "${ev.title}" is not before it starts.`);
  }

  const avail = new Set(state.clothing.filter((c) => c.state === 'available').map((c) => c.id));
  if (plan.outfitIds.length > 6) errors.push('Outfit has too many pieces (max 6).');
  for (const id of plan.outfitIds) {
    if (!avail.has(id)) errors.push('Outfit names an unavailable or unknown item.');
  }

  if (plan.pack.length > MAX_PACK) errors.push(`Pack list too long (max ${MAX_PACK}).`);
  for (const item of plan.pack) {
    if (!item.trim() || item.length > 60) errors.push('Bad pack entry (1–60 chars).');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Split a morning dump into candidate lines. Pure. */
export function dumpLines(dump: string): string[] {
  return dump
    .split(/[\n;]+/)
    .flatMap((l) => l.split(/,(?=\s*[A-Z0-9])/))
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) => l.length >= 3)
    .slice(0, 8);
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizeTokens(a));
  const tb = new Set(normalizeTokens(b));
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n;
}

/** Local fallback Captain: greedy, explainable, always available.
    Muse output replaces this when live; verification is identical. */
export function heuristicCaptain(state: AppState, date: string, dump: string): CaptainPlan {
  const trace: string[] = [];
  const events = state.events.filter((e) => e.date === date).sort((a, b) => a.start.localeCompare(b.start));
  trace.push(`Read ${events.length} fixed event(s) — these never move.`);
  const open = state.tasks.filter((t) => !t.done && !t.start);
  const lines = dumpLines(dump);
  trace.push(lines.length ? `Heard ${lines.length} dump line(s).` : 'No dump lines — planning existing tasks.');

  // Match dump lines to open tasks; unmatched lines become new 30-min tasks.
  const matchedIds = new Set<Id>();
  const fresh: Array<{ title: string; durationMin: number }> = [];
  for (const line of lines) {
    if (/^(pack|bring|remember to (pack|bring))\b/i.test(line)) continue; // pack list owns these
    let best: { id: Id; score: number } | null = null;
    for (const t of open) {
      if (matchedIds.has(t.id)) continue;
      const score = tokenOverlap(line, t.title);
      if (score >= 2 && (!best || score > best.score)) best = { id: t.id, score };
    }
    if (best) matchedIds.add(best.id);
    else fresh.push({ title: line.slice(0, 80), durationMin: 30 });
  }
  trace.push(`${matchedIds.size} dump line(s) matched open tasks, ${fresh.length} new task(s) drafted.`);

  const pool = [
    ...open.filter((t) => matchedIds.has(t.id) || !lines.length),
    ...fresh.map((f, i) => ({
      id: `new_${i}_${f.title.slice(0, 12)}`, title: f.title, durationMin: f.durationMin,
      flexible: true as const, done: false, createdAt: '', updatedAt: '',
    })),
  ];
  const rev = proposeRevision(state.events, pool as never, date, {});
  const byId = new Map(pool.map((t) => [t.id, t]));
  const slots: CaptainSlot[] = rev.placements.map((p) => {
    const t = byId.get(p.taskId)!;
    const real = !p.taskId.startsWith('new_');
    return {
      ...(real ? { taskId: p.taskId } : {}),
      title: t.title, start: p.start, durationMin: t.durationMin,
    };
  });
  trace.push(`${slots.length} task(s) placed into free windows; ${rev.deferred.length} deferred.`);

  const prep: CaptainPrep[] = [];
  for (const e of events) {
    const openChecks = state.checklist.filter(
      (c) => c.eventId === e.id && (c.state === 'needed' || c.state === 'unresolved'),
    );
    if (openChecks.length) {
      prep.push({ eventId: e.id, text: openChecks.slice(0, 4).map((c) => c.label).join('; ') });
    }
  }
  const leaveBy: CaptainLeave[] = events
    .filter((e) => e.place)
    .map((e) => ({ eventId: e.id, at: toHHMM(Math.max(6 * 60, toMinutes(e.start) - 15)) }));
  trace.push(`${prep.length} prep note(s), ${leaveBy.length} leave-by reminder(s).`);

  const occasion = events.map((e) => occasionFromEvent(e.title)).find(Boolean) ?? 'weekend';
  const outfit = suggestOutfits(state.clothing, occasion, 1)[0];
  const outfitIds = outfit ? outfit.itemIds : [];
  trace.push(outfitIds.length ? `Outfit picked for "${occasion}" from available items.` : 'No full outfit available.');

  const pack = lines
    .filter((l) => /^(pack|bring|remember to (pack|bring))\b/i.test(l))
    .map((l) => l.replace(/^(pack|bring|remember to (pack|bring))\s+/i, '').slice(0, 60))
    .filter(Boolean)
    .slice(0, MAX_PACK);

  const free = freeWindows(state.events, date);
  const notes = free.length
    ? `${slots.length} task(s) fit around ${events.length} fixed event(s).`
    : 'No free windows today — review what can move.';
  return { slots, prep, leaveBy, outfitIds, pack, notes, trace };
}

/** Compact JSON context sent with a Captain request. Capped so prompts stay small. */
export function captainContext(state: AppState, date: string, dump: string): string {
  const events = state.events.filter((e) => e.date === date).map((e) => ({
    id: e.id, title: e.title.slice(0, 60), start: e.start, end: e.end ?? null, place: e.place ?? null,
  })).slice(0, 12);
  const tasks = state.tasks.filter((t) => !t.done).map((t) => ({
    id: t.id, title: t.title.slice(0, 60), durationMin: t.durationMin, start: t.start ?? null,
  })).slice(0, 20);
  const clothing = state.clothing.filter((c) => c.state === 'available').map((c) => ({
    id: c.id, name: c.name.slice(0, 40), category: c.category,
  })).slice(0, 30);
  return JSON.stringify({ date: date || todayKey(), dump: dump.slice(0, 1000), events, tasks, clothing });
}
