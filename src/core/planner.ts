// Action planner: builds a reviewable step-by-step plan for one day.
// Fixed events never move; flexible tasks are slotted by the existing
// scheduler (schedule.ts) — this module composes it, never forks it.
// Pure: inputs are never mutated, and nothing here writes to the store.

import { detectConflicts, eventWindow, proposeRevision, toHHMM, toMinutes, type Placement } from './schedule.js';
import type { CalEvent, CheckItem, Id, Task } from './types.js';

export type PlanStepKind = 'event' | 'task' | 'prep' | 'leaveby';

export interface PlanStep {
  kind: PlanStepKind;
  startMin: number;
  endMin?: number;
  title: string;
  detail?: string;
  taskId?: Id;
  eventId?: Id;
  past?: boolean;
}

export interface DayPlan {
  date: string;
  steps: PlanStep[];
  placements: Placement[];
  deferred: Id[];
  conflicts: string[];
  warnings: string[];
}

export interface DayPlanInput {
  events: CalEvent[];
  tasks: Task[];
  checklist: CheckItem[];
}

export interface DayPlanOpts {
  /** Minutes since midnight: re-plan from this moment (late mode). */
  fromMin?: number;
  leaveBufferMin?: number;
  earliest?: string;
  latest?: string;
}

const KIND_ORDER: Record<PlanStepKind, number> = { leaveby: 0, prep: 1, event: 2, task: 3 };

export function buildDayPlan(input: DayPlanInput, date: string, opts: DayPlanOpts = {}): DayPlan {
  const buffer = Math.min(120, Math.max(0, opts.leaveBufferMin ?? 15));
  const events = input.events
    .filter((e) => e.date === date)
    .sort((a, b) => a.start.localeCompare(b.start));
  const steps: PlanStep[] = [];
  const warnings: string[] = [];

  for (const e of events) {
    const w = eventWindow(e);
    steps.push({
      kind: 'event', startMin: w.start, endMin: w.end, title: e.title, eventId: e.id,
      detail: e.place ? `Fixed · ${e.place}` : 'Fixed',
      past: opts.fromMin !== undefined && w.end <= opts.fromMin,
    });
    if (e.place && buffer > 0) {
      const leaveAt = w.start - buffer;
      if (leaveAt >= 8 * 60) {
        steps.push({
          kind: 'leaveby', startMin: leaveAt, endMin: w.start, title: `Leave for ${e.title}`, eventId: e.id,
          detail: `${buffer} min buffer you chose — not a travel time.`,
          past: opts.fromMin !== undefined && leaveAt < opts.fromMin,
        });
      }
    }
    const checks = input.checklist.filter((c) => c.eventId === e.id);
    const open = checks.filter((c) => c.state === 'needed' || c.state === 'unresolved');
    if (open.length) {
      const packed = checks.filter((c) => c.state === 'packed').length;
      steps.push({
        kind: 'prep', startMin: w.start, endMin: w.start, title: `Prep for ${e.title}`, eventId: e.id,
        detail: `${open.map((c) => c.label).join(', ')} · ${packed}/${checks.length} packed`,
        past: opts.fromMin !== undefined && w.start <= opts.fromMin,
      });
    }
  }

  // Already-scheduled tasks keep their times; flag overlaps honestly.
  const scheduled = input.tasks.filter((t) => !t.done && t.start?.slice(0, 10) === date);
  for (const t of scheduled) {
    const start = toMinutes(t.start!.slice(11, 16));
    const end = start + Math.max(10, t.durationMin);
    steps.push({
      kind: 'task', startMin: start, endMin: end, title: t.title, taskId: t.id,
      detail: 'Already scheduled — kept at its time',
      past: opts.fromMin !== undefined && end <= opts.fromMin,
    });
    if (events.some((e) => { const w = eventWindow(e); return start < w.end && end > w.start; })) {
      warnings.push(`“${t.title}” overlaps a fixed event — left as-is for you to resolve.`);
    }
  }

  // Slot unscheduled tasks with the existing scheduler. Scheduled tasks are
  // passed in as busy blocks so new placements never land on top of them.
  const busyAsEvents: CalEvent[] = scheduled.map((t) => ({
    id: t.id, title: t.title, date, start: t.start!.slice(11, 16),
    end: toHHMM(toMinutes(t.start!.slice(11, 16)) + Math.max(10, t.durationMin)),
    fixed: true, createdAt: t.createdAt,
  }));
  const earliest = opts.fromMin !== undefined
    ? toHHMM(Math.max(opts.fromMin, opts.earliest ? toMinutes(opts.earliest) : 0))
    : opts.earliest;
  const revision = proposeRevision([...input.events, ...busyAsEvents], input.tasks, date, {
    earliest, latest: opts.latest,
  });
  const taskById = new Map(input.tasks.map((t) => [t.id, t]));
  for (const p of revision.placements) {
    const task = taskById.get(p.taskId);
    if (!task) continue;
    steps.push({
      kind: 'task', startMin: toMinutes(p.start), endMin: toMinutes(p.end), title: task.title,
      taskId: task.id, detail: 'Proposed placement — review before accepting',
    });
  }

  steps.sort((a, b) => a.startMin - b.startMin || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  return {
    date,
    steps,
    placements: revision.placements,
    deferred: revision.deferred,
    conflicts: [...detectConflicts(input.events, date), ...revision.conflicts],
    warnings,
  };
}
