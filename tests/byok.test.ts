// BYOK storage + key validation. No network: fetch is always stubbed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearKey, getKey, hasKey, setKey, validateKey } from '../src/core/byok.js';

function stubStorage(): {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
} {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
}

function withLocalStorage<T>(store: unknown, fn: () => T): T {
  const g = globalThis as { localStorage?: unknown };
  const prev = g.localStorage;
  g.localStorage = store;
  const restore = () => {
    if (prev === undefined) delete g.localStorage;
    else g.localStorage = prev;
  };
  const out = fn();
  if (out instanceof Promise) return out.finally(restore) as T;
  restore();
  return out;
}

function stubFetch(opts: { status?: number; body?: unknown; throws?: unknown; hang?: boolean; calls?: { n: number } } = {}): typeof fetch {
  return (async () => {
    if (opts.calls) opts.calls.n++;
    if (opts.throws !== undefined) throw opts.throws;
    if (opts.hang) return new Promise(() => {}) as never;
    const status = opts.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => opts.body ?? null,
    };
  }) as unknown as typeof fetch;
}

const OK_BODY = { choices: [{ message: { content: '{"kind":"next"}' } }] };

describe('byok storage', () => {
  it('round-trips a trimmed key', () => {
    withLocalStorage(stubStorage(), () => {
      assert.equal(hasKey(), false);
      assert.equal(getKey(), null);
      setKey('  sk-test  ');
      assert.equal(hasKey(), true);
      assert.equal(getKey(), 'sk-test');
    });
  });

  it('removes the key on empty set or clear', () => {
    withLocalStorage(stubStorage(), () => {
      setKey('sk-test');
      setKey('   ');
      assert.equal(hasKey(), false);
      setKey('sk-test');
      clearKey();
      assert.equal(getKey(), null);
    });
  });

  it('reports no key where storage is absent', () => {
    assert.equal(hasKey(), false);
    assert.equal(getKey(), null);
  });
});

describe('validateKey', () => {
  it('accepts a key that yields model text', async () => {
    const status = await validateKey('sk-test', stubFetch({ body: OK_BODY }));
    assert.equal(status, 'ok');
  });

  it('rejects unauthorized keys', async () => {
    for (const status of [401, 403]) {
      assert.equal(await validateKey('sk-bad', stubFetch({ status, body: {} })), 'rejected');
    }
  });

  it('reports unreachable on errors, empty replies, and hangs', async () => {
    assert.equal(await validateKey('sk-test', stubFetch({ status: 500, body: {} })), 'unreachable');
    assert.equal(await validateKey('sk-test', stubFetch({ throws: new Error('down') })), 'unreachable');
    assert.equal(await validateKey('sk-test', stubFetch({ body: {} })), 'unreachable');
    const t0 = Date.now();
    assert.equal(await validateKey('sk-test', stubFetch({ hang: true }), 30), 'unreachable');
    assert.ok(Date.now() - t0 < 5000, 'timed out promptly');
  });

  it('never calls the network without a key', async () => {
    const calls = { n: 0 };
    assert.equal(await validateKey('   ', stubFetch({ body: OK_BODY, calls })), 'rejected');
    assert.equal(calls.n, 0);
  });
});
