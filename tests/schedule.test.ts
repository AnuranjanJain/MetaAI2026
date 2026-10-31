// Schedule checks: free windows, greedy fit, honest deferral, fixed events
// never move, overlap detection.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectConflicts, freeWindows, proposeRevision } from '../src/core/schedule.js';
import type { CalEvent, Task } from '../src/core/types.js';

const DATE = '2026-11-02';

function evt(partial: Partial<CalEvent> & { title: string; start: string }): CalEvent {
  return {
    id: `e_${partial.title}`, date: DATE, fixed: true, createdAt: '',
    ...partial,
  } as CalEvent;
}

function task(id: string, title: string, durationMin: number): Task {
  return { id, title, durationMin, flexible: true, done: false, createdAt: '', updatedAt: '' };
}

describe('freeWindows', () => {
  it('returns gaps between fixed events within the day range', () => {
    const wins = freeWindows([evt({ title: 'Lec', start: '10:00', end: '11:00' })], DATE);
    assert.deepEqual(wins, [
      { start: 8 * 60, end: 10 * 60 },
      { start: 11 * 60, end: 22 * 60 },
    ]);
  });
});

describe('proposeRevision', () => {
  it('fits flexible tasks into free windows', () => {
    const rev = proposeRevision(
      [evt({ title: 'Lec', start: '10:00', end: '11:00' })],
      [task('t1', 'Read', 45)],
      DATE,
    );
    assert.equal(rev.fits, true);
    assert.equal(rev.placements.length, 1);
    assert.equal(rev.placements[0].start, '08:00');
  });

  it('defers honestly when the day cannot fit, instead of overfilling', () => {
    const rev = proposeRevision(
      [evt({ title: 'All day', start: '08:00', end: '21:30' })],
      [task('t1', 'Big essay', 120)],
      DATE,
    );
    assert.equal(rev.fits, false);
    assert.deepEqual(rev.deferred, ['t1']);
    assert.ok(rev.conflicts[0].includes('does not fit'));
  });

  it('never moves fixed events (input untouched)', () => {
    const events = [evt({ title: 'Lec', start: '10:00', end: '11:00' })];
    const before = JSON.stringify(events);
    proposeRevision(events, [task('t1', 'Read', 45)], DATE);
    assert.equal(JSON.stringify(events), before);
  });

  it('respects user-supplied time bounds', () => {
    const rev = proposeRevision([], [task('t1', 'Gym', 60)], DATE, { earliest: '18:00' });
    assert.equal(rev.placements[0].start, '18:00');
  });
});

describe('detectConflicts', () => {
  it('reports overlapping fixed events', () => {
    const found = detectConflicts(
      [evt({ title: 'A', start: '10:00', end: '11:00' }), evt({ title: 'B', start: '10:30', end: '11:30' })],
      DATE,
    );
    assert.equal(found.length, 1);
    assert.ok(found[0].includes('overlaps'));
  });

  it('stays quiet when nothing overlaps', () => {
    const found = detectConflicts([evt({ title: 'A', start: '10:00', end: '11:00' })], DATE);
    assert.deepEqual(found, []);
  });
});
