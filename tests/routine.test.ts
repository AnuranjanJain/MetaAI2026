// Daily routine: repeating tasks renew after completion, never duplicate,
// weekly honors its 7-day rhythm, and repeat is captured at the desk.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyProposal, emptyState, rolloverRepeats } from '../src/core/model.js';
import { propose } from '../src/core/inference.js';
import type { Task } from '../src/core/types.js';

function doneTask(over: Partial<Task> = {}): Task {
  return {
    id: 't1', title: 'Water the plants', durationMin: 10, flexible: true,
    done: true, repeat: 'daily', createdAt: '2026-11-01T08:00:00',
    updatedAt: '2026-11-02T09:00:00',
    ...over,
  };
}

describe('rolloverRepeats', () => {
  it('renews a completed daily task exactly once per day', () => {
    const s = emptyState();
    s.tasks = [doneTask()];
    assert.equal(rolloverRepeats(s, '2026-11-03'), 1);
    assert.equal(s.tasks.filter((t) => !t.done).length, 1);
    assert.equal(s.tasks.find((t) => !t.done)?.repeat, 'daily');
    // Same day again: the open copy blocks a second spawn.
    assert.equal(rolloverRepeats(s, '2026-11-03'), 0);
    assert.equal(s.tasks.length, 2);
  });

  it('skips tasks completed today and non-repeating tasks', () => {
    const s = emptyState();
    s.tasks = [
      doneTask({ updatedAt: '2026-11-03T08:00:00' }),
      doneTask({ id: 't2', title: 'One-off', repeat: undefined, updatedAt: '2026-11-01T08:00:00' }),
    ];
    assert.equal(rolloverRepeats(s, '2026-11-03'), 0);
  });

  it('honors the weekly rhythm', () => {
    const s = emptyState();
    s.tasks = [doneTask({ repeat: 'weekly', updatedAt: '2026-10-30T08:00:00' })];
    assert.equal(rolloverRepeats(s, '2026-11-03'), 0); // 4 days: too soon
    assert.equal(rolloverRepeats(s, '2026-11-06'), 1); // 7 days: renew
  });

  it('only the latest done copy per title spawns', () => {
    const s = emptyState();
    s.tasks = [
      doneTask({ id: 'old', updatedAt: '2026-10-28T08:00:00' }),
      doneTask({ id: 'new', updatedAt: '2026-11-02T09:00:00' }),
    ];
    assert.equal(rolloverRepeats(s, '2026-11-03'), 1);
    assert.equal(s.tasks.length, 3);
  });
});

describe('repeat capture', () => {
  it('hears routine words for tasks, never for events', () => {
    assert.equal(propose('Water the plants every morning', false).repeat, 'daily');
    assert.equal(propose('Call mom once a week, 20 minutes', false).repeat, 'weekly');
    assert.equal(propose('Buy batteries, 20 minutes', false).repeat, undefined);
    assert.equal(propose('Dentist tomorrow at 2:30pm', false).repeat, undefined);
  });

  it('carries repeat from proposal to created task', () => {
    const s = emptyState();
    const cap = { id: 'cap', kind: 'note', text: 'Gym every day', name: 'n', status: 'inbox', createdAt: 'x' } as const;
    const p = { ...propose('Go to the gym every day, 60 minutes', false), type: 'task' as const };
    const { task } = applyProposal({ ...cap, status: 'inbox' }, p, s.locations);
    assert.equal(task?.repeat, 'daily');
  });
});
