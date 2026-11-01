// Voice assistant: intent classification never guesses on ambiguity, and
// spoken slot answers only fill fields the parsers actually support.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent, deskSummary, findRenamable, haveAnswer, matchEvent, matchLocationHint, matchRoutine, splitLocationHint, summarizeCreated, wardrobeAnswer, wearPick, whereAnswer } from '../src/core/assistant.js';
import { applyProposal } from '../src/core/model.js';
import { searchBelongings, searchClothing } from '../src/core/inference.js';
import { stripTrailingStopPhrase } from '../src/voice.js';
import { applySlotAnswer, missingSlots, propose } from '../src/core/inference.js';
import { cleanItemText, collapseRepeats, extractNamedItem, extractPlace } from '../src/core/inference.js';
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
    assert.equal(intent.kind, 'done');
    if (intent.kind !== 'done') throw new Error('expected done');
    assert.equal(intent.taskId, 'a');
    assert.equal(intent.title, 'Buy batteries');
    assert.ok(intent.reason.length > 0);
  });

  it('falls back to add when a done command is ambiguous', () => {
    const s = stateWith([{ id: 'a', title: 'Call Sam' }, { id: 'b', title: 'Call Sam' }]);
    const intent = classifyIntent('Mark call Sam done', s);
    assert.equal(intent.kind, 'add');
  });

  it('detects where and next intents', () => {
    const s = stateWith([]);
    const where = classifyIntent('Where is my adapter?', s);
    assert.equal(where.kind, 'where');
    if (where.kind !== 'where') throw new Error('expected where');
    assert.equal(where.query, 'adapter');
    assert.equal(classifyIntent("What's next?", s).kind, 'next');
  });

  it('treats "remind me to…" as a task even though it sounds like a question', () => {
    const s = stateWith([]);
    const intent = classifyIntent('Can you remind me to buy milk?', s);
    assert.equal(intent.kind, 'add');
    if (intent.kind !== 'add') throw new Error('expected add');
    assert.match(intent.text, /buy milk/i);
    assert.ok(!/^can you remind me/i.test(intent.text));
  });

  it('detects have, wear, and desk questions as read-only', () => {
    const s = stateWith([]);
    const have = classifyIntent('Do I have a charger?', s);
    assert.equal(have.kind, 'have');
    if (have.kind !== 'have') throw new Error('expected have');
    assert.equal(have.query, 'charger');
    assert.equal(classifyIntent('What should I wear today?', s).kind, 'wear');
    assert.equal(classifyIntent("What's on my desk?", s).kind, 'desk');
  });

  it('asks one follow-up for bare fragments instead of guessing', () => {
    const s = stateWith([]);
    const intent = classifyIntent('adapter', s);
    assert.equal(intent.kind, 'ambiguous');
    if (intent.kind !== 'ambiguous') throw new Error('expected ambiguous');
    assert.equal(intent.text, 'adapter');
  });

  it('answers have from belongings and clothing, desk from the inbox', () => {
    const s = stateWith([]);
    s.belongings = [{
      id: 'b1', name: 'USB charger', locationId: 'l1', history: [],
      createdAt: '2026-11-01T09:00:00.000Z',
    }];
    s.locations = [{ id: 'l1', name: 'Top desk drawer', createdAt: '2026-11-01T09:00:00.000Z' }];
    s.clothing = [{
      id: 'c1', name: 'Blue hoodie', category: 'top', tags: [], state: 'available',
      createdAt: '2026-11-01T09:00:00.000Z',
    }];
    assert.match(haveAnswer('charger', s), /Yes.*Top desk drawer/);
    assert.match(haveAnswer('hoodie', s), /Yes.*available/);
    assert.match(haveAnswer('tent', s), /^No/);
    assert.match(deskSummary(s), /desk is clear/);
    s.captures = [{
      id: 'cap1', kind: 'note', text: 'Dentist', name: 'Dentist',
      status: 'inbox', createdAt: '2026-11-01T09:00:00.000Z',
    }];
    assert.match(deskSummary(s), /1 item.*Dentist/);
  });

  it('answers where from recorded locations only', () => {
    const s = stateWith([]);
    assert.match(whereAnswer('adapter', s), /don't have a recorded place/i);
  });

  it('routes availability questions to the wardrobe intent', () => {
    const s = stateWith([]);
    const avail = classifyIntent('Is my white shirt available?', s);
    assert.equal(avail.kind, 'wardrobe');
    const laundry = classifyIntent("What's in the laundry?", s);
    assert.equal(laundry.kind, 'wardrobe');
    if (laundry.kind !== 'wardrobe') throw new Error('expected wardrobe');
    assert.equal(laundry.query, 'laundry');
    const closet = classifyIntent("What's in my wardrobe?", s);
    assert.equal(closet.kind, 'wardrobe');
    // Plain existence stays a have.
    assert.equal(classifyIntent('Do I have a white shirt?', s).kind, 'have');
  });

  it('answers wardrobe state honestly, incl. laundry', () => {
    const s = stateWith([]);
    s.clothing = [
      { id: 'c1', name: 'White shirt', category: 'top', color: 'white', tags: [], state: 'available', createdAt: '2026-11-01T09:00:00.000Z' },
      { id: 'c2', name: 'Blue shirt', category: 'top', color: 'blue', tags: [], state: 'laundry', createdAt: '2026-11-01T09:00:00.000Z' },
    ];
    assert.match(wardrobeAnswer('white shirt', s), /Yes.*available/);
    assert.match(wardrobeAnswer('blue shirt', s), /laundry.*not available/);
    assert.match(wardrobeAnswer('laundry', s), /Blue shirt/);
    assert.match(wardrobeAnswer('tent', s), /^No/);
  });

  it('names a concrete outfit pick for today', () => {
    const s = stateWith([]);
    s.clothing = [
      { id: 'c1', name: 'White tee', category: 'top', color: 'white', tags: ['casual', 'class'], state: 'available', createdAt: '2026-11-01T09:00:00.000Z' },
      { id: 'c2', name: 'Dark jeans', category: 'bottom', color: 'indigo', tags: ['casual'], state: 'available', createdAt: '2026-11-01T09:00:00.000Z' },
      { id: 'c3', name: 'White sneakers', category: 'shoes', color: 'white', tags: ['casual'], state: 'available', createdAt: '2026-11-01T09:00:00.000Z' },
    ];
    const pick = wearPick(s);
    assert.ok(pick);
    assert.match(pick!.names, /White tee/);
  });

  it('keeps done-commands intact while stop phrases strip for everything else', () => {
    const s = stateWith([{ id: 'a', title: 'Buy batteries' }]);
    // View contract: raw text is classified first — trailing "done" wins.
    assert.equal(classifyIntent('Mark buy milk done', s).kind, 'add'); // no such task → captured, not stripped
    const withTask = stateWith([{ id: 'a', title: 'Buy milk' }]);
    const done = classifyIntent('Mark buy milk done', withTask);
    assert.equal(done.kind, 'done');
    // …and a stop phrase strips before the second classification.
    const stripped = stripTrailingStopPhrase('Dentist tomorrow that\'s it');
    assert.equal(classifyIntent(stripped, s).kind, 'add');
    assert.equal(stripTrailingStopPhrase('finished'), '');
  });

  it('makes routines and adds to them by voice', () => {
    const s = stateWith([]);
    s.routines = [
      { id: 'r1', name: 'Gym', belongingIds: [], tasks: [] },
      { id: 'r2', name: 'University', belongingIds: [], tasks: [] },
    ];
    const named = classifyIntent('Make a gym routine', s);
    assert.equal(named.kind, 'routine');
    if (named.kind !== 'routine') throw new Error('expected routine');
    assert.equal(named.name.toLowerCase(), 'gym');
    const unnamed = classifyIntent('make routine', s);
    assert.equal(unnamed.kind, 'routine');
    const add = classifyIntent('Add charger to gym routine', s);
    assert.equal(add.kind, 'routineAdd');
    if (add.kind !== 'routineAdd') throw new Error('expected routineAdd');
    assert.equal(add.itemText.toLowerCase(), 'charger');
    assert.equal(add.routineQuery.toLowerCase(), 'gym');
    assert.deepEqual(matchRoutine('gym', s), { id: 'r1', name: 'Gym' });
    // Tied names never guess.
    s.routines.push({ id: 'r3', name: 'Gym', belongingIds: [], tasks: [] });
    assert.equal(matchRoutine('gym', s), null);
  });

  it('plans outings, renames records, and adds spots by voice', () => {
    const s = stateWith([]);
    s.events = [{
      id: 'e1', title: 'Design lecture', date: '2026-11-02', start: '10:00',
      fixed: true, createdAt: '2026-11-01T09:00:00.000Z',
    }];
    const outing = classifyIntent('Pack for design lecture', s);
    assert.equal(outing.kind, 'outing');
    if (outing.kind !== 'outing') throw new Error('expected outing');
    assert.match(outing.query, /design lecture/i);
    assert.deepEqual(matchEvent('lecture', s), { id: 'e1', title: 'Design lecture' });
    const rename = classifyIntent('Rename adapter to dongle', s);
    assert.equal(rename.kind, 'rename');
    if (rename.kind !== 'rename') throw new Error('expected rename');
    assert.equal(rename.target, 'adapter');
    assert.equal(rename.newName, 'dongle');
    const spot = classifyIntent('Add spot blue bin', s);
    assert.equal(spot.kind, 'spot');
    if (spot.kind !== 'spot') throw new Error('expected spot');
    assert.equal(spot.name, 'blue bin');
  });

  it('finds renamable records across captures, spots, and belongings', () => {
    const s = stateWith([]);
    s.captures = [{
      id: 'cap1', kind: 'note', text: 'Dentist', name: 'Dentist note',
      status: 'inbox', createdAt: '2026-11-01T09:00:00.000Z',
    }];
    s.locations = [{ id: 'l1', name: 'Top desk drawer', createdAt: '2026-11-01T09:00:00.000Z' }];
    s.belongings = [{
      id: 'b1', name: 'USB charger', locationId: 'l1', history: [],
      createdAt: '2026-11-01T09:00:00.000Z',
    }];
    const one = findRenamable('charger', s);
    assert.equal(one.length, 1);
    assert.equal(one[0].scope, 'belonging');
    assert.ok(findRenamable('drawer', s).some((r) => r.scope === 'spot'));
    assert.equal(findRenamable('spaceship', s).length, 0);
  });

  it('splits “in <spot>” tails and matches the spot uniquely', () => {
    const s = stateWith([]);
    s.locations = [
      { id: 'l1', name: 'Top desk drawer', createdAt: '2026-11-01T09:00:00.000Z' },
      { id: 'l2', name: 'Entryway shelf', createdAt: '2026-11-01T09:00:00.000Z' },
    ];
    assert.deepEqual(splitLocationHint('passport in top drawer'), { item: 'passport', hint: 'top drawer' });
    assert.deepEqual(splitLocationHint('remember this'), { item: 'remember this', hint: null });
    assert.deepEqual(matchLocationHint('top drawer', s), { id: 'l1', name: 'Top desk drawer' });
    assert.equal(matchLocationHint('drawer shelf', s), null); // matches two — never guess
    // A hinted item proposal resolves to the spot on confirm.
    const cap = {
      id: 'cap1', kind: 'note', text: 'passport in top drawer', name: 'passport',
      status: 'inbox', createdAt: '2026-11-01T09:00:00.000Z',
    } as const;
    const { belonging } = applyProposal({ ...cap }, {
      type: 'item', title: 'passport', itemName: 'passport', locationHint: 'Top desk drawer',
      confidence: 'high', missing: [], rationale: '',
    }, [...s.locations]);
    assert.equal(belonging?.locationId, 'l1');
    assert.ok(belonging?.history.length);
  });

  it('retrieves with stemming, synonyms, and typo tolerance — exact first', () => {
    const s = stateWith([]);
    s.belongings = [
      { id: 'b1', name: 'USB charger', locationId: undefined, history: [], createdAt: '2026-11-01T09:00:00.000Z' },
      { id: 'b2', name: 'White sneakers', locationId: undefined, history: [], createdAt: '2026-11-01T09:00:00.000Z' },
    ];
    const plural = searchBelongings('chargers', s.belongings, []);
    assert.equal(plural[0]?.belonging.name, 'USB charger');
    const syn = searchBelongings('trainers', s.belongings, []);
    assert.equal(syn[0]?.belonging.name, 'White sneakers');
    const typo = searchBelongings('adaptr', [{ id: 'b3', name: 'USB adapter', locationId: undefined, history: [], createdAt: '2026-11-01T09:00:00.000Z' }], []);
    assert.equal(typo[0]?.belonging.name, 'USB adapter');
    const mixed = searchClothing('white shirt', [
      { id: 'c1', name: 'Shirt', category: 'top', color: 'white', tags: [], state: 'available', createdAt: '2026-11-01T09:00:00.000Z' },
    ]);
    assert.equal(mixed[0]?.item.name, 'Shirt');
    assert.equal(searchBelongings('spaceship', s.belongings, []).length, 0);
  });
});

describe('getting the point, not just the words', () => {
  it('hears "an item called water bottle … at the table" as an item, not a note', () => {
    const p = propose('There is an item called water bottle and it is at the table so you have to create a item which is water bottle', false);
    assert.equal(p.type, 'item');
    assert.match(p.itemName ?? '', /water bottle/i);
    assert.equal(p.place, 'table');
    assert.equal(p.locationHint, 'table');
  });

  it('extracts names from called/named/which-is phrasing', () => {
    assert.deepEqual(extractNamedItem('remember adapter called USB-C dongle'), { name: 'USB-C dongle', strong: true });
    assert.deepEqual(extractNamedItem('a item which is water bottle'), { name: 'water bottle', strong: true });
    assert.equal(extractNamedItem('Dentist tomorrow at 2:30pm').name, '');
  });

  it('never lets a weak subject match hijack an event', () => {
    const p = propose('Meeting is at 3pm tomorrow', false);
    assert.equal(p.type, 'event');
    assert.equal(p.time, '15:00');
  });

  it('finds lowercase places but never mistakes a time for one', () => {
    assert.equal(extractPlace('passport in top drawer'), 'top drawer');
    assert.equal(extractPlace('keys on the kitchen table'), 'kitchen table');
    assert.equal(extractPlace('Dentist tomorrow at 2:30pm'), undefined);
    const p = propose('Remember the passport in top drawer', false);
    assert.equal(p.type, 'item');
    assert.equal(p.place, 'top drawer');
  });

  it('collapses speech stutter and strips item filler', () => {
    assert.equal(collapseRepeats('add water water bottle'), 'add water bottle');
    // Stutter collapses first: a doubled word keeps one copy. Nothing is
    // invented — "water water" heard twice stays "water", never "water bottle".
    assert.equal(cleanItemText('item water water'), 'water');
    assert.equal(cleanItemText('item water water bottle'), 'water bottle');
    assert.equal(cleanItemText('item called water bottle'), 'water bottle');
  });

  it('keeps the point for add-to-routine commands', () => {
    const s = stateWith([]);
    s.routines = [{ id: 'r1', name: 'Gym', belongingIds: [], tasks: [] }];
    const stutter = classifyIntent('Add water water bottle to gym routine', s);
    assert.equal(stutter.kind, 'routineAdd');
    if (stutter.kind !== 'routineAdd') throw new Error('expected routineAdd');
    assert.equal(stutter.itemText, 'water bottle');
    const filler = classifyIntent('Add item called water bottle to gym routine', s);
    assert.equal(filler.kind, 'routineAdd');
    if (filler.kind !== 'routineAdd') throw new Error('expected routineAdd');
    assert.equal(filler.itemText, 'water bottle');
  });
});

describe('voice slot filling', () => {  it('lists missing event slots in date-then-time order', () => {
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
