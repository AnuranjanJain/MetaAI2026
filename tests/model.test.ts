// Shared-record checks: proposals create linked records, moves keep history,
// checklist builds dedupe, summaries ignore skipped items.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProposal, buildChecklistForEvent, bumpStreak, demoDayState, moveBelonging, seedState, summarizeChecklist,
} from '../src/core/model.js';
import type { Capture } from '../src/core/types.js';

function cap(): Capture {
  return { id: 'cap1', kind: 'note', text: 'Dentist tomorrow 2pm', name: 'note', status: 'inbox', createdAt: '' };
}

describe('applyProposal', () => {
  it('turns a confirmed event proposal into a linked event', () => {
    const { event, capture } = applyProposal(cap(), {
      type: 'event', title: 'Dentist', date: '2026-11-03', time: '14:00',
      confidence: 'high', missing: [], rationale: '',
    });
    assert.ok(event);
    assert.equal(event!.title, 'Dentist');
    assert.equal(event!.sourceCaptureId, 'cap1');
    assert.equal(capture.status, 'confirmed');
    assert.equal(capture.resultId, event!.id);
  });

  it('defaults missing event slots instead of failing', () => {
    const { event } = applyProposal(cap(), {
      type: 'event', title: 'X', confidence: 'low', missing: ['date'], rationale: '',
    });
    assert.ok(event!.date);
    assert.ok(event!.start);
  });

  it('creates items without inventing locations', () => {
    const { belonging } = applyProposal(cap(), {
      type: 'item', title: 'Adapter', itemName: 'Adapter', confidence: 'medium', missing: [], rationale: '',
    });
    assert.ok(belonging);
    assert.equal(belonging!.locationId, undefined);
  });
});

describe('moveBelonging', () => {
  it('updates location and appends explainable history', () => {
    const moved = moveBelonging(
      { id: 'b', name: 'Keys', history: [], createdAt: '' }, 'loc2', 'Moved by user',
    );
    assert.equal(moved.locationId, 'loc2');
    assert.equal(moved.history.length, 1);
    assert.equal(moved.history[0].note, 'Moved by user');
  });
});

describe('buildChecklistForEvent', () => {
  it('builds from a routine and skips duplicates on rebuild', () => {
    const s = seedState();
    const eventId = s.events[0].id;
    // Seed covers most of the uni list: rebuild tops up the missing task…
    const topUp = buildChecklistForEvent(s, eventId, 'rou_uni');
    assert.equal(topUp.length, 1);
    assert.equal(topUp[0].label, 'Check timetable');
    // …and a second rebuild adds nothing.
    s.checklist.push(...topUp);
    assert.deepEqual(buildChecklistForEvent(s, eventId, 'rou_uni'), []);
    // A fresh event gets belongings + routine tasks.
    const fresh = buildChecklistForEvent(s, 'evt_new', 'rou_uni');
    assert.equal(fresh.length, 4); // adapter, keys, charger, timetable
    assert.ok(fresh.every((c) => c.eventId === 'evt_new'));
  });

  it('marks unlinked routine items unresolved instead of dropping them', () => {
    const s = seedState();
    s.routines.push({ id: 'r', name: 'X', belongingIds: ['missing'], tasks: [] });
    const items = buildChecklistForEvent(s, 'evt_new', 'r');
    assert.equal(items[0].state, 'unresolved');
  });
});

describe('demoDayState', () => {
  it('loads 3 events, 5 open tasks, and inbox samples', () => {
    const s = demoDayState();
    assert.equal(s.events.length, 3);
    assert.equal(s.tasks.filter((t) => !t.done).length, 5);
    assert.ok(s.captures.filter((c) => c.status === 'inbox').length >= 2);
    assert.ok(s.events.every((e) => e.fixed));
  });
});

describe('bumpStreak', () => {
  it('starts, holds same-day, increments consecutive, restarts gaps', () => {
    assert.deepEqual(bumpStreak(undefined, '2026-11-03'), { count: 1, lastDay: '2026-11-03' });
    assert.deepEqual(
      bumpStreak({ count: 2, lastDay: '2026-11-03' }, '2026-11-03'),
      { count: 2, lastDay: '2026-11-03' },
    );
    assert.deepEqual(
      bumpStreak({ count: 2, lastDay: '2026-11-02' }, '2026-11-03'),
      { count: 3, lastDay: '2026-11-03' },
    );
    assert.deepEqual(
      bumpStreak({ count: 5, lastDay: '2026-10-30' }, '2026-11-03'),
      { count: 1, lastDay: '2026-11-03' },
    );
  });
});

describe('summarizeChecklist', () => {
  it('ignores skipped items in totals', () => {
    const s = seedState();
    s.checklist.push({ id: 'x', label: 'skip me', state: 'skipped' });
    const { packed, total } = summarizeChecklist(s.checklist);
    assert.equal(total, 3);
    assert.equal(packed, 0);
  });
});
