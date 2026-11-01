// Live Muse adapter: proxy responses are untrusted input — anything malformed
// schema-checks to null, and every failure falls back to local classification.
// No network here: fetch is always stubbed or provably uncalled.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_LABEL, interpretViaMuse, liveModeEnabled, resolveIntent,
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

/** Run with a stubbed localStorage opt-in, restored afterwards. */
function withLiveMode<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  const g = globalThis as { localStorage?: unknown };
  const prev = g.localStorage;
  g.localStorage = { getItem: () => (on ? '1' : '0'), setItem: () => {} };
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

  it('is off by default where no opt-in exists', () => {
    assert.equal(liveModeEnabled(), false);
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
