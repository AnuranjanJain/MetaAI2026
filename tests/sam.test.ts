// SAM 3.1 results: proxy masks are untrusted input — exact-shape allowlist,
// fail-closed batches, caps on masks/size/dims. No network here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maskSvg, toSamResult } from '../src/core/sam.js';

const MASK = { objectId: 'o1', svg: 'M0 0H10V10H0Z', width: 10, height: 10 };

describe('toSamResult', () => {
  it('accepts a valid batch with boxes', () => {
    const out = toSamResult({
      masks: [{ ...MASK, box: { left: 0, top: 0, right: 5, bottom: 5 } }],
      outcome: 'ok',
    });
    assert.ok(out);
    assert.equal(out.masks.length, 1);
    assert.equal(out.masks[0].objectId, 'o1');
    assert.deepEqual(out.masks[0].box, { left: 0, top: 0, right: 5, bottom: 5 });
  });

  it('accepts an empty batch (no garments is honest)', () => {
    const out = toSamResult({ masks: [], outcome: 'ok' });
    assert.ok(out);
    assert.equal(out?.masks.length, 0);
  });

  it('fails the whole batch closed on one bad mask', () => {
    assert.equal(toSamResult({ masks: [MASK, { objectId: '', svg: 'M0', width: 1, height: 1 }] }), null);
    assert.equal(toSamResult({ masks: [{ ...MASK, svg: 'not a path' }] }), null);
    assert.equal(toSamResult({ masks: [{ ...MASK, width: 99999 }] }), null);
  });

  it('rejects oversized batches and non-objects', () => {
    assert.equal(toSamResult({ masks: Array.from({ length: 13 }, () => ({ ...MASK })) }), null);
    assert.equal(toSamResult(null), null);
    assert.equal(toSamResult([]), null); // must be {masks}; bare arrays rejected
  });
});

describe('maskSvg', () => {
  it('renders a standalone svg with the mask viewBox', () => {
    const svg = maskSvg({ ...MASK });
    assert.match(svg, /viewBox="0 0 10 10"/);
    assert.match(svg, /<path d="M0 0H10V10H0Z"/);
  });
});
