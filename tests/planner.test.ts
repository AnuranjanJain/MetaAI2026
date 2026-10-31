// Action planner: composes the scheduler into a reviewable day plan.
// Fixed events never move; leave-by and prep steps are honest helpers,
// and late mode defers what no longer fits instead of dropping it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayPlan } from '../src/core/planner.js';
import type { CalEvent, CheckItem, Task } from '../src/core/types.js';

const DATE = '2026-11-02';
const TS = '2026-11-01T09:00:00.000Z';

function task(partial: Partial<Task>): Task {
  return {
    id: 't1', title: 'Task', durationMin: 30, flexible: true, done: false,
    createdAt: TS, updatedAt: TS, ...partial,
  };
}

function event(partial: Partial<CalEvent>): CalEvent {
  return {
    id: 'e1', title: 'Event', date: DATE, start: '10:00', end: '11:00',
    fixed: true, createdAt: TS, ...partial,
  };
}

function check(partial: Partial<CheckItem>): CheckItem {
  return { id: 'c1', label: 'Item', state: 'needed', ...partial };
}

describe('buildDayPlan', () => {
  it('slots an unscheduled task into a free window without touching fixed events', () => {
    const events = [
      event({ id: 'a', start: '09:00', end: '10:00' }),
      event({ id: 'b', start: '12:00', end: '13:00' }),
    ];
    const tasks = [task({ id: 'job', title: 'Inbox zero', durationMin: 45 })];
    const plan = buildDayPlan({ events, tasks, checklist: [] }, DATE, { earliest: '08:00', latest: '22:00' });
    assert.equal(plan.placements.length, 1);
    const p = plan.placements[0];
    const startMin = Number(p.start.slice(0, 2)) * 60 + Number(p.start.slice(3, 5));
    const endMin = Number(p.end.slice(0, 2)) * 60 + Number(p.end.slice(3, 5));
    for (const e of events) {
      const es = Number(e.start.slice(0, 2)) * 60;
      const ee = Number(e.end!.slice(0, 2)) * 60;
      assert.ok(endMin <= es || startMin >= ee, `placement overlaps ${e.title}`);
    }
    const step = plan.steps.find((s) => s.kind === 'task');
    assert.match(step!.detail!, /proposed/i);
  });

  it('adds a leave-by step only for events with a place, honestly labelled', () => {
    const events = [
      event({ id: 'a', title: 'Dentist', place: 'City Clinic', start: '10:00', end: '11:00' }),
      event({ id: 'b', title: 'Study hour', start: '13:00', end: '14:00' }),
    ];
    const plan = buildDayPlan({ events, tasks: [], checklist: [] }, DATE, { leaveBufferMin: 15 });
    const leave = plan.steps.filter((s) => s.kind === 'leaveby');
    assert.equal(leave.length, 1);
    assert.equal(leave[0].startMin, 10 * 60 - 15);
    assert.match(leave[0].detail!, /not a travel time/);
  });

  it('adds no leave-by step when the buffer is zero', () => {
    const events = [event({ id: 'a', place: 'City Clinic' })];
    const plan = buildDayPlan({ events, tasks: [], checklist: [] }, DATE, { leaveBufferMin: 0 });
    assert.equal(plan.steps.some((s) => s.kind === 'leaveby'), false);
  });

  it('aggregates unpacked checklist items into one prep step per event', () => {
    const events = [event({ id: 'a', title: 'Hike' })];
    const checklist = [
      check({ id: 'c1', eventId: 'a', label: 'Boots', state: 'needed' }),
      check({ id: 'c2', eventId: 'a', label: 'Water bottle', state: 'unresolved' }),
      check({ id: 'c3', eventId: 'a', label: 'Jacket', state: 'packed' }),
    ];
    const plan = buildDayPlan({ events, tasks: [], checklist }, DATE, {});
    const prep = plan.steps.filter((s) => s.kind === 'prep');
    assert.equal(prep.length, 1);
    assert.match(prep[0].detail!, /Boots/);
    assert.match(prep[0].detail!, /1\/3 packed/);

    const allPacked = buildDayPlan({ events, tasks: [], checklist: checklist.map((c) => ({ ...c, state: 'packed' as const })) }, DATE, {});
    assert.equal(allPacked.steps.some((s) => s.kind === 'prep'), false);
  });

  it('keeps scheduled tasks at their times and warns on overlaps honestly', () => {
    const events = [event({ id: 'a', start: '10:00', end: '11:00' })];
    const tasks = [task({ id: 'job', title: 'Call bank', start: `${DATE}T10:30:00` })];
    const plan = buildDayPlan({ events, tasks, checklist: [] }, DATE, {});
    const step = plan.steps.find((s) => s.kind === 'task');
    assert.equal(step!.startMin, 10 * 60 + 30);
    assert.match(step!.detail!, /kept at its time/);
    assert.ok(plan.warnings.some((w) => w.includes('Call bank')));
    assert.equal(plan.placements.length, 0);
  });

  it('defers tasks that no longer fit instead of dropping them', () => {
    const events = [event({ id: 'a', start: '09:00', end: '10:00' })];
    const tasks = [task({ id: 'big', title: 'Write report', durationMin: 180 })];
    const plan = buildDayPlan({ events, tasks, checklist: [] }, DATE, { earliest: '08:00', latest: '11:00' });
    assert.deepEqual(plan.deferred, ['big']);
    assert.ok(plan.conflicts.some((c) => c.includes('Write report')));
  });

  it('late mode marks past steps and only places tasks from now on', () => {
    const events = [event({ id: 'a', title: 'Lecture', start: '09:00', end: '10:00' })];
    const tasks = [task({ id: 'job', title: 'Email tutor', durationMin: 20 })];
    const plan = buildDayPlan({ events, tasks, checklist: [] }, DATE, { fromMin: 12 * 60, latest: '22:00' });
    const eventStep = plan.steps.find((s) => s.kind === 'event');
    assert.equal(eventStep!.past, true);
    assert.equal(plan.placements.length, 1);
    const startMin = Number(plan.placements[0].start.slice(0, 2)) * 60 + Number(plan.placements[0].start.slice(3, 5));
    assert.ok(startMin >= 12 * 60);
  });

  it('never mutates its inputs and ignores other days', () => {
    const events = [event({ id: 'a' }), event({ id: 'b', title: 'Tomorrow', date: '2026-11-03', start: '18:00' })];
    const tasks = [task({ id: 'job' })];
    const snapshot = structuredClone({ events, tasks });
    const plan = buildDayPlan({ events, tasks, checklist: [] }, DATE, {});
    assert.deepEqual({ events, tasks }, snapshot);
    assert.equal(plan.steps.some((s) => s.title === 'Tomorrow'), false);
  });
});
