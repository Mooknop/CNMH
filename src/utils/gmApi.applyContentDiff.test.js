// Isolated from gmApi.test.js because these tests mock defaultContent() to a
// small controlled bundle — the other gmApi tests rely on the real bundle.

import { vi } from 'vitest';

vi.mock('./contentUtils', async () => {
  const actual = await vi.importActual('./contentUtils');
  return {
    ...actual,
    defaultContent: () => ({
      quest: [
        { id: 'q1', title: 'A' }, // unchanged in live
        { id: 'q2', title: 'B' }, // absent from live -> added
      ],
      item: [{ id: 'i1', name: 'X', traits: ['a', 'b'] }], // diverged in live -> changed
      character: [{ id: 'Pellias', name: 'P', authored: true }], // excluded -> never written
      theme: [{ id: 'campaign', preset: 'ember' }], // excluded -> never written
    }),
  };
});

import { applyContentDiff } from './gmApi';

// Live store the GET /api/content read returns.
const LIVE = {
  quest: [
    { id: 'q1', title: 'A' }, // matches bundle (id key reordered to prove order-insensitivity)
    { id: 'qOld', title: 'gone from bundle' }, // live-only -> reported, not deleted
  ],
  item: [{ name: 'X-changed', id: 'i1', traits: ['a', 'b'] }], // changed value
  character: [{ id: 'Pellias', name: 'P', liveInventory: ['sword'] }], // must survive untouched
};

// fetch mock: GET /api/content returns the live snapshot (optionally enveloped);
// every other call is a PUT that succeeds. Records calls for assertions.
const installFetch = ({ envelope = true } = {}) => {
  const fn = vi.fn((url, opts = {}) => {
    if (url === '/api/content') {
      const payload = envelope ? { payload: LIVE } : LIVE;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  });
  global.fetch = fn;
  return fn;
};

const putCalls = (fn) =>
  fn.mock.calls.filter(([, opts]) => opts && opts.method === 'PUT').map(([url]) => url);

afterEach(() => vi.restoreAllMocks());

describe('applyContentDiff', () => {
  it('writes only new and changed docs, one PUT each', async () => {
    const fn = installFetch();
    await applyContentDiff();
    const puts = putCalls(fn);
    expect(puts).toContain('/api/gm/quest/q2'); // added
    expect(puts).toContain('/api/gm/item/i1'); // changed
    expect(puts).not.toContain('/api/gm/quest/q1'); // unchanged — skipped
    expect(puts).toHaveLength(2);
  });

  it('reports added / changed / unchanged / live-only per collection', async () => {
    installFetch();
    const report = await applyContentDiff();
    expect(report.quest).toEqual({
      added: ['q2'],
      changed: [],
      unchanged: 1,
      liveOnly: ['qOld'],
    });
    expect(report.item).toEqual({
      added: [],
      changed: ['i1'],
      unchanged: 0,
      liveOnly: [],
    });
  });

  it('never deletes a live-only doc', async () => {
    const fn = installFetch();
    await applyContentDiff();
    const deletes = fn.mock.calls.filter(([, opts]) => opts && opts.method === 'DELETE');
    expect(deletes).toHaveLength(0);
  });

  it('never writes excluded collections (character, theme)', async () => {
    const fn = installFetch();
    await applyContentDiff();
    const puts = putCalls(fn);
    expect(puts.some((u) => u.startsWith('/api/gm/character/'))).toBe(false);
    expect(puts.some((u) => u.startsWith('/api/gm/theme/'))).toBe(false);
  });

  it('treats key-order-only differences as unchanged (no write)', async () => {
    const fn = installFetch();
    await applyContentDiff();
    // q1 in live has the same fields with a reordered key set — must not PUT.
    expect(putCalls(fn)).not.toContain('/api/gm/quest/q1');
  });

  it('accepts a bare (non-enveloped) /api/content body', async () => {
    const fn = installFetch({ envelope: false });
    const report = await applyContentDiff();
    expect(report.quest.added).toEqual(['q2']);
    expect(putCalls(fn)).toContain('/api/gm/quest/q2');
  });

  it('throws when the content read fails', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }));
    await expect(applyContentDiff()).rejects.toThrow('HTTP 500');
  });
});
