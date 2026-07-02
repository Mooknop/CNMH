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
      item: [
        { id: 'i1', name: 'X', traits: ['a', 'b'] }, // diverged in live -> changed
        { id: 'i2', name: 'Y' }, // live has GM-assigned image only -> unchanged
        { id: 'i3', name: 'Z-new' }, // diverged AND live has an image -> changed, image preserved
        { id: 'i4', name: 'W', image: 'img_stale.jpg', imagePosition: { x: 10, y: 10 } }, // stale seed image, GM removed it live -> unchanged
        { id: 'i5', name: 'V', image: 'img_seed.jpg' }, // absent from live -> added whole, seed image kept
      ],
      character: [{ id: 'Pellias', name: 'P', authored: true }], // excluded -> never written
      theme: [{ id: 'campaign', preset: 'ember' }], // excluded -> never written
      // Stale seed lore (no parent/related) — excluded so it can't clobber the
      // vault-owned edges on the live doc (#849).
      lore: [{ id: 'sandpoint', title: 'Sandpoint' }],
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
  item: [
    { name: 'X-changed', id: 'i1', traits: ['a', 'b'] }, // changed value
    // GM assigned art after the last snapshot pull — the only drift vs the
    // bundle. The apply must NOT revert it (2026-07-02 incident) nor even
    // count the doc as changed.
    { id: 'i2', name: 'Y', image: 'img_y.jpg', imagePosition: { x: 30, y: 60 } },
    // Authored change in the bundle AND a live image assignment: the write
    // must carry the bundled name but keep the live image.
    { id: 'i3', name: 'Z', image: 'img_z.jpg', imagePosition: { x: 50, y: 50 } },
    // GM removed the image live; the stale seed copy must not resurrect it.
    { id: 'i4', name: 'W' },
  ],
  character: [{ id: 'Pellias', name: 'P', liveInventory: ['sword'] }], // must survive untouched
  // Vault-authored lore: parent/related exist only here, never in the seed. A
  // content apply must not touch it or those edges would be wiped (#849).
  lore: [{ id: 'sandpoint', title: 'Sandpoint', parent: 'varisia', related: ['red-dog-smithy'] }],
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

const putBody = (fn, url) => {
  const call = fn.mock.calls.find(([u, opts]) => u === url && opts && opts.method === 'PUT');
  return call ? JSON.parse(call[1].body) : undefined;
};

afterEach(() => vi.restoreAllMocks());

describe('applyContentDiff', () => {
  it('writes only new and changed docs, one PUT each', async () => {
    const fn = installFetch();
    await applyContentDiff();
    const puts = putCalls(fn);
    expect(puts).toContain('/api/gm/quest/q2'); // added
    expect(puts).toContain('/api/gm/item/i1'); // changed
    expect(puts).toContain('/api/gm/item/i3'); // changed (authored drift)
    expect(puts).toContain('/api/gm/item/i5'); // added
    expect(puts).not.toContain('/api/gm/quest/q1'); // unchanged — skipped
    expect(puts).toHaveLength(4);
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
      added: ['i5'],
      changed: ['i1', 'i3'],
      unchanged: 2, // i2 (live image only) and i4 (stale seed image) — see below
      liveOnly: [],
    });
  });

  describe('live image preservation (LIVE_IMAGE_FIELDS)', () => {
    it('does not write a doc whose only drift is a GM-assigned image', async () => {
      const fn = installFetch();
      await applyContentDiff();
      expect(putCalls(fn)).not.toContain('/api/gm/item/i2');
    });

    it('keeps the live image/imagePosition when writing an authored change', async () => {
      const fn = installFetch();
      await applyContentDiff();
      expect(putBody(fn, '/api/gm/item/i3')).toEqual({
        id: 'i3',
        name: 'Z-new', // authored change from the bundle
        image: 'img_z.jpg', // live GM assignment preserved
        imagePosition: { x: 50, y: 50 },
      });
    });

    it('does not resurrect a stale seed image the GM removed live', async () => {
      const fn = installFetch();
      await applyContentDiff();
      expect(putCalls(fn)).not.toContain('/api/gm/item/i4');
    });

    it('writes a brand-new doc whole, seed image included', async () => {
      const fn = installFetch();
      await applyContentDiff();
      expect(putBody(fn, '/api/gm/item/i5')).toEqual({
        id: 'i5',
        name: 'V',
        image: 'img_seed.jpg',
      });
    });
  });

  it('never deletes a live-only doc', async () => {
    const fn = installFetch();
    await applyContentDiff();
    const deletes = fn.mock.calls.filter(([, opts]) => opts && opts.method === 'DELETE');
    expect(deletes).toHaveLength(0);
  });

  it('never writes excluded collections (character, theme, lore)', async () => {
    const fn = installFetch();
    await applyContentDiff();
    const puts = putCalls(fn);
    expect(puts.some((u) => u.startsWith('/api/gm/character/'))).toBe(false);
    expect(puts.some((u) => u.startsWith('/api/gm/theme/'))).toBe(false);
    // lore is vault-owned: a stale seed must never overwrite the live doc's
    // parent/related edges (#849).
    expect(puts.some((u) => u.startsWith('/api/gm/lore/'))).toBe(false);
  });

  it('omits excluded collections from the report (lore never appears)', async () => {
    const report = (installFetch(), await applyContentDiff());
    expect(report.lore).toBeUndefined();
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
