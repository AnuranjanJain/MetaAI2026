// Wardrobe-photo scaffold: only confirmed, named drafts become clothing —
// excluded or unnamed drafts are never guessed at. Event titles map to
// outfit occasions only when a keyword actually matches.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHOTO_DIRECT_LABEL, PHOTO_ITEM_CAP, draftsFromPieces, draftsToClothing, makeDraft, normalizeTags, photoItemCount } from '../src/core/wardrobeVision.js';
import { occasionFromEvent } from '../src/core/inference.js';

describe('draftsToClothing', () => {
  it('keeps only included, named drafts and attaches the shared photo', () => {
    const items = draftsToClothing([
      makeDraft({ name: 'Blue hoodie', category: 'top' }),
      makeDraft({ name: 'Mystery thing', include: false }),
      makeDraft({ name: '   ' }),
    ], 'data:image/jpeg;base64,x');
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'Blue hoodie');
    assert.equal(items[0].photoDataUrl, 'data:image/jpeg;base64,x');
    assert.equal(items[0].state, 'available');
  });

  it('normalizes tags: lowercase, trimmed, de-duplicated, capped', () => {
    assert.deepEqual(normalizeTags([' Casual ', 'CASUAL', '', 'Class']), ['casual', 'class']);
    const [item] = draftsToClothing(
      [makeDraft({ name: 'Tee', tags: ['Work', ' work ', 'Smart'] })], undefined);
    assert.deepEqual(item.tags, ['work', 'smart']);
    assert.equal(item.photoDataUrl, undefined);
  });

  it('counts only photo-backed pieces against the cap', () => {
    const items = draftsToClothing(
      [makeDraft({ name: 'A' }), makeDraft({ name: 'B' })], 'data:image/jpeg;base64,y');
    assert.equal(photoItemCount(items), 2);
    assert.equal(photoItemCount([{ ...items[0], photoDataUrl: undefined }]), 0);
  });

  it('makes an included, empty draft by default', () => {
    const d = makeDraft();
    assert.equal(d.include, true);
    assert.equal(d.name, '');
    assert.equal(d.category, 'top');
  });
});

describe('draftsFromPieces', () => {
  it('shapes live pieces into included drafts with fresh ids', () => {
    const drafts = draftsFromPieces([
      { name: 'Blue hoodie', category: 'top', color: 'blue', tags: ['Casual', 'casual'] },
      { name: 'White sneakers', category: 'shoes', tags: [] },
    ]);
    assert.equal(drafts.length, 2);
    assert.equal(drafts[0].name, 'Blue hoodie');
    assert.equal(drafts[0].color, 'blue');
    assert.equal(drafts[0].include, true);
    assert.deepEqual(drafts[0].tags, ['casual']);
    assert.notEqual(drafts[0].id, drafts[1].id);
  });

  it('caps drafts at the photo item cap', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, category: 'top' as const, tags: [] }));
    assert.equal(draftsFromPieces(many).length, PHOTO_ITEM_CAP);
  });

  it('names direct detection distinctly', () => {
    assert.match(PHOTO_DIRECT_LABEL, /Direct Muse detection/);
    assert.doesNotMatch(PHOTO_DIRECT_LABEL, /demo/i);
  });
});

describe('occasionFromEvent', () => {
  it('maps event titles to occasions', () => {
    assert.equal(occasionFromEvent('Gym session'), 'gym');
    assert.equal(occasionFromEvent('Design lecture'), 'class');
    assert.equal(occasionFromEvent('Team meeting'), 'work');
    assert.equal(occasionFromEvent('Dinner with Sam'), 'evening');
  });

  it('prefers specific activities and stays silent on no match', () => {
    assert.equal(occasionFromEvent('Morning workout'), 'gym');
    assert.equal(occasionFromEvent('Dentist appointment'), undefined);
    assert.equal(occasionFromEvent(''), undefined);
  });
});
