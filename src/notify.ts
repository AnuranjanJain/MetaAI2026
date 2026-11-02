// Local reminders: events about to start, tasks whose time arrived.
// No server, no tracking — a 60s ticker in the shell, permission-gated,
// each reminder fires once per day. Pure selection + DOM-free prefs.

import type { AppState } from './core/types.js';

export interface DueReminder {
  id: string;
  title: string;
  body: string;
}

const ENABLE_KEY = 'pocketroom.reminders';
const SEEN_KEY = 'pocketroom.notified';

export function remindersEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(ENABLE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setReminders(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(ENABLE_KEY, '1');
    else globalThis.localStorage?.removeItem(ENABLE_KEY);
  } catch { /* memory-only */ }
}

/** Ids already fired today. Shape: {day, ids}. Corrupt → empty. */
export function notifiedIds(today: string): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { day?: unknown; ids?: unknown };
    if (parsed.day !== today || !Array.isArray(parsed.ids)) return new Set();
    return new Set(parsed.ids.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

export function markNotified(today: string, ids: string[]): void {
  try {
    const all = notifiedIds(today);
    for (const id of ids) all.add(id);
    globalThis.localStorage?.setItem(SEEN_KEY, JSON.stringify({ day: today, ids: [...all].slice(-100) }));
  } catch { /* memory-only */ }
}

/** What's due right now: events starting within 15 min, tasks whose start
    arrived in the last 10 min. Pure — the caller dedupes + delivers. */
export function dueReminders(state: AppState, nowMs: number): DueReminder[] {
  const out: DueReminder[] = [];
  const now = new Date(nowMs);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  for (const e of state.events) {
    if (e.date !== today) continue;
    const at = Date.parse(`${e.date}T${e.start}:00`);
    if (!Number.isFinite(at)) continue;
    const mins = (at - nowMs) / 60000;
    if (mins >= 0 && mins <= 15) {
      out.push({
        id: `evt:${e.id}`,
        title: mins < 1 ? `Now: ${e.title}` : `${e.title} in ${Math.ceil(mins)} min`,
        body: e.place ? `Leave for ${e.place} — ${e.start}` : `Starts at ${e.start}`,
      });
    }
  }
  for (const t of state.tasks) {
    if (t.done || !t.start) continue;
    const at = Date.parse(t.start);
    if (!Number.isFinite(at)) continue;
    const mins = (nowMs - at) / 60000;
    if (mins >= 0 && mins <= 10) {
      out.push({ id: `task:${t.id}`, title: `Time for: ${t.title}`, body: `${t.durationMin} min — tap Done in the room when finished.` });
    }
  }
  return out;
}
