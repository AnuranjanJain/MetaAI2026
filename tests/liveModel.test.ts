// Live Muse adapter: proxy responses are untrusted input — anything malformed
// schema-checks to null, and every failure falls back to local classification.
// No network here: fetch is always stubbed or provably uncalled.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECT_LABEL, LIVE_INTRO, LIVE_LABEL, interpretDirect, interpretViaMuse, liveModeActive, liveModeEnabled, proxyConfigured, proxySibling, resolveIntent, tagPhotoDirect, tagPhotoViaMuse, warmProxy,
} from '../src/core/liveModel.js';
import { emptyState } from '../src/core/model.js';

const PROXY = 'https://proxy.test/api/interpret';

interface StubOpts {
  status?: number;
  body?: unknown;
  raw?: string;
  throws?: unknown;
  hang?: boolean;
  calls?: { n: number };
}

function stubFetch(opts: StubOpts = {}): typeof fetch {
  return (async () => {
    if (opts.calls) opts.calls.n++;
    if (opts.throws !== undefined) throw opts.throws;
    if (opts.hang) return new Promise(() => {}) as never;
    const text = opts.raw ?? JSON.stringify(opts.body ?? null);
    const status = opts.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => JSON.parse(text) as unknown,
      text: async () => text,
    };
  }) as unknown as typeof fetch;
}

const VALID_WHERE = { kind: 'where', query: 'adapter', reason: 'Live Muse interpretation — test.' };

/** Run with a stubbed localStorage opt-in (key slot empty), restored afterwards. */
function withLiveMode<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  const g = globalThis as { localStorage?: unknown };
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => (k === 'pocketroom.liveMuse' ? (on ? '1' : '0') : null),
    setItem: () => {},
  };
  return fn().finally(() => {
    if (prev === undefined) delete g.localStorage;
    else g.localStorage = prev;
  });
}

describe('live adapter basics', () => {
  it('labels live results without demo copy', () => {
    assert.equal(LIVE_LABEL, 'Live Muse interpretation');
    assert.doesNotMatch(LIVE_LABEL, /demo/i);
  });

  it('is on by default unless explicitly opted out', () => {
    assert.equal(liveModeEnabled(), true);
  });

  it('names live mode in the intro without demo copy', () => {
    assert.match(LIVE_INTRO, /Live Muse interpretation is on/);
    assert.doesNotMatch(LIVE_INTRO, /demo/i);
  });

  it('needs both enabled and a configured proxy to show live', async () => {
    assert.equal(proxyConfigured(), false);
    assert.equal(liveModeActive(), false);
    await withLiveMode(true, async () => {
      assert.equal(liveModeActive(), false);
    });
    await withLiveMode(false, async () => {
      assert.equal(liveModeEnabled(), false);
      assert.equal(liveModeActive(), false);
    });
  });

  it('passes a valid intent through untouched', async () => {
    const intent = await interpretViaMuse('where is my adapter', {
      proxyUrl: PROXY, fetchFn: stubFetch({ body: VALID_WHERE }),
    });
    assert.deepEqual(intent, VALID_WHERE);
  });
});

describe('untrusted proxy responses', () => {
  const bad: Array<[string, unknown]> = [
    ['missing field', { kind: 'where', reason: 'x' }],
    ['unknown kind', { kind: 'teleport', query: 'x', reason: 'x' }],
    ['wrong field type', { kind: 'where', query: 42, reason: 'x' }],
    ['empty required field', { kind: 'where', query: '  ', reason: 'x' }],
    ['missing reason', { kind: 'next' }],
    ['null body', null],
    ['array body', []],
    ['string body', 'where adapter'],
  ];
  for (const [name, body] of bad) {
    it(`rejects malformed responses (${name})`, async () => {
      const intent = await interpretViaMuse('where is my adapter', {
        proxyUrl: PROXY, fetchFn: stubFetch({ body }),
      });
      assert.equal(intent, null);
    });
  }

  it('rejects extra fields', async () => {
    const intent = await interpretViaMuse('where is my adapter', {
      proxyUrl: PROXY, fetchFn: stubFetch({ body: { ...VALID_WHERE, extra: 1 } }),
    });
    assert.equal(intent, null);
  });

  it('rejects non-JSON responses', async () => {
    const intent = await interpretViaMuse('where is my adapter', {
      proxyUrl: PROXY, fetchFn: stubFetch({ raw: 'not json{' }),
    });
    assert.equal(intent, null);
  });

  it('rejects error statuses', async () => {
    for (const status of [400, 500, 502]) {
      const intent = await interpretViaMuse('where is my adapter', {
        proxyUrl: PROXY, fetchFn: stubFetch({ status, body: VALID_WHERE }),
      });
      assert.equal(intent, null);
    }
  });

  it('rejects fetch failures', async () => {
    const intent = await interpretViaMuse('where is my adapter', {
      proxyUrl: PROXY, fetchFn: stubFetch({ throws: new Error('down') }),
    });
    assert.equal(intent, null);
  });

  it('times out instead of hanging', async () => {
    const t0 = Date.now();
    const intent = await interpretViaMuse('where is my adapter', {
      proxyUrl: PROXY, fetchFn: stubFetch({ hang: true }), timeoutMs: 30,
    });
    assert.equal(intent, null);
    assert.ok(Date.now() - t0 < 5000, 'timed out promptly');
  });

  it('falls back to local fast when live hangs past budget', async () => {
    await withLiveMode(true, async () => {
      const t0 = Date.now();
      const out = await resolveIntent('where is my adapter', emptyState(), {
        proxyUrl: PROXY, fetchFn: stubFetch({ hang: true }), timeoutMs: 20,
      });
      assert.ok(Date.now() - t0 < 5000, 'fell back promptly');
      assert.notEqual(out, 'empty');
      if (out === 'empty') throw new Error('expected local fallback');
      assert.equal(out.live, false);
      assert.equal(out.offline, true);
      assert.equal(out.intent.kind, 'where');
    });
  });

  it('warms routes without user data and never throws', async () => {
    await withLiveMode(true, async () => {
      const calls: Array<{ url: unknown; init: unknown }> = [];
      const fetchFn = (async (url: unknown, init: unknown) => {
        calls.push({ url, init });
        return { ok: true, status: 204, json: async () => ({}) };
      }) as unknown as typeof fetch;
      assert.doesNotThrow(() => warmProxy(fetchFn));
      await new Promise((r) => setTimeout(r, 10));
      // No proxy URL in this build → no calls, no throw.
      assert.equal(calls.length, 0);
      assert.doesNotThrow(() => warmProxy());
    });
  });
});

describe('client-side boundaries', () => {
  it('never calls the proxy without a transcript', async () => {
    const calls = { n: 0 };
    for (const transcript of ['', '   ']) {
      const intent = await interpretViaMuse(transcript, {
        proxyUrl: PROXY, fetchFn: stubFetch({ body: VALID_WHERE, calls }),
      });
      assert.equal(intent, null);
    }
    assert.equal(calls.n, 0);
  });

  it('never calls the proxy with an overlong transcript', async () => {
    const calls = { n: 0 };
    const intent = await interpretViaMuse('x'.repeat(1001), {
      proxyUrl: PROXY, fetchFn: stubFetch({ body: VALID_WHERE, calls }),
    });
    assert.equal(intent, null);
    assert.equal(calls.n, 0);
  });

  it('never calls the proxy without a URL', async () => {
    const calls = { n: 0 };
    const intent = await interpretViaMuse('where is my adapter', {
      proxyUrl: '', fetchFn: stubFetch({ body: VALID_WHERE, calls }),
    });
    assert.equal(intent, null);
    assert.equal(calls.n, 0);
  });
});

describe('proxySibling', () => {
  it('derives the tag-photo path from the interpret URL', () => {
    assert.equal(
      proxySibling('https://proxy.test/api/interpret', 'tag-photo'),
      'https://proxy.test/api/tag-photo',
    );
  });

  it('returns null without a usable base URL', () => {
    assert.equal(proxySibling(null, 'tag-photo'), null);
    assert.equal(proxySibling('', 'tag-photo'), null);
    assert.equal(proxySibling('https://proxy.test', 'tag-photo'), null);
  });
});

describe('tagPhotoViaMuse', () => {
  const IMG = 'data:image/jpeg;base64,/9j/4AAQ';
  const TAG_URL = 'https://proxy.test/api/tag-photo';
  const VALID = { pieces: [{ name: 'Blue hoodie', category: 'top', color: 'blue', tags: ['casual'] }] };

  it('passes valid pieces through untouched', async () => {
    const pieces = await tagPhotoViaMuse(IMG, { proxyUrl: TAG_URL, fetchFn: stubFetch({ body: VALID }) });
    assert.deepEqual(pieces, VALID.pieces);
  });

  it('accepts an empty pieces array (no garments is a valid answer)', async () => {
    const pieces = await tagPhotoViaMuse(IMG, { proxyUrl: TAG_URL, fetchFn: stubFetch({ body: { pieces: [] } }) });
    assert.deepEqual(pieces, []);
  });

  const bad: Array<[string, unknown]> = [
    ['pieces not an array', { pieces: {} }],
    ['missing name', { pieces: [{ category: 'top', tags: [] }] }],
    ['empty name', { pieces: [{ name: '  ', category: 'top', tags: [] }] }],
    ['bad category', { pieces: [{ name: 'X', category: 'hat', tags: [] }] }],
    ['missing tags', { pieces: [{ name: 'X', category: 'top' }] }],
    ['non-string tag', { pieces: [{ name: 'X', category: 'top', tags: [1] }] }],
    ['color wrong type', { pieces: [{ name: 'X', category: 'top', color: 5, tags: [] }] }],
    ['extra piece key', { pieces: [{ name: 'X', category: 'top', tags: [], price: 9 }] }],
    ['extra top-level key', { pieces: [], model: 'x' }],
    ['too many pieces', { pieces: Array.from({ length: 13 }, () => ({ name: 'X', category: 'top', tags: [] })) }],
    ['null body', null],
  ];
  for (const [name, body] of bad) {
    it(`rejects malformed responses (${name})`, async () => {
      const pieces = await tagPhotoViaMuse(IMG, { proxyUrl: TAG_URL, fetchFn: stubFetch({ body }) });
      assert.equal(pieces, null);
    });
  }

  it('rejects error statuses, failures, and hangs', async () => {
    assert.equal(await tagPhotoViaMuse(IMG, { proxyUrl: TAG_URL, fetchFn: stubFetch({ status: 502, body: VALID }) }), null);
    assert.equal(await tagPhotoViaMuse(IMG, { proxyUrl: TAG_URL, fetchFn: stubFetch({ throws: new Error('down') }) }), null);
    const t0 = Date.now();
    assert.equal(await tagPhotoViaMuse(IMG, { proxyUrl: TAG_URL, fetchFn: stubFetch({ hang: true }), timeoutMs: 30 }), null);
    assert.ok(Date.now() - t0 < 5000, 'timed out promptly');
  });

  it('never calls the proxy without a data-URL image', async () => {
    const calls = { n: 0 };
    const opts = { proxyUrl: TAG_URL, fetchFn: stubFetch({ body: VALID, calls }) };
    assert.equal(await tagPhotoViaMuse('', opts), null);
    assert.equal(await tagPhotoViaMuse('https://example.com/pic.jpg', opts), null);
    assert.equal(await tagPhotoViaMuse(`data:image/jpeg;base64,${'x'.repeat(2000000)}`, opts), null);
    assert.equal(await tagPhotoViaMuse(IMG, { proxyUrl: '', fetchFn: stubFetch({ body: VALID, calls }) }), null);
    assert.equal(calls.n, 0);
  });
});

describe('direct mode (user key)', () => {
  const PROXY_URL = 'https://proxy.test/api/interpret';
  const DIRECT_WHERE = { choices: [{ message: { content: JSON.stringify(VALID_WHERE) } }] };
  const DIRECT_WHERE_RESULT = {
    kind: 'where', query: 'adapter',
    reason: 'Direct Muse interpretation — searching your recorded spots, nothing added.',
  };

  function captureStub(body: unknown): { headers: unknown[]; fetch: typeof fetch } {
    const headers: unknown[] = [];
    const stub = (async (_url: unknown, init?: { headers?: unknown }) => {
      headers.push(init?.headers);
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    }) as unknown as typeof fetch;
    return { headers, fetch: stub };
  }

  it('labels direct results distinctly', () => {
    assert.match(DIRECT_LABEL, /Direct Muse interpretation/);
    assert.doesNotMatch(DIRECT_LABEL, /demo/i);
    assert.notEqual(DIRECT_LABEL, LIVE_LABEL);
  });

  it('sends the key as a Bearer token and attaches a direct reason', async () => {
    const cap = captureStub(DIRECT_WHERE);
    const intent = await interpretDirect('where is my adapter', 'sk-test', { fetchFn: cap.fetch });
    assert.deepEqual(intent, DIRECT_WHERE_RESULT);
    assert.deepEqual(cap.headers, [{ 'Content-Type': 'application/json', Authorization: 'Bearer sk-test' }]);
  });

  it('returns null on rejected keys and malformed replies', async () => {
    assert.equal(await interpretDirect('hi', 'sk-bad', { fetchFn: stubFetch({ status: 401, body: {} }) }), null);
    assert.equal(await interpretDirect('hi', 'sk-test', { fetchFn: stubFetch({ body: { choices: [] } }) }), null);
    assert.equal(await interpretDirect('', 'sk-test', { fetchFn: stubFetch({ body: DIRECT_WHERE }) }), null);
  });

  it('tags photos directly with the same validation', async () => {
    const img = 'data:image/jpeg;base64,/9j/4AAQ';
    const pieces = [{ name: 'Tee', category: 'top', tags: [] }];
    const direct = { choices: [{ message: { content: JSON.stringify(pieces) } }] };
    assert.deepEqual(await tagPhotoDirect(img, 'sk-test', { fetchFn: stubFetch({ body: direct }) }), pieces);
    assert.equal(await tagPhotoDirect(img, 'sk-bad', { fetchFn: stubFetch({ status: 401, body: {} }) }), null);
    assert.equal(await tagPhotoDirect('not-a-data-url', 'sk-test', { fetchFn: stubFetch({ body: direct }) }), null);
  });

  it('prefers direct, then proxy, then local', async () => {
    const g = globalThis as { localStorage?: unknown };
    const prev = g.localStorage;
    const store = new Map<string, string>([['pocketroom.liveMuse', '1'], ['pocketroom.museKey', 'sk-test']]);
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
    try {
      const route = (directBody: unknown, directStatus = 200) =>
        (async (url: unknown) => {
          const direct = String(url).includes('api.meta.ai');
          const status = direct ? directStatus : 200;
          return {
            ok: status >= 200 && status < 300, status,
            json: async () => (direct ? directBody : VALID_WHERE),
          };
        }) as unknown as typeof fetch;
      const directOk = await resolveIntent('where is my adapter', emptyState(), {
        proxyUrl: PROXY_URL, fetchFn: route(DIRECT_WHERE),
      });
      assert.notEqual(directOk, 'empty');
      if (directOk === 'empty') throw new Error('expected intent');
      assert.equal(directOk.live, true);
      assert.equal(directOk.direct, true);

      const proxyFallback = await resolveIntent('where is my adapter', emptyState(), {
        proxyUrl: PROXY_URL, fetchFn: route({}, 401),
      });
      assert.notEqual(proxyFallback, 'empty');
      if (proxyFallback === 'empty') throw new Error('expected intent');
      assert.equal(proxyFallback.live, true);
      assert.equal(proxyFallback.direct, false);
    } finally {
      if (prev === undefined) delete g.localStorage;
      else g.localStorage = prev;
    }
  });
});

describe('resolveIntent (live-first, local fallback)', () => {
  it('never calls the proxy when live mode is off', async () => {
    const calls = { n: 0 };
    const out = await withLiveMode(false, () => resolveIntent('Where is my adapter?', emptyState(), {
      proxyUrl: PROXY, fetchFn: stubFetch({ body: VALID_WHERE, calls }),
    }));
    assert.notEqual(out, 'empty');
    if (out === 'empty') throw new Error('expected intent');
    assert.equal(out.live, false);
    assert.equal(out.intent.kind, 'where');
    assert.equal(calls.n, 0);
  });

  it('uses local classification when the proxy fails', async () => {
    const out = await withLiveMode(true, () => resolveIntent('Where is my adapter?', emptyState(), {
      proxyUrl: PROXY, fetchFn: stubFetch({ status: 502, body: {} }),
    }));
    assert.notEqual(out, 'empty');
    if (out === 'empty') throw new Error('expected intent');
    assert.equal(out.live, false);
    assert.equal(out.intent.kind, 'where');
  });

  it('keeps the classify-raw-first/strip ordering on the local path', async () => {
    const s = emptyState();
    s.tasks = [{
      id: 't1', title: 'Buy milk', durationMin: 30, flexible: true,
      done: false, createdAt: '2026-11-01T09:00:00.000Z', updatedAt: '2026-11-01T09:00:00.000Z',
    }];
    const done = await resolveIntent('Mark buy milk done', s, {
      proxyUrl: PROXY, fetchFn: stubFetch({ status: 500, body: {} }),
    });
    assert.notEqual(done, 'empty');
    if (done === 'empty') throw new Error('expected intent');
    assert.equal(done.intent.kind, 'done');
    if (done.intent.kind !== 'done') throw new Error('expected done');
    assert.equal(done.intent.taskId, 't1');

    const empty = await resolveIntent("that's it", s, {
      proxyUrl: PROXY, fetchFn: stubFetch({ status: 500, body: {} }),
    });
    assert.equal(empty, 'empty');
  });

  it('takes a valid live intent as-is', async () => {
    const out = await withLiveMode(true, () => resolveIntent('where is my adapter', emptyState(), {
      proxyUrl: PROXY,
      fetchFn: stubFetch({ body: { kind: 'add', text: 'Buy milk', reason: 'Live Muse interpretation — test.' } }),
    }));
    assert.notEqual(out, 'empty');
    if (out === 'empty') throw new Error('expected intent');
    assert.equal(out.live, true);
    assert.equal(out.intent.kind, 'add');
  });

  it('resolves done locally even when live answers', async () => {
    const s = emptyState();
    s.tasks = [{
      id: 't1', title: 'Buy milk', durationMin: 30, flexible: true,
      done: false, createdAt: '2026-11-01T09:00:00.000Z', updatedAt: '2026-11-01T09:00:00.000Z',
    }];
    const out = await withLiveMode(true, () => resolveIntent('Mark buy milk done', s, {
      proxyUrl: PROXY,
      fetchFn: stubFetch({ body: { kind: 'done', taskId: 'made-up', title: 'Buy milk', reason: 'Live test.' } }),
    }));
    assert.notEqual(out, 'empty');
    if (out === 'empty') throw new Error('expected intent');
    assert.equal(out.live, false);
    assert.equal(out.intent.kind, 'done');
    if (out.intent.kind !== 'done') throw new Error('expected done');
    assert.equal(out.intent.taskId, 't1');
  });
});
