// Pure model helpers: ids, dates, seed data, and state reducers.
// No DOM access here so logic stays testable with plain node.

import type {
  AppState,
  Belonging,
  CalEvent,
  Capture,
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

/** Create a task/event/item/reference from an edited proposal. Pure; store commits. */
export function applyProposal(
  capture: Capture, proposal: Proposal,
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
    const belonging: Belonging = {
      id: createId('bel'), name: proposal.itemName || proposal.title,
      description: proposal.prep, history: [], createdAt: now,
    };
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
