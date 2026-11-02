// Shared Muse wire helpers: compact model names for tight UI surfaces.
// Full model ids stay in tooltips, AI setup, and traces — short names are
// display-only and never sent over the wire.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shortModel } from '../src/core/muse.js';

describe('shortModel', () => {
  it('names the known Muse models compactly', () => {
    assert.equal(shortModel('muse-spark-1.3-contributor'), 'Spark 1.3');
    assert.equal(shortModel('muse-spark-1.3'), 'Spark 1.3');
    assert.equal(shortModel('muse-wonder-1.0'), 'Wonder 1.0');
    assert.equal(shortModel('muse-image-1.0'), 'Image 1.0');
    assert.equal(shortModel('muse-voice-transcribe-1.0'), 'Voice');
    assert.equal(shortModel('meta-models/muse-spark-open-1026'), 'Spark Open');
    assert.equal(shortModel('sam-3.1'), 'SAM 3.1');
  });

  it('sheds vendor prefixes and trims unknown ids without going blank', () => {
    assert.equal(shortModel('muse-future-9.9'), 'future 9.9');
    assert.equal(shortModel('meta-models/some-model-x'), 'some model x');
    assert.equal(shortModel('x'.repeat(60)).length, 24);
    assert.equal(shortModel(''), 'model');
  });
});
