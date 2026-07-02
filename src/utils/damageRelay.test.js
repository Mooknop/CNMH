import { collectDamageHits, buildDamageApply, DMGAPPLY_KEY, DMGDONE_KEY } from './damageRelay';

const ray = (results, rayIndex = null) => ({ rayIndex, results });
const hit = (entryId, name, final) => ({ entryId, name, degree: 'success', damage: { final } });

describe('collectDamageHits (#1016)', () => {
  it('collects typed hits from ray groups, one per result', () => {
    const groups = [
      ray([hit('e-1', 'Goblin', 8), hit('e-2', 'Troll', 12)]),
    ];
    expect(collectDamageHits(groups, null, { typeLabel: 'fire' })).toEqual([
      { entryId: 'e-1', name: 'Goblin', amount: 8, type: 'fire' },
      { entryId: 'e-2', name: 'Troll', amount: 12, type: 'fire' },
    ]);
  });

  it('keeps multi-ray hits on the same target separate (IWR applies per instance)', () => {
    const groups = [
      ray([hit('e-1', 'Goblin', 5)], 0),
      ray([hit('e-1', 'Goblin', 7)], 1),
    ];
    const hits = collectDamageHits(groups, null, { typeLabel: 'fire' });
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.amount)).toEqual([5, 7]);
  });

  it('skips results with no damage, zero/null finals, or missing entryIds', () => {
    const groups = [
      ray([
        { entryId: 'e-1', name: 'Goblin', degree: 'failure', damage: null },
        { entryId: 'e-2', name: 'Troll', degree: 'success', damage: { final: 0 } },
        { name: 'Nameless', degree: 'success', damage: { final: 9 } },
        hit('e-3', 'Ogre', 4),
      ]),
    ];
    expect(collectDamageHits(groups, null, { typeLabel: 'cold' })).toEqual([
      { entryId: 'e-3', name: 'Ogre', amount: 4, type: 'cold' },
    ]);
  });

  it('filters to allowedEntryIds when a set is given', () => {
    const groups = [ray([hit('e-pc', 'Ashka', 8), hit('e-gob', 'Goblin', 8)])];
    const hits = collectDamageHits(groups, null, {
      typeLabel: 'fire',
      allowedEntryIds: new Set(['e-gob']),
    });
    expect(hits).toEqual([{ entryId: 'e-gob', name: 'Goblin', amount: 8, type: 'fire' }]);
  });

  it('untyped profiles relay with an empty type', () => {
    const hits = collectDamageHits([ray([hit('e-1', 'Goblin', 6)])], null, {});
    expect(hits).toEqual([{ entryId: 'e-1', name: 'Goblin', amount: 6, type: '' }]);
  });

  it('merges flurry rolls into ONE hit per target (combined before IWR)', () => {
    const chain = {
      mode: 'flurry',
      rolls: [
        [hit('e-1', 'Goblin', 6), hit('e-2', 'Troll', 5)],
        [hit('e-1', 'Goblin', 4)],
      ],
    };
    const hits = collectDamageHits([], chain, {});
    expect(hits).toEqual([
      { entryId: 'e-1', name: 'Goblin', amount: 10, type: '' },
      { entryId: 'e-2', name: 'Troll', amount: 5, type: '' },
    ]);
  });

  it('keeps non-flurry chain rolls separate and untyped', () => {
    const chain = {
      mode: 'single',
      rolls: [[hit('e-1', 'Goblin', 6)], [hit('e-1', 'Goblin', 4)]],
    };
    const hits = collectDamageHits([], chain, { typeLabel: 'fire' });
    // chain strikes carry no type today — relayed untyped regardless of profile
    expect(hits).toEqual([
      { entryId: 'e-1', name: 'Goblin', amount: 6, type: '' },
      { entryId: 'e-1', name: 'Goblin', amount: 4, type: '' },
    ]);
  });

  it('is resilient to null/empty inputs', () => {
    expect(collectDamageHits(null, null)).toEqual([]);
    expect(collectDamageHits([], { mode: 'flurry', rolls: [null] })).toEqual([]);
    expect(collectDamageHits([{ results: null }], null)).toEqual([]);
  });

  describe('multi-instance hits (#1019)', () => {
    const instHit = (entryId, name, instances) => ({
      entryId, name, degree: 'success',
      damage: { final: instances.reduce((s, i) => s + i.amount, 0), instances },
    });

    it('carries typed instances onto ray-group hits, dropping non-positive ones', () => {
      const groups = [ray([instHit('e-1', 'Goblin', [
        { amount: 13, type: 'piercing' },
        { amount: 4, type: 'fire' },
        { amount: 0, type: 'cold' },
      ])])];
      expect(collectDamageHits(groups, null, { typeLabel: 'piercing' })).toEqual([{
        entryId: 'e-1', name: 'Goblin', amount: 17, type: 'piercing',
        instances: [
          { amount: 13, type: 'piercing' },
          { amount: 4, type: 'fire' },
        ],
      }]);
    });

    it('single-total results stay instance-less (bridge takes the #1016 path)', () => {
      const hits = collectDamageHits([ray([hit('e-1', 'Goblin', 8)])], null, { typeLabel: 'fire' });
      expect(hits[0].instances).toBeUndefined();
    });

    it('flurry merges instances per type into the combined hit', () => {
      const chain = {
        mode: 'flurry',
        rolls: [
          [instHit('e-1', 'Goblin', [{ amount: 6, type: 'bludgeoning' }, { amount: 3, type: 'fire' }])],
          [instHit('e-1', 'Goblin', [{ amount: 4, type: 'bludgeoning' }, { amount: 2, type: 'fire' }])],
        ],
      };
      expect(collectDamageHits([], chain, {})).toEqual([{
        entryId: 'e-1', name: 'Goblin', amount: 15, type: '',
        instances: [
          { amount: 10, type: 'bludgeoning' },
          { amount: 5, type: 'fire' },
        ],
      }]);
    });

    it('a flurry mixing typed and instance-less rolls folds the latter into an untyped instance', () => {
      const chain = {
        mode: 'flurry',
        rolls: [
          [instHit('e-1', 'Goblin', [{ amount: 6, type: 'bludgeoning' }])],
          [hit('e-1', 'Goblin', 4)],
        ],
      };
      expect(collectDamageHits([], chain, {})).toEqual([{
        entryId: 'e-1', name: 'Goblin', amount: 10, type: '',
        instances: [
          { amount: 6, type: 'bludgeoning' },
          { amount: 4, type: '' },
        ],
      }]);
    });

    it('an all-untyped flurry stays instance-less (#1016 behavior unchanged)', () => {
      const chain = { mode: 'flurry', rolls: [[hit('e-1', 'Goblin', 6)], [hit('e-1', 'Goblin', 4)]] };
      expect(collectDamageHits([], chain, {})).toEqual([
        { entryId: 'e-1', name: 'Goblin', amount: 10, type: '' },
      ]);
    });

    it('non-flurry chain rolls keep their typed instances per hit', () => {
      const chain = {
        mode: 'single',
        rolls: [[instHit('e-1', 'Goblin', [{ amount: 6, type: 'slashing' }, { amount: 3, type: 'fire' }])]],
      };
      expect(collectDamageHits([], chain, {})).toEqual([{
        entryId: 'e-1', name: 'Goblin', amount: 9, type: '',
        instances: [
          { amount: 6, type: 'slashing' },
          { amount: 3, type: 'fire' },
        ],
      }]);
    });
  });
});

describe('buildDamageApply', () => {
  it('stamps a unique id, sourceName, and ts around the hits', () => {
    const hits = [{ entryId: 'e-1', name: 'Goblin', amount: 8, type: 'fire' }];
    const a = buildDamageApply({ hits, sourceName: 'Fireball' });
    const b = buildDamageApply({ hits, sourceName: 'Fireball' });
    expect(a.hits).toBe(hits);
    expect(a.sourceName).toBe('Fireball');
    expect(typeof a.ts).toBe('number');
    expect(a.id).toMatch(/^dmg-/);
    expect(a.id).not.toBe(b.id);
  });

  it('defaults missing fields safely', () => {
    const p = buildDamageApply({});
    expect(p.hits).toEqual([]);
    expect(p.sourceName).toBe('');
  });
});

describe('relay keys', () => {
  it('follow the cnmh_<type>_<id> single-token contract', () => {
    expect(DMGAPPLY_KEY).toBe('cnmh_dmgapply_global');
    expect(DMGDONE_KEY).toBe('cnmh_dmgdone_global');
  });
});
