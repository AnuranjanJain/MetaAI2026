// Morning Captain: verification is code-owned; Muse proposes, code disposes.
// Fixed events never move; invented ids fail; overlaps fail.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/model.js';
import { captainContext, dumpLines, heuristicCaptain, verifyCaptainPlan, type CaptainPlan } from '../src/core/captain.js';

function stateWithDay(): ReturnType<typeof emptyState> {
  const s = emptyState();
  s.events = [{
    id: 'evt1', title: 'Design lecture', date: '2026-11-03',
    start: '10:00', end: '11:30', place: 'Room B12', fixed: true, createdAt: 'x',
  }];
  s.tasks = [{
    id: 't1', title: 'Read chapter 4', durationMin: 45, flexible: true,
    done: false, createdAt: 'x', updatedAt: 'x',
  }];
  s.clothing = [
    { id: 'c1', name: 'White tee', category: 'top', tags: [], state: 'available', createdAt: 'x' },
    { id: 'c2', name: 'Jeans', category: 'bottom', tags: [], state: 'available', createdAt: 'x' },
    { id: 'c3', name: 'Sneakers', category: 'shoes', tags: [], state: 'available', createdAt: 'x' },
  ];
  return s;
}

describe('verifyCaptainPlan', () => {
  it('accepts a clean plan', () => {
    const s = stateWithDay();
    const plan: CaptainPlan = {
      slots: [{ taskId: 't1', title: 'Read chapter 4', start: '08:00', durationMin: 45 }],
      prep: [{ eventId: 'evt1', text: 'Pack adapter' }],
      leaveBy: [{ eventId: 'evt1', at: '09:45' }],
      outfitIds: ['c1', 'c2', 'c3'],
      pack: ['adapter'],
      notes: 'ok',
      trace: [],
    };
    const v = verifyCaptainPlan(plan, s, '2026-11-03');
    assert.equal(v.ok, true);
    assert.deepEqual(v.errors, []);
  });

  it('rejects overlaps with fixed events', () => {
    const s = stateWithDay();
    const plan: CaptainPlan = {
      slots: [{ taskId: 't1', title: 'Read chapter 4', start: '10:30', durationMin: 45 }],
      prep: [], leaveBy: [], outfitIds: [], pack: [], notes: '', trace: [],
    };
    const v = verifyCaptainPlan(plan, s, '2026-11-03');
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes('overlaps fixed event')));
  });

  it('rejects invented ids', () => {
    const s = stateWithDay();
    const plan: CaptainPlan = {
      slots: [{ taskId: 'nope', title: 'Ghost', start: '08:00', durationMin: 30 }],
      prep: [], leaveBy: [], outfitIds: ['ghost'], pack: [], notes: '', trace: [],
    };
    const v = verifyCaptainPlan(plan, s, '2026-11-03');
    assert.equal(v.ok, false);
    assert.ok(v.errors.length >= 2);
  });
});

describe('heuristicCaptain', () => {
  it('places tasks without moving fixed events', () => {
    const s = stateWithDay();
    const plan = heuristicCaptain(s, '2026-11-03', 'Read chapter 4\nPack adapter');
    const v = verifyCaptainPlan(plan, s, '2026-11-03');
    assert.equal(v.ok, true);
    assert.ok(plan.slots.length >= 1);
    assert.ok(plan.trace.length >= 3);
  });

  it('drafts new tasks from unmatched dump lines', () => {
    const s = stateWithDay();
    const plan = heuristicCaptain(s, '2026-11-03', 'Water the plants');
    assert.ok(plan.slots.some((sl) => sl.title.includes('Water')));
  });
});

describe('captainContext + dumpLines', () => {
  it('caps context and splits dumps', () => {
    const s = stateWithDay();
    assert.ok(captainContext(s, '2026-11-03', 'hello').includes('evt1'));
    assert.deepEqual(dumpLines('a\nRead chapter 4; Pack adapter'), ['Read chapter 4', 'Pack adapter']);
  });
});
