// Dream poster: day words stay text-only and capped; reply parsing takes
// OpenAI-shaped b64_json or https URLs and nothing else. No network.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { seedState } from '../src/core/model.js';
import { DREAM_MODEL, DREAM_URL, dreamImage, dreamWords } from '../src/core/dream.js';
import { dreamViaMuse } from '../src/core/liveModel.js';

describe('dream constants + words', () => {
  it('names the verified images endpoint and model', () => {
    assert.equal(DREAM_URL, 'https://api.meta.ai/v1/images/generations');
    assert.equal(DREAM_MODEL, 'muse-image-1.0');
  });

  it('builds short text-only words from the day', () => {
    const s = seedState();
    const words = dreamWords(s, s.events[0].date);
    assert.ok(words.length > 0 && words.length <= 200);
    assert.doesNotMatch(words, /[<>&"]/);
  });
});

describe('dreamImage', () => {
  it('prefers b64_json as a PNG data URL', () => {
    const out = dreamImage({ data: [{ b64_json: `${'QUJD'.repeat(300)}` }] });
    assert.ok(out?.startsWith('data:image/png;base64,'));
  });

  it('accepts https URLs and rejects the rest', () => {
    assert.equal(
      dreamImage({ data: [{ url: 'https://cdn.test/pic.png' }] }),
      'https://cdn.test/pic.png',
    );
    assert.equal(dreamImage({ data: [{ url: 'http://x/pic.png' }] }), null);
    assert.equal(dreamImage({ data: [] }), null);
    assert.equal(dreamImage({}), null);
  });
});

describe('dreamViaMuse', () => {
  const stub = (body: unknown, status = 200): typeof fetch =>
    (async () => ({
      ok: status >= 200 && status < 300, status,
      json: async () => body,
    })) as unknown as typeof fetch;

  it('passes a valid dreamed image through', async () => {
    const out = await dreamViaMuse('a calm day', {
      proxyUrl: 'https://proxy.test/api/dream',
      fetchFn: stub({ image: 'https://cdn.test/pic.png', model: DREAM_MODEL }),
    });
    assert.equal(out?.image, 'https://cdn.test/pic.png');
  });

  it('returns null on bad shapes, errors, and empty words', async () => {
    const url = 'https://proxy.test/api/dream';
    assert.equal(await dreamViaMuse('day', { proxyUrl: url, fetchFn: stub({}) }), null);
    assert.equal(await dreamViaMuse('day', { proxyUrl: url, fetchFn: stub({}, 502) }), null);
    assert.equal(await dreamViaMuse('', { proxyUrl: url, fetchFn: stub({}) }), null);
  });
});
