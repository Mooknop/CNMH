import {
  saveDocument,
  deleteDocument,
  seedDefaults,
  seedFromBackup,
  seedMissing,
  repointFocusSpellsToCatalog,
  syncChainConfig,
  fetchHistory,
  restoreVersion,
} from './gmApi';

const okJson = (body = { ok: true }) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

afterEach(() => jest.restoreAllMocks());

describe('gmApi', () => {
  it('saveDocument PUTs JSON to the encoded collection/id path', async () => {
    global.fetch = jest.fn(() => okJson({ ok: true, id: 'a b' }));
    const res = await saveDocument('quest', 'a b', { title: 'T' });
    expect(res).toEqual({ ok: true, id: 'a b' });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/quest/a%20b');
    expect(opts.method).toBe('PUT');
    expect(opts.credentials).toBe('include');
    expect(JSON.parse(opts.body)).toEqual({ title: 'T' });
  });

  it('deleteDocument issues a DELETE', async () => {
    global.fetch = jest.fn(() => okJson());
    await deleteDocument('quest', 'q1');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/quest/q1');
    expect(opts.method).toBe('DELETE');
  });

  it('seedDefaults POSTs the bundled seed payload', async () => {
    global.fetch = jest.fn(() => okJson({ ok: true, seeded: { quest: 'seeded 5' } }));
    const res = await seedDefaults(true);
    expect(res.seeded.quest).toBe('seeded 5');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/seed');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.force).toBe(true);
    expect(body.collections.quest.length).toBeGreaterThan(0);
  });

  it('seedFromBackup force-seeds the provided collections', async () => {
    global.fetch = jest.fn(() => okJson({ ok: true, seeded: { lore: 'seeded 3' } }));
    const res = await seedFromBackup({ lore: [{ id: 'l' }] });
    expect(res.seeded.lore).toBe('seeded 3');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/seed');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ force: true, collections: { lore: [{ id: 'l' }] } });
  });

  it('fetchHistory GETs the encoded history path', async () => {
    global.fetch = jest.fn(() => okJson({ history: [{ archived_at: 1, data: { id: 'q' } }] }));
    const res = await fetchHistory('quest', 'a b');
    expect(res.history).toHaveLength(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/history/quest/a%20b');
    expect(opts.credentials).toBe('include');
    expect(opts.method).toBeUndefined();
  });

  it('restoreVersion POSTs the archived_at to the restore path', async () => {
    global.fetch = jest.fn(() => okJson({ ok: true, id: 'q1' }));
    await restoreVersion('lore', 'q1', 1717000000000);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/restore/lore/q1');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ archived_at: 1717000000000 });
  });

  it('throws with status text on a non-ok response', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve('Forbidden') })
    );
    await expect(saveDocument('quest', 'x', {})).rejects.toThrow('403 Forbidden');
  });

  it('seedMissing POSTs mode:fill-missing with bundled collections', async () => {
    global.fetch = jest.fn(() => okJson({ ok: true, seeded: { spell: 'added 8 (skipped 10 existing)' } }));
    const res = await seedMissing();
    expect(res.seeded.spell).toMatch(/added/);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/gm/seed');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.mode).toBe('fill-missing');
    expect(body.force).toBeUndefined();
    expect(Array.isArray(body.collections.spell)).toBe(true);
    expect(body.collections.spell.length).toBeGreaterThan(0);
  });

  it('repointFocusSpellsToCatalog calls saveDocument for characters that need patching', async () => {
    global.fetch = jest.fn(() => okJson({ ok: true, id: 'Pellias' }));
    const liveChars = [
      // Pellias has old inline devotion_spells — needs patching
      { id: 'Pellias', champion: { devotion_spells: [{ id: 's1', name: 'Serrate', level: 1 }] } },
      // A character not in the bundled defaults — ignored
      { id: 'NonBundled', focus_spells: [] },
    ];
    const res = await repointFocusSpellsToCatalog(liveChars);
    expect(res.repointed).toContain('Pellias');
    // saveDocument is called at least once (for Pellias)
    const putCalls = global.fetch.mock.calls.filter(([url, opts]) =>
      url.includes('/api/gm/character/') && opts.method === 'PUT'
    );
    expect(putCalls.length).toBeGreaterThan(0);
    // The patched doc should have spellRef entries
    const patchedBody = JSON.parse(putCalls[0][1].body);
    expect(patchedBody.champion.devotion_spells[0]).toHaveProperty('spellRef');
  });

  it('repointFocusSpellsToCatalog is a no-op for already-patched characters', async () => {
    global.fetch = jest.fn();
    const liveChars = [
      // Pellias with spellRef entries already — no change needed
      { id: 'Pellias', champion: { devotion_spells: [{ spellRef: 'serrate' }, { spellRef: 'shields-of-the-spirit' }] } },
    ];
    const res = await repointFocusSpellsToCatalog(liveChars);
    expect(res.repointed).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// Chain config lives in the DO and is propagated by syncChainConfig. These
// tests pass explicit bundled fixtures so they don't depend on snapshot content.
const BUNDLED_CHAIN_FIXTURES = {
  spell: [
    {
      id: 'inner-upheaval',
      name: 'Inner Upheaval',
      level: 1,
      chain: { into: 'strike', cost: 'included', modes: ['strike', 'flurry'], strikeTrait: 'Unarmed', attackBonus: 1, damageBonus: '1d6' },
    },
  ],
  character: [
    {
      id: 'JadeInferno',
      feats: [
        { id: 'feat-5', actions: [{ name: 'Reach Spell', actionCount: 1, chain: { into: 'spell', cost: 'added' } }] },
        { id: 'feat-8', actions: [{ name: 'Harrow Casting', actionCount: 1, chain: { into: 'spell', cost: 'included' } }] },
      ],
      actions: [],
    },
    {
      id: 'Blu-Kakke',
      feats: [],
      actions: [{ name: 'Flurry of Blows', actionCount: 1, chain: { into: 'strike', cost: 'included', modes: ['flurry'] } }],
    },
  ],
};

describe('syncChainConfig', () => {
  it('patches a stale spell chain', async () => {
    global.fetch = jest.fn(() => okJson({ ok: true, id: 'inner-upheaval' }));
    const liveSpells = [
      { id: 'inner-upheaval', name: 'Inner Upheaval', level: 1 }, // no chain yet
    ];
    const res = await syncChainConfig(liveSpells, [], BUNDLED_CHAIN_FIXTURES);
    expect(res.patched).toContain('spell:inner-upheaval');
    const putCalls = global.fetch.mock.calls.filter(
      ([url, opts]) => url.includes('/api/gm/spell/') && opts.method === 'PUT'
    );
    expect(putCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(putCalls[0][1].body);
    expect(body.chain).toMatchObject({ into: 'strike', cost: 'included' });
  });

  it('patches a stale character feat action chain', async () => {
    global.fetch = jest.fn(() => okJson({ ok: true, id: 'JadeInferno' }));
    const liveChars = [
      {
        id: 'JadeInferno',
        feats: [
          { id: 'feat-5', actions: [{ name: 'Reach Spell', actionCount: 1 }] },
          { id: 'feat-8', actions: [{ name: 'Harrow Casting', actionCount: 1 }] },
        ],
      },
    ];
    const res = await syncChainConfig([], liveChars, BUNDLED_CHAIN_FIXTURES);
    expect(res.patched).toContain('character:JadeInferno');
    const putCalls = global.fetch.mock.calls.filter(
      ([url, opts]) => url.includes('/api/gm/character/') && opts.method === 'PUT'
    );
    expect(putCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(putCalls[0][1].body);
    const reachSpell = body.feats.find((f) => f.id === 'feat-5')?.actions?.[0];
    expect(reachSpell?.chain).toMatchObject({ into: 'spell', cost: 'added' });
  });

  it('patches a stale top-level character action chain (Flurry of Blows)', async () => {
    global.fetch = jest.fn(() => okJson({ ok: true, id: 'Blu-Kakke' }));
    const liveChars = [
      {
        id: 'Blu-Kakke',
        feats: [],
        actions: [{ name: 'Flurry of Blows', actionCount: 1 }], // no chain yet
      },
    ];
    const res = await syncChainConfig([], liveChars, BUNDLED_CHAIN_FIXTURES);
    expect(res.patched).toContain('character:Blu-Kakke');
    const putCalls = global.fetch.mock.calls.filter(
      ([url, opts]) => url.includes('/api/gm/character/') && opts.method === 'PUT'
    );
    expect(putCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(putCalls[0][1].body);
    const flurry = body.actions?.find((a) => a.name === 'Flurry of Blows');
    expect(flurry?.chain).toMatchObject({ into: 'strike', cost: 'included', modes: ['flurry'] });
  });

  it('is a no-op when chain config is already current', async () => {
    global.fetch = jest.fn();
    const bundledChain = { into: 'strike', cost: 'included', modes: ['strike', 'flurry'], strikeTrait: 'Unarmed', attackBonus: 1, damageBonus: '1d6' };
    const liveSpells = [{ id: 'inner-upheaval', name: 'Inner Upheaval', chain: bundledChain }];
    const res = await syncChainConfig(liveSpells, [], BUNDLED_CHAIN_FIXTURES);
    expect(res.patched).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
