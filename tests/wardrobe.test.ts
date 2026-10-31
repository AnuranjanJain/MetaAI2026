// Wardrobe-photo scaffold: only confirmed, named drafts become clothing —
// excluded or unnamed drafts are never guessed at. Event titles map to
// outfit occasions only when a keyword actually matches.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { draftsToClothing, makeDraft, normalizeTags, photoItemCount } from '../src/core/wardrobeVision.js';
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
