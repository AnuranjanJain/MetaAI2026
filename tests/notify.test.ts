// Reminders + overdue: pure selection only. Delivery (Notification /
// ticker) is browser-side and stays out of unit tests.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/model.js';
import { overdueTasks } from '../src/core/schedule.js';
import { dueReminders, markNotified, notifiedIds, remindersEnabled, setReminders } from '../src/notify.js';

function withStorage(entries: Record<string, string>, fn: () => void): void {
  const g = globalThis as { localStorage?: unknown };
  const prev = g.localStorage;
  const store = new Map(Object.entries(entries));
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  try {
    fn();
  } finally {
    if (prev === undefined) delete g.localStorage;
    else g.localStorage = prev;
  }
}

describe('dueReminders', () => {
  it('flags events within 15 minutes and tasks whose time arrived', () => {
    const s = emptyState();
    const now = new Date('2026-11-03T09:50:00').getTime();
    s.events = [
      { id: 'e1', title: 'Standup', date: '2026-11-03', start: '10:00', place: 'Room A', fixed: true, createdAt: 'x' },
      { id: 'e2', title: 'Lunch', date: '2026-11-03', start: '12:00', fixed: true, createdAt: 'x' },
    ];
    s.tasks = [
      { id: 't1', title: 'Read', durationMin: 20, flexible: true, start: '2026-11-03T09:45:00', done: false, createdAt: 'x', updatedAt: 'x' },
      { id: 't2', title: 'Later', durationMin: 20, flexible: true, start: '2026-11-03T11:00:00', done: false, createdAt: 'x', updatedAt: 'x' },
    ];
    const ids = dueReminders(s, now).map((r) => r.id);
    assert.deepEqual(ids.sort(), ['evt:e1', 'task:t1']);
    const ev = dueReminders(s, now).find((r) => r.id === 'evt:e1')!;
    assert.match(ev.title, /Standup/);
    assert.match(ev.body, /Room A/);
  });

  it('ignores other days, done tasks, and far-future items', () => {
    const s = emptyState();
    const now = new Date('2026-11-03T09:50:00').getTime();
    s.events = [{ id: 'e9', title: 'Tomorrow', date: '2026-11-04', start: '10:00', fixed: true, createdAt: 'x' }];
    s.tasks = [{ id: 't9', title: 'Done', durationMin: 10, flexible: true, start: '2026-11-03T09:45:00', done: true, createdAt: 'x', updatedAt: 'x' }];
    assert.deepEqual(dueReminders(s, now), []);
  });
});

describe('reminder prefs', () => {
  it('defaults off and round-trips the toggle', () => {
    withStorage({}, () => {
      assert.equal(remindersEnabled(), false);
      setReminders(true);
      assert.equal(remindersEnabled(), true);
      setReminders(false);
      assert.equal(remindersEnabled(), false);
    });
  });

  it('tracks fired ids per day and resets on a new day', () => {
    withStorage({}, () => {
      markNotified('2026-11-03', ['evt:e1']);
      assert.ok(notifiedIds('2026-11-03').has('evt:e1'));
      assert.equal(notifiedIds('2026-11-04').size, 0);
      markNotified('2026-11-03', ['task:t1']);
      assert.equal(notifiedIds('2026-11-03').size, 2);
    });
  });
});

describe('overdueTasks', () => {
  it('finds undone tasks whose start passed, nothing else', () => {
    const s = emptyState();
    s.tasks = [
      { id: 'o', title: 'Late', durationMin: 10, flexible: true, start: '2026-11-03T08:00:00', done: false, createdAt: 'x', updatedAt: 'x' },
      { id: 'f', title: 'Future', durationMin: 10, flexible: true, start: '2026-11-03T18:00:00', done: false, createdAt: 'x', updatedAt: 'x' },
      { id: 'd', title: 'Done', durationMin: 10, flexible: true, start: '2026-11-03T08:00:00', done: true, createdAt: 'x', updatedAt: 'x' },
      { id: 'u', title: 'Unscheduled', durationMin: 10, flexible: true, done: false, createdAt: 'x', updatedAt: 'x' },
    ];
    assert.deepEqual(overdueTasks(s.tasks, '2026-11-03T09:00:00').map((t) => t.id), ['o']);
  });
});
