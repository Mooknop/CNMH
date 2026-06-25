// Isolated like gmApi.applyContentDiff.test.js: mocks defaultContent() to a
// small controlled character bundle so the merge behavior is easy to assert.

import { vi } from 'vitest';

vi.mock('./contentUtils', async () => {
  const actual = await vi.importActual('./contentUtils');
  return {
    ...actual,
    defaultContent: () => ({
      character: [
        // Existing char: authored `feats` changed in the bundle; bundle's
        // inventory/gold are STALE (must not overwrite the live values).
        {
          id: 'Pellias',
          name: 'Pellias',
          level: 5,
          feats: [{ id: 'f1', name: 'Patched Feat' }],
          inventory: [{ ref: 'torch' }],
          gold: 0,
        },
        // Brand-new char absent from the live store.
        { id: 'NewChar', name: 'New', level: 1, feats: [] },
      ],
    }),
  };
});

import { applyCharacterContentDiff, LIVE_CHARACTER_FIELDS } from './gmApi';

const installFetch = () => {
  const fn = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }));
  global.fetch = fn;
  return fn;
};

// PUT calls as { id, doc } from the recorded fetch calls.
const puts = (fn) =>
  fn.mock.calls
    .filter(([, opts]) => opts && opts.method === 'PUT')
    .map(([url, opts]) => ({ url, doc: JSON.parse(opts.body) }));

const LIVE = [
  {
    id: 'Pellias',
    name: 'Pellias',
    level: 5,
    feats: [{ id: 'f1', name: 'Old Feat' }], // authored — diverged from bundle
    inventory: [{ ref: 'torch' }, { ref: 'sword', uid: 'u1' }], // player picked up a sword
    gold: 137, // player earned gold
  },
  { id: 'GMOnly', name: 'GM Made', level: 3 }, // not in bundle
];

afterEach(() => vi.restoreAllMocks());

describe('applyCharacterContentDiff', () => {
  it('field-merges: applies authored changes, preserves live inventory + gold', async () => {
    const fn = installFetch();
    const report = await applyCharacterContentDiff(LIVE);

    const pellias = puts(fn).find((p) => p.url === '/api/gm/character/Pellias');
    expect(pellias).toBeTruthy();
    // authored field applied
    expect(pellias.doc.feats).toEqual([{ id: 'f1', name: 'Patched Feat' }]);
    // live fields preserved (NOT the bundle's stale torch-only / 0 gold)
    expect(pellias.doc.inventory).toEqual([{ ref: 'torch' }, { ref: 'sword', uid: 'u1' }]);
    expect(pellias.doc.gold).toBe(137);

    expect(report.changed).toEqual([{ id: 'Pellias', fields: ['feats'] }]);
  });

  it('adds a character that is absent from the live store, whole', async () => {
    const fn = installFetch();
    const report = await applyCharacterContentDiff(LIVE);

    const created = puts(fn).find((p) => p.url === '/api/gm/character/NewChar');
    expect(created.doc).toMatchObject({ id: 'NewChar', name: 'New', level: 1 });
    expect(report.added).toEqual(['NewChar']);
  });

  it('reports live-only characters and never writes them', async () => {
    const fn = installFetch();
    const report = await applyCharacterContentDiff(LIVE);

    expect(report.liveOnly).toEqual(['GMOnly']);
    expect(puts(fn).some((p) => p.url === '/api/gm/character/GMOnly')).toBe(false);
  });

  it('is idempotent: no write when only live fields differ from the bundle', async () => {
    const fn = installFetch();
    // Live Pellias whose authored fields already match the bundle; only the live
    // inventory/gold differ — there is nothing authored to apply.
    const live = [{
      id: 'Pellias',
      name: 'Pellias',
      level: 5,
      feats: [{ id: 'f1', name: 'Patched Feat' }],
      inventory: [{ ref: 'torch' }, { ref: 'sword', uid: 'u1' }],
      gold: 999,
    }];
    const report = await applyCharacterContentDiff(live);

    expect(puts(fn).some((p) => p.url === '/api/gm/character/Pellias')).toBe(false);
    expect(report.changed).toEqual([]);
  });

  it('exposes the live-field denylist (inventory + gold)', () => {
    expect(LIVE_CHARACTER_FIELDS).toEqual(['inventory', 'gold']);
  });
});
