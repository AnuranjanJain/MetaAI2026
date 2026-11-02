// Day-planning logic. Fixed events never move; flexible tasks fill free
// windows. Proposals are always reviewed before applying.

import type { CalEvent, Id, Task } from './types.js';

export const DAY_START = 8 * 60; // 08:00
export const DAY_END = 22 * 60; // 22:00

/** Tasks whose start time already passed and still aren't done. Pure. */
export function overdueTasks(tasks: Task[], nowIso: string): Task[] {
  return tasks.filter((t) => !t.done && t.start !== undefined && t.start < nowIso);
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface Window { start: number; end: number }

export function eventWindow(e: CalEvent): Window {
  return { start: toMinutes(e.start), end: e.end ? toMinutes(e.end) : toMinutes(e.start) + 60 };
}

/** Free windows between fixed events for a date, clamped to the day range. */
export function freeWindows(events: CalEvent[], date: string): Window[] {
  const busy = events
    .filter((e) => e.date === date)
    .map(eventWindow)
    .sort((a, b) => a.start - b.start);
  const free: Window[] = [];
  let cursor = DAY_START;
  for (const b of busy) {
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, DAY_END) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < DAY_END) free.push({ start: cursor, end: DAY_END });
  return free.filter((w) => w.end - w.start >= 10);
}

export interface Placement { taskId: Id; start: string; end: string }
export interface Revision {
  placements: Placement[];
  deferred: Id[];
  conflicts: string[];
  /** True when everything fit. */
  fits: boolean;
}

/** Greedy fit of unscheduled flexible tasks into free windows. Pure. */
export function proposeRevision(
  events: CalEvent[], tasks: Task[], date: string,
  opts: { earliest?: string; latest?: string; taskIds?: Id[] } = {},
): Revision {
  const pool = tasks.filter(
    (t) => !t.done && !t.start && (!opts.taskIds || opts.taskIds.includes(t.id)),
  );
  const windows = freeWindows(events, date).map((w) => ({ ...w }));
  const lo = opts.earliest ? toMinutes(opts.earliest) : DAY_START;
  const hi = opts.latest ? toMinutes(opts.latest) : DAY_END;
  const placements: Placement[] = [];
  const conflicts: string[] = [];
  const deferred: Id[] = [];

  for (const task of [...pool].sort((a, b) => b.durationMin - a.durationMin)) {
    const dur = Math.max(10, task.durationMin);
    const slot = windows.find((w) => Math.min(w.end, hi) - Math.max(w.start, lo) >= dur);
    if (!slot) {
      deferred.push(task.id);
      conflicts.push(`“${task.title}” (${dur} min) does not fit on ${date}.`);
      continue;
    }
    const start = Math.max(slot.start, lo);
    placements.push({ taskId: task.id, start: toHHMM(start), end: toHHMM(start + dur) });
    slot.start = start + dur + 5; // small breather
  }
  return { placements, deferred, conflicts, fits: deferred.length === 0 };
}

/** Overlap check for fixed events on a date. */
export function detectConflicts(events: CalEvent[], date: string): string[] {
  const list = events.filter((e) => e.date === date).map((e) => ({ e, w: eventWindow(e) }))
    .sort((a, b) => a.w.start - b.w.start);
  const out: string[] = [];
  for (let i = 1; i < list.length; i++) {
    if (list[i].w.start < list[i - 1].w.end) {
      out.push(`“${list[i - 1].e.title}” overlaps “${list[i].e.title}”.`);
    }
  }
  return out;
}
