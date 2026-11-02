// Pure model helpers: ids, dates, seed data, and state reducers.
// No DOM access here so logic stays testable with plain node.

import type {
  AppState,
  Belonging,
  CalEvent,
  Capture,
  CaptainStreak,
  CheckItem,
  Clothing,
  Id,
  Outfit,
  Proposal,
  Routine,
  StorageLocation,
  Task,
} from './types.js';

export function createId(prefix: string): Id {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Local YYYY-MM-DD key in the user's timezone. */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return todayKey(dt);
}

export function emptyState(): AppState {
  return {
    version: 1,
    captures: [],
    tasks: [],
    events: [],
    belongings: [],
    locations: [],
    clothing: [],
    outfits: [],
    routines: [],
    checklist: [],
    sound: { enabled: false, muted: false },
    decor: { wall: 'ivory', poster: 'sunset' },
    updatedAt: nowIso(),
  };
}

/** First-run seed: clearly labeled samples so the room is useful in minute one. */
export function seedState(): AppState {
  const now = nowIso();
  const today = todayKey();
  const drawer: StorageLocation = {
    id: 'loc_drawer', name: 'Top desk drawer',
    note: 'Sample spot — replace with your own places.', createdAt: now,
  };
  const shelf: StorageLocation = {
    id: 'loc_shelf', name: 'Entryway shelf',
    note: 'Sample spot for grab-and-go items.', createdAt: now,
  };
  const adapter: Belonging = {
    id: 'bel_adapter', name: 'USB-C adapter',
    description: 'Silver dongle for library monitors.',
    locationId: drawer.id, history: [{ locationId: drawer.id, at: now, note: 'Seeded sample' }],
    createdAt: now,
  };
  const keys: Belonging = {
    id: 'bel_keys', name: 'House keys',
    description: 'Brass keyring with blue fob.',
    locationId: shelf.id, history: [{ locationId: shelf.id, at: now, note: 'Seeded sample' }],
    createdAt: now,
  };
  const uni: Routine = {
    id: 'rou_uni', name: 'University',
    belongingIds: [adapter.id, keys.id],
    tasks: [{ id: 'rout_1', title: 'Pack laptop charger' }, { id: 'rout_2', title: 'Check timetable' }],
  };
  const gym: Routine = {
    id: 'rou_gym', name: 'Gym',
    belongingIds: [keys.id],
    tasks: [{ id: 'rout_3', title: 'Fill water bottle' }, { id: 'rout_4', title: 'Pack towel' }],
  };
  const clothing: Clothing[] = [
    { id: 'clo_tee', name: 'White tee', category: 'top', color: 'white', tags: ['casual', 'class'], state: 'available', sample: true, createdAt: now },
    { id: 'clo_oxford', name: 'Blue oxford shirt', category: 'top', color: 'blue', tags: ['smart', 'work'], state: 'available', sample: true, createdAt: now },
    { id: 'clo_jeans', name: 'Dark jeans', category: 'bottom', color: 'indigo', tags: ['casual', 'class'], state: 'available', sample: true, createdAt: now },
    { id: 'clo_chinos', name: 'Tan chinos', category: 'bottom', color: 'tan', tags: ['smart', 'work'], state: 'available', sample: true, createdAt: now },
    { id: 'clo_sneakers', name: 'White sneakers', category: 'shoes', color: 'white', tags: ['casual'], state: 'available', sample: true, createdAt: now },
    { id: 'clo_loafers', name: 'Brown loafers', category: 'shoes', color: 'brown', tags: ['smart'], state: 'available', sample: true, createdAt: now },
  ];
  const lecture: CalEvent = {
    id: 'evt_lecture', title: 'Design lecture', date: today,
    start: '10:00', end: '11:30', place: 'Room B12', fixed: true, createdAt: now,
  };
  return {
    version: 1,
    captures: [],
    tasks: [
      { id: 'task_read', title: 'Read chapter 4', durationMin: 45, flexible: true, done: false, createdAt: now, updatedAt: now },
    ],
    events: [lecture],
    belongings: [adapter, keys],
    locations: [drawer, shelf],
    clothing,
    outfits: [],
    routines: [uni, gym],
    checklist: [
      { id: 'chk_1', label: 'USB-C adapter', belongingId: adapter.id, state: 'needed', eventId: lecture.id, routineId: uni.id },
      { id: 'chk_2', label: 'House keys', belongingId: keys.id, state: 'needed', eventId: lecture.id, routineId: uni.id },
      { id: 'chk_3', label: 'Pack laptop charger', state: 'needed', eventId: lecture.id, routineId: uni.id },
    ],
    sound: { enabled: false, muted: false },
    decor: { wall: 'ivory', poster: 'sunset' },
    updatedAt: nowIso(),
  };
}

/** Judge-ready demo day: 3 fixed events, 5 open tasks, desk inbox,
    wardrobe samples (from seed), and packing lists. Explicit tap only —
    never auto-applied. Pure. */
export function demoDayState(): AppState {
  const base = seedState();
  const now = nowIso();
  const today = todayKey();
  const gym: CalEvent = {
    id: 'evt_gym', title: 'Gym session', date: today,
    start: '17:30', end: '18:30', place: 'Campus gym', fixed: true, createdAt: now,
  };
  const dinner: CalEvent = {
    id: 'evt_dinner', title: 'Dinner with Sam', date: today,
    start: '20:00', place: 'Maple St', fixed: true, createdAt: now,
  };
  const tasks: Task[] = [
    { id: 'task_read', title: 'Read chapter 4', durationMin: 45, flexible: true, done: false, createdAt: now, updatedAt: now },
    { id: 'task_lab', title: 'Finish lab report', durationMin: 60, flexible: true, done: false, createdAt: now, updatedAt: now },
    { id: 'task_call', title: 'Call mom', durationMin: 20, flexible: true, done: false, createdAt: now, updatedAt: now },
    { id: 'task_groceries', title: 'Buy groceries', durationMin: 30, flexible: true, done: false, createdAt: now, updatedAt: now },
    { id: 'task_water', title: 'Water the plants', durationMin: 10, flexible: true, done: false, createdAt: now, updatedAt: now },
  ];
  return {
    ...base,
    events: [...base.events, gym, dinner],
    tasks,
    captures: [
      { id: 'cap_demo1', kind: 'note', text: 'Dentist tomorrow at 2:30pm, Main St clinic', name: 'Dentist note (sample)', status: 'inbox', createdAt: now },
      { id: 'cap_demo2', kind: 'note', text: 'Pack gym shoes and water bottle', name: 'Gym reminder (sample)', status: 'inbox', createdAt: now },
    ],
    updatedAt: now,
  };
}

/** Morning rollover: renew completed repeating tasks for `today`.
    Only the latest done copy per title spawns, at most once per day
    (`spawnedFor` guard), so history stays true and dupes can't pile up.
    Mutates the draft; returns the number renewed. */
export function rolloverRepeats(draft: AppState, today: string): number {
  const now = nowIso();
  const latest = new Map<string, Task>();
  for (const t of draft.tasks) {
    if (!t.done || !t.repeat) continue;
    const k = `${t.repeat}::${t.title.trim().toLowerCase()}`;
    const prev = latest.get(k);
    if (!prev || t.updatedAt > prev.updatedAt) latest.set(k, t);
  }
  const open = new Set<string>();
  for (const t of draft.tasks) {
    if (!t.done && t.repeat) open.add(`${t.repeat}::${t.title.trim().toLowerCase()}`);
  }
  let n = 0;
  for (const [k, done] of latest) {
    if (done.spawnedFor === today) continue;
    if (open.has(k)) continue;
    const doneDay = done.updatedAt.slice(0, 10);
    if (doneDay >= today) continue;
    if (done.repeat === 'weekly') {
      const days = (Date.parse(today) - Date.parse(doneDay)) / 86400000;
      if (!Number.isFinite(days) || days < 7) continue;
    }
    draft.tasks.push({
      id: createId('task'), title: done.title, notes: done.notes,
      durationMin: done.durationMin, flexible: true, done: false,
      repeat: done.repeat, sourceCaptureId: done.sourceCaptureId,
      createdAt: now, updatedAt: now,
    });
    done.spawnedFor = today;
    open.add(k);
    n++;
  }
  return n;
}

/** Next streak after a Captain accept on `day`. Same-day accepts keep the
    count; consecutive days increment; gaps restart at 1. Pure. */
export function bumpStreak(prev: CaptainStreak | undefined, day: string): CaptainStreak {
  if (!prev || !prev.lastDay) return { count: 1, lastDay: day };
  if (prev.lastDay === day) return prev;
  if (addDaysKey(prev.lastDay, 1) === day) return { count: prev.count + 1, lastDay: day };
  return { count: 1, lastDay: day };
}

/** Build a checklist for an event from a routine, skipping duplicates. */
export function buildChecklistForEvent(
  state: AppState, eventId: Id, routineId: Id,
): CheckItem[] {
  const routine = state.routines.find((r) => r.id === routineId);
  if (!routine) return [];
  const existing = new Set(
    state.checklist.filter((c) => c.eventId === eventId).map((c) => c.label.toLowerCase()),
  );
  const items: CheckItem[] = [];
  for (const bId of routine.belongingIds) {
    const b = state.belongings.find((x) => x.id === bId);
    const label = b ? b.name : 'Unknown item';
    if (existing.has(label.toLowerCase())) continue;
    items.push({
      id: createId('chk'), label, belongingId: b?.id,
      state: b ? 'needed' : 'unresolved', eventId, routineId,
    });
    existing.add(label.toLowerCase());
  }
  for (const t of routine.tasks) {
    if (existing.has(t.title.toLowerCase())) continue;
    items.push({ id: createId('chk'), label: t.title, state: 'needed', eventId, routineId });
    existing.add(t.title.toLowerCase());
  }
  return items;
}

/** Create a task/event/item/reference from an edited proposal. Pure; store commits.
    `locations` lets an item proposal's `locationHint` (a spot name) resolve
    to a real spot; unknown names leave the item unplaced, as before. */
export function applyProposal(
  capture: Capture, proposal: Proposal, locations: StorageLocation[] = [],
): { task?: Task; event?: CalEvent; belonging?: Belonging; capture: Capture } {
  const now = nowIso();
  const confirmed: Capture = { ...capture, status: 'confirmed', proposal, resultKind: proposal.type };
  if (proposal.type === 'task') {
    const task: Task = {
      id: createId('task'), title: proposal.title,
      notes: proposal.prep, durationMin: proposal.durationMin ?? 30,
      flexible: true, done: false, sourceCaptureId: capture.id,
      createdAt: now, updatedAt: now,
    };
    if (proposal.repeat) task.repeat = proposal.repeat;
    return { task, capture: { ...confirmed, resultId: task.id } };
  }
  if (proposal.type === 'event') {
    const event: CalEvent = {
      id: createId('evt'), title: proposal.title,
      date: proposal.date ?? todayKey(), start: proposal.time ?? '09:00',
      end: proposal.endTime, place: proposal.place, prep: proposal.prep,
      fixed: true, sourceCaptureId: capture.id, createdAt: now,
    };
    return { event, capture: { ...confirmed, resultId: event.id } };
  }
  if (proposal.type === 'item') {
    const hint = (proposal.locationHint ?? '').trim().toLowerCase();
    const spot = hint ? locations.find((l) => l.name.trim().toLowerCase() === hint) : undefined;
    const belonging: Belonging = {
      id: createId('bel'), name: proposal.itemName || proposal.title,
      description: proposal.prep, locationId: spot?.id, history: [],
      createdAt: now,
    };
    if (spot) belonging.history = [{ locationId: spot.id, at: now, note: 'Placed by voice' }];
    return { belonging, capture: { ...confirmed, resultId: belonging.id } };
  }
  return { capture: { ...confirmed, resultId: capture.id } };
}

/** Move a belonging; appends history so results stay explainable. */
export function moveBelonging(
  b: Belonging, locationId: Id | null, note?: string,
): Belonging {
  return {
    ...b,
    locationId: locationId ?? undefined,
    history: [...b.history, { locationId, at: nowIso(), note }].slice(-20),
  };
}

export function summarizeChecklist(items: CheckItem[]): { packed: number; total: number } {
  const relevant = items.filter((i) => i.state !== 'skipped');
  return {
    packed: relevant.filter((i) => i.state === 'packed').length,
    total: relevant.length,
  };
}

export type { AppState, Belonging, CalEvent, Capture, CheckItem, Clothing, Id, Outfit, Proposal, Routine, StorageLocation, Task };
