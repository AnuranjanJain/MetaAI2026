// Principal-flow check across shared records: a captured appointment becomes
// a confirmed event, gains a packing list linked to stored spots, an outfit
// from available clothes, and survives a schedule revision untouched.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { propose, validateProposal, suggestOutfits, searchBelongings } from '../src/core/inference.js';
import { applyProposal, buildChecklistForEvent, seedState, todayKey } from '../src/core/model.js';
import { proposeRevision } from '../src/core/schedule.js';
import type { AppState } from '../src/core/types.js';

describe('principal flow', () => {
  it('screenshot note → event → timeline → packing → location → outfit → revision', () => {
    const s: AppState = seedState();

    // 1. Capture + interpret.
    const p = propose('Dentist appointment tomorrow at 2:30pm at Main St clinic', true);
    assert.equal(p.type, 'event');
    assert.deepEqual(validateProposal(p), []);

    // 2. Confirm into a real event sharing the store.
    const capture = { id: 'cap1', kind: 'note', text: 'dentist', name: 'n', status: 'inbox', createdAt: '' } as const;
    const { event } = applyProposal({ ...capture }, p);
    assert.ok(event);
    s.events.push(event!);

    // 3. Packing list from the university routine links stored belongings.
    const list = buildChecklistForEvent(s, event!.id, 'rou_uni');
    assert.ok(list.length >= 3);
    s.checklist.push(...list);
    const adapterLine = list.find((c) => c.label === 'USB-C adapter')!;
    assert.ok(adapterLine.belongingId);

    // 4. Checklist item resolves to its last confirmed spot.
    const hits = searchBelongings('adapter', s.belongings, s.locations);
    assert.equal(hits[0].belonging.id, adapterLine.belongingId);
    assert.equal(hits[0].location?.name, 'Top desk drawer');

    // 5. Outfit from available clothes attaches to the event.
    const ideas = suggestOutfits(s.clothing, 'class');
    assert.ok(ideas.length >= 1);
    event!.outfitId = 'out_x';
    s.outfits.push({ id: 'out_x', name: 'class outfit', itemIds: ideas[0].itemIds, createdAt: '' });

    // 6. Revision places flexible work without moving the fixed event.
    const before = JSON.stringify(s.events);
    const rev = proposeRevision(s.events, s.tasks, todayKey());
    assert.equal(JSON.stringify(s.events), before);
    assert.ok(rev.placements.length + rev.deferred.length >= 1);
  });
});
