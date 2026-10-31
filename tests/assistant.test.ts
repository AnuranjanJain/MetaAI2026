// Voice assistant: intent classification never guesses on ambiguity, and
// spoken slot answers only fill fields the parsers actually support.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent, summarizeCreated, whereAnswer } from '../src/core/assistant.js';
import { applySlotAnswer, missingSlots, propose } from '../src/core/inference.js';
import { emptyState } from '../src/core/model.js';
import type { AppState, Task } from '../src/core/types.js';

function stateWith(tasks: Partial<Task>[]): AppState {
  const s = emptyState();
  s.tasks = tasks.map((t, i) => ({
    id: `t${i}`, title: `Task ${i}`, durationMin: 30, flexible: true,
    done: false, createdAt: '2026-11-01T09:00:00.000Z', updatedAt: '2026-11-01T09:00:00.000Z', ...t,
  }));
  return s;
}

describe('classifyIntent', () => {
  it('treats a plain note as an add', () => {
    const intent = classifyIntent('Dentist tomorrow at 2:30pm', stateWith([]));
    assert.equal(intent.kind, 'add');
  });

  it('matches a done command to exactly one open task', () => {
    const s = stateWith([{ id: 'a', title: 'Buy batteries' }, { id: 'b', title: 'Read chapter 4' }]);
    const intent = classifyIntent('Mark buy batteries done', s);
    assert.deepEqual(intent, { kind: 'done', taskId: 'a', title: 'Buy batteries' });
  });

  it('falls back to add when a done command is ambiguous', () => {
    const s = stateWith([{ id: 'a', title: 'Call Sam' }, { id: 'b', title: 'Call Sam' }]);
    const intent = classifyIntent('Mark call Sam done', s);
    assert.equal(intent.kind, 'add');
  });

  it('detects where and next intents', () => {
    const s = stateWith([]);
    assert.deepEqual(classifyIntent('Where is my adapter?', s), { kind: 'where', query: 'adapter' });
    assert.deepEqual(classifyIntent("What's next?", s), { kind: 'next' });
  });

  it('answers where from recorded locations only', () => {
    const s = stateWith([]);
    assert.match(whereAnswer('adapter', s), /don't have a recorded place/i);
  });
});

describe('voice slot filling', () => {
  it('lists missing event slots in date-then-time order', () => {
    const p = propose('Meeting with Sara', false);
    assert.deepEqual(missingSlots(p), ['date', 'time']);
    const full = propose('Dentist tomorrow at 2:30pm', false);
    assert.deepEqual(missingSlots(full), []);
  });

  it('fills date, time, and duration from spoken answers', () => {
    let p = propose('Meeting with Sara', false);
    p = applySlotAnswer(p, 'date', 'tomorrow');
    assert.ok(p.date);
    p = applySlotAnswer(p, 'time', '2:30 pm');
    assert.equal(p.time, '14:30');
    const task = applySlotAnswer(propose('Read chapter 4', false), 'duration', '45 minutes');
    assert.equal(task.durationMin, 45);
  });

  it('leaves the proposal unchanged on an unparseable answer', () => {
    const p = propose('Meeting with Sara', false);
    assert.equal(applySlotAnswer(p, 'date', 'whenever works'), p);
  });
});

describe('spoken summaries', () => {
  it('reads back a created event in spoken form', () => {
    const text = summarizeCreated({
      type: 'event', title: 'Dentist', date: '2026-11-02', time: '14:30',
      confidence: 'high', missing: [], rationale: '',
    });
    assert.match(text, /Added event: Dentist/);
    assert.match(text, /2:30 PM/);
  });
});
