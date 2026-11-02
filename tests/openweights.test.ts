// Open-weights backend: storage + provider order + Baseten request shape.
// No network: fetch is always stubbed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/model.js';
import {
  clearOpenKey, getOpenKey, getProvider, hasOpenKey, setOpenKey, setProvider,
  validateOpenKey, OPEN_LABEL, OPEN_MODEL, OPEN_URL,
} from '../src/core/openweights.js';
import { captainOpen, interpretOpen, liveBadge, resolveIntent } from '../src/core/liveModel.js';

function withStorage(entries: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const g = globalThis as { localStorage?: unknown };
  const prev = g.localStorage;
  const store = new Map(Object.entries(entries));
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  return fn().finally(() => {
    if (prev === undefined) delete g.localStorage;
    else g.localStorage = prev;
  });
}

function stubFetch(seen: { url?: unknown; body?: unknown }, reply: unknown): typeof fetch {
  return (async (url: unknown, init?: { body?: unknown }) => {
    seen.url = url;
    seen.body = init?.body ? JSON.parse(String(init.body)) as unknown : undefined;
    return { ok: true, status: 200, json: async () => reply };
  }) as unknown as typeof fetch;
}

const CHAT_WHERE = { choices: [{ message: { content: '{"kind":"where","query":"adapter"}' } }] };

describe('openweights storage', () => {
  it('defaults to Meta with no key', async () => {
    await withStorage({}, async () => {
      assert.equal(getProvider(), 'meta');
      assert.equal(hasOpenKey(), false);
      assert.equal(getOpenKey(), null);
    });
  });

  it('stores the provider and key, clearing on empty', async () => {
    await withStorage({}, async () => {
      setProvider('open');
      assert.equal(getProvider(), 'open');
      setOpenKey('bx-test');
      assert.equal(hasOpenKey(), true);
      setOpenKey('  ');
      assert.equal(hasOpenKey(), false);
      clearOpenKey();
      assert.equal(getProvider(), 'open');
    });
  });

  it('names the verified endpoint, model, and label', () => {
    assert.equal(OPEN_URL, 'https://inference.baseten.co/v1/chat/completions');
    assert.equal(OPEN_MODEL, 'meta-models/muse-spark-open-1026');
    assert.match(OPEN_LABEL, /Baseten/);
  });
});

describe('validateOpenKey', () => {
  it('posts the open model to Baseten and reads ok/rejected/unreachable', async () => {
    const seen: { url?: unknown; body?: unknown } = {};
    const ok = await validateOpenKey('bx-test', stubFetch(seen, CHAT_WHERE));
    assert.equal(ok, 'ok');
    assert.equal(seen.url, OPEN_URL);
    assert.equal((seen.body as { model?: string }).model, OPEN_MODEL);
    const denied = await validateOpenKey('bx-bad', (async () => ({
      ok: false, status: 401, json: async () => ({}),
    })) as unknown as typeof fetch);
    assert.equal(denied, 'rejected');
    assert.equal(await validateOpenKey('', stubFetch(seen, CHAT_WHERE)), 'rejected');
  });
});

describe('open chat paths', () => {
  it('interprets via the open backend with an open-labeled reason', async () => {
    const seen: { url?: unknown; body?: unknown } = {};
    const intent = await interpretOpen('where is my adapter', 'bx-test', {
      fetchFn: stubFetch(seen, CHAT_WHERE),
    });
    assert.equal(seen.url, OPEN_URL);
    assert.equal(intent?.kind, 'where');
    assert.match(intent?.reason ?? '', /Open Muse via Baseten/);
    assert.doesNotMatch(intent?.reason ?? '', /demo/i);
  });

  it('captains via the open backend with an open trace', async () => {
    const draft = { slots: [], prep: [], leaveBy: [], outfitIds: [], pack: [], notes: 'n' };
    const out = await captainOpen('{"date":"2026-11-03"}', 'bx-test', {
      fetchFn: stubFetch({}, { choices: [{ message: { content: JSON.stringify(draft) } }] }),
    });
    assert.equal(out?.model, OPEN_MODEL);
    assert.ok(out?.plan.trace.some((t) => t.includes('Open Captain')));
  });

  it('prefers the selected provider, then the other key', async () => {
    const route = (seen: string[]) =>
      (async (url: unknown) => {
        const open = String(url).includes('baseten');
        seen.push(open ? 'open' : 'meta');
        return { ok: !open, status: open ? 500 : 200, json: async () => CHAT_WHERE };
      }) as unknown as typeof fetch;
    // Selected open but Baseten fails → falls back to Meta key.
    await withStorage({ 'pocketroom.provider': 'open', 'pocketroom.basetenKey': 'bx', 'pocketroom.museKey': 'sk' }, async () => {
      const seen: string[] = [];
      const out = await resolveIntent('where is my adapter', emptyState(), { fetchFn: route(seen) });
      assert.deepEqual(seen, ['open', 'meta']);
      assert.notEqual(out, 'empty');
      if (out === 'empty') throw new Error('expected intent');
      assert.equal(out.model, 'muse-spark-1.3-contributor');
    });
    // Default provider → Meta first, Baseten untouched.
    await withStorage({ 'pocketroom.basetenKey': 'bx', 'pocketroom.museKey': 'sk' }, async () => {
      const seen: string[] = [];
      await resolveIntent('where is my adapter', emptyState(), { fetchFn: route(seen) });
      assert.deepEqual(seen, ['meta']);
    });
  });

  it('badges the open backend distinctly', async () => {
    await withStorage({ 'pocketroom.provider': 'open', 'pocketroom.basetenKey': 'bx' }, async () => {
      assert.match(liveBadge(), /Open Muse/);
      assert.match(liveBadge(), /muse-spark-open-1026/);
    });
  });
});
