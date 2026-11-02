// Muse Wonder captain: same plan shape as Spark, longer reasoning budget.
// Wonder is preferred wherever a path exists; Spark stays the fallback.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { captainWonderViaMuse, resolveCaptain } from '../src/core/liveModel.js';
import { WONDER_MODEL } from '../src/core/muse.js';

const PLAN = { slots: [], prep: [], leaveBy: [], outfitIds: [], pack: [], notes: 'rest first' };

function stubFetch(body: unknown, status = 200): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

function withLiveMode<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  const g = globalThis as { localStorage?: unknown };
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => (k === 'pocketroom.liveMuse' ? (on ? '1' : '0') : null),
    setItem: () => {},
  };
  const g2 = globalThis as { localStorage?: unknown; pocketroomKeys?: unknown };
  const pk = g2.pocketroomKeys;
  delete g2.pocketroomKeys;
  return fn().finally(() => {
    if (prev === undefined) delete g.localStorage;
    else g.localStorage = prev;
    if (pk !== undefined) g2.pocketroomKeys = pk;
  });
}

describe('wonder captain', () => {
  it('returns a Wonder-traced plan from the proxy', async () => {
    const out = await captainWonderViaMuse('ctx', {
      proxyUrl: 'https://proxy.test/api/wonder-captain',
      fetchFn: stubFetch({ plan: PLAN, model: WONDER_MODEL }),
    });
    assert.ok(out);
    assert.equal(out?.model, WONDER_MODEL);
    assert.match(out?.plan.trace[0] ?? '', /wonder/i);
  });

  it('returns null on proxy failure', async () => {
    const out = await captainWonderViaMuse('ctx', {
      proxyUrl: 'https://proxy.test/api/wonder-captain',
      fetchFn: stubFetch({ error: 'x' }, 502),
    });
    assert.equal(out, null);
  });

  it('resolveCaptain prefers Wonder over Spark', async () => {
    const out = await withLiveMode(true, () =>
      resolveCaptain('ctx', {
        proxyUrl: 'https://proxy.test/api/wonder-captain',
        fetchFn: stubFetch({ plan: PLAN, model: WONDER_MODEL }),
      }),
    );
    assert.ok(out);
    assert.equal(out?.model, WONDER_MODEL);
  });
});
