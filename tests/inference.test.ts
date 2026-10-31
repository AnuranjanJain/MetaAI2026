// Extraction + suggestion checks: grounded fields only, validation errors,
// catalog-only outfits, ranked search.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { propose, validateProposal, suggestOutfits, searchBelongings } from '../src/core/inference.js';
import type { Belonging, Clothing, StorageLocation } from '../src/core/types.js';

describe('propose', () => {
  it('extracts event details actually present in the source', () => {
    const p = propose('Dentist appointment tomorrow at 2:30pm at Main St clinic', false);
    assert.equal(p.type, 'event');
    assert.equal(p.time, '14:30');
    assert.ok(p.date, 'expected a date');
    assert.equal(p.place, 'Main St clinic');
    assert.deepEqual(p.missing, []);
    assert.equal(p.confidence, 'high');
  });

  it('never invents date or time; gaps go to missing', () => {
    const p = propose('Meeting with Sara', false);
    assert.equal(p.type, 'event');
    assert.equal(p.date, undefined);
    assert.equal(p.time, undefined);
    assert.ok(p.missing.length >= 2, 'date and time gaps must be listed');
  });

  it('reads packing language as an item without claiming a location', () => {
    const p = propose("Don't forget to bring the adapter", false);
    assert.equal(p.type, 'item');
    assert.equal(p.itemName, 'Adapter');
    assert.ok(p.missing.some((m) => m.includes('location')));
  });

  it('keeps unclear notes as references', () => {
    const p = propose('Blue door, third floor, nice light', false);
    assert.equal(p.type, 'reference');
  });

  it('flags imageless captions for image-only captures', () => {
    const p = propose('', true);
    assert.ok(p.missing.some((m) => m.includes('caption')));
  });
});

describe('validateProposal', () => {
  it('requires date and time for events', () => {
    const errs = validateProposal({ type: 'event', title: 'X', confidence: 'low', missing: [], rationale: '' });
    assert.ok(errs.some((e) => e.includes('date')));
    assert.ok(errs.some((e) => e.includes('time')));
  });

  it('rejects end before start and bad durations', () => {
    const errs = validateProposal({
      type: 'event', title: 'X', date: '2026-11-01', time: '10:00', endTime: '09:00',
      confidence: 'low', missing: [], rationale: '',
    });
    assert.ok(errs.some((e) => e.includes('End time')));
    const taskErrs = validateProposal({
      type: 'task', title: 'Y', durationMin: 999, confidence: 'low', missing: [], rationale: '',
    });
    assert.ok(taskErrs.some((e) => e.includes('Duration')));
  });

  it('accepts a complete event', () => {
    const errs = validateProposal({
      type: 'event', title: 'Dentist', date: '2026-11-01', time: '14:30',
      confidence: 'high', missing: [], rationale: '',
    });
    assert.deepEqual(errs, []);
  });
});

describe('suggestOutfits', () => {
  const catalog: Clothing[] = [
    { id: 't1', name: 'Tee', category: 'top', tags: ['casual'], state: 'available', createdAt: '' },
    { id: 't2', name: 'Shirt', category: 'top', tags: ['smart'], state: 'laundry', createdAt: '' },
    { id: 'b1', name: 'Jeans', category: 'bottom', tags: ['casual'], state: 'available', createdAt: '' },
    { id: 's1', name: 'Sneakers', category: 'shoes', tags: ['casual'], state: 'available', createdAt: '' },
  ];

  it('uses only available catalog items', () => {
    const out = suggestOutfits(catalog, 'class');
    assert.ok(out.length >= 1);
    for (const sg of out) {
      for (const id of sg.itemIds) {
        const item = catalog.find((c) => c.id === id)!;
        assert.equal(item.state, 'available', `${item.name} must be available`);
      }
      assert.ok(!sg.itemIds.includes('t2'), 'laundry item must never be suggested');
    }
  });

  it('returns nothing when a full outfit is impossible', () => {
    const out = suggestOutfits(catalog.filter((c) => c.category !== 'shoes'), 'class');
    assert.deepEqual(out, []);
  });
});

describe('searchBelongings', () => {
  const locs: StorageLocation[] = [{ id: 'l1', name: 'Top desk drawer', createdAt: '' }];
  const bels: Belonging[] = [
    { id: 'b1', name: 'USB-C adapter', description: 'silver dongle', locationId: 'l1', history: [], createdAt: '' },
    { id: 'b2', name: 'Novel', description: 'blue cover', history: [], createdAt: '' },
  ];

  it('answers natural language with ranked hits', () => {
    const hits = searchBelongings('Where did I put the adapter?', bels, locs);
    assert.equal(hits[0]?.belonging.id, 'b1');
    assert.equal(hits[0]?.location?.name, 'Top desk drawer');
  });

  it('returns nothing for empty queries', () => {
    assert.deepEqual(searchBelongings('the', bels, locs), []);
  });
});
