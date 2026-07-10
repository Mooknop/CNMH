import { applyWhetstoneOnHit, applyWhetstoneReactionAndCrit } from './whetstoneOnHit';
import { RELAY } from '../sync/keys';

const character = { id: 'char-p', name: 'Pellias', maxHp: 40 };

const ray = (results) => [{ rayIndex: null, results }];
const hit = (entryId, degree = 'success', final = null) => ({
  entryId,
  name: entryId,
  degree,
  ...(final != null ? { damage: { final } } : {}),
});

const baseArgs = (overrides = {}) => ({
  character,
  rayGroups: [],
  chainResults: null,
  order: [],
  getState: vi.fn(() => null),
  sendUpdate: vi.fn(),
  appendLog: vi.fn(),
  applyEnemyCondition: vi.fn(),
  recordFor: vi.fn(() => null),
  mergeRecord: vi.fn(),
  ...overrides,
});

beforeEach(() => window.localStorage.clear());

describe('applyWhetstoneOnHit (#1215)', () => {
  it('no-ops without a whetstoneOnHit rider or without successful results', () => {
    const noRider = baseArgs({ ability: { name: 'Strike' }, rayGroups: ray([hit('e-1')]) });
    applyWhetstoneOnHit(noRider);
    expect(noRider.appendLog).not.toHaveBeenCalled();

    const noHits = baseArgs({
      ability: { name: 'Strike', whetstoneOnHit: { itemName: 'Limning Gem', note: 'glows' } },
      rayGroups: ray([hit('e-1', 'failure')]),
    });
    applyWhetstoneOnHit(noHits);
    expect(noHits.appendLog).not.toHaveBeenCalled();
  });

  it('healHalf (Leeching Fangs) heals half the total damage dealt', () => {
    const args = baseArgs({
      ability: { name: 'Strike', whetstoneOnHit: { itemName: 'Leeching Fangs', healHalf: true } },
      rayGroups: ray([hit('e-1', 'success', 9), hit('e-2', 'criticalSuccess', 6)]),
      getState: vi.fn(() => ({ current: 10, max: 40, temp: 0, dying: 0, wounded: 0, doomed: 0 })),
    });
    applyWhetstoneOnHit(args);
    // dealt 15 → heal 7
    expect(args.sendUpdate).toHaveBeenCalledWith(
      'char-p',
      RELAY.HP,
      expect.objectContaining({ current: 17 })
    );
    expect(args.appendLog.mock.calls[0][0].text)
      .toContain('Leeching Fangs: Pellias heals 7 HP (half of 15 dealt');
  });

  it('revealIwr (Analysis Eye) merges the reveal and announces a fresh one', () => {
    const enemy = {
      entryId: 'e-1',
      kind: 'enemy',
      name: 'Troll',
      creatureKey: 'troll',
      defenses: { weaknesses: [{ type: 'fire', value: 10 }] },
    };
    const args = baseArgs({
      ability: { name: 'Strike', whetstoneOnHit: { itemName: 'Analysis Eye', revealIwr: true } },
      rayGroups: ray([hit('e-1')]),
      order: [enemy],
    });
    applyWhetstoneOnHit(args);
    expect(args.mergeRecord).toHaveBeenCalledWith('troll', expect.any(Function));
    expect(args.appendLog).toHaveBeenCalledWith({
      type: 'system',
      text: "Analysis Eye: Troll's weakness to fire is revealed!",
    });
  });

  it('revealIwr logs "nothing to learn" when the creature has no weakness or resistance', () => {
    const enemy = { entryId: 'e-1', kind: 'enemy', name: 'Blob', creatureKey: 'blob', defenses: {} };
    const args = baseArgs({
      ability: { name: 'Strike', whetstoneOnHit: { itemName: 'Analysis Eye', revealIwr: true } },
      rayGroups: ray([hit('e-1')]),
      order: [enemy],
    });
    applyWhetstoneOnHit(args);
    expect(args.mergeRecord).not.toHaveBeenCalled();
    expect(args.appendLog).toHaveBeenCalledWith({
      type: 'system',
      text: 'Analysis Eye: Blob has no weakness or resistance to learn.',
    });
  });

  it('condition (Limning Gem) applies to struck enemies only, plus the note', () => {
    const args = baseArgs({
      ability: {
        name: 'Strike',
        whetstoneOnHit: { itemName: 'Limning Gem', condition: 'dazzled', note: 'lit up' },
      },
      rayGroups: ray([hit('e-1'), hit('pc-1')]),
      order: [
        { entryId: 'e-1', kind: 'enemy', name: 'Troll' },
        { entryId: 'pc-1', kind: 'pc', name: 'Jade' },
      ],
      chainResults: { rolls: [[hit('e-2')]] },
    });
    // e-2 is a chained-strike hit but not in order — skipped as non-enemy.
    applyWhetstoneOnHit(args);
    expect(args.applyEnemyCondition).toHaveBeenCalledTimes(1);
    expect(args.applyEnemyCondition).toHaveBeenCalledWith('e-1', { id: 'dazzled', source: 'Limning Gem' });
    expect(args.appendLog).toHaveBeenCalledWith({ type: 'system', text: 'Limning Gem: Troll is dazzled' });
    expect(args.appendLog).toHaveBeenCalledWith({
      type: 'action',
      charId: 'char-p',
      text: 'Limning Gem: lit up',
    });
  });
});

describe('applyWhetstoneReactionAndCrit (#1216)', () => {
  const enemy = {
    entryId: 'e-1',
    kind: 'enemy',
    name: 'Troll',
    defenses: { saves: { reflex: 8, will: 5 } },
  };

  it('Reactive Flash pushes the save with a resolve-first note, only on reaction Strikes', () => {
    const ability = {
      name: 'Strike',
      whetstoneReactionSave: { itemName: 'Reactive Flash', save: 'reflex', dc: 21 },
    };
    const notReaction = baseArgs({
      ability, castCost: 1, rayGroups: ray([hit('e-1')]), order: [enemy], addSaveRequest: vi.fn(),
    });
    applyWhetstoneReactionAndCrit(notReaction);
    expect(notReaction.addSaveRequest).not.toHaveBeenCalled();

    const args = baseArgs({
      ability, castCost: 'reaction', rayGroups: ray([hit('e-1')]), order: [enemy], addSaveRequest: vi.fn(),
    });
    applyWhetstoneReactionAndCrit(args);
    expect(args.addSaveRequest).toHaveBeenCalledWith(expect.objectContaining({
      abilityName: 'Reactive Flash',
      save: 'reflex',
      dc: 21,
      basic: false,
      targets: [{ entryId: 'e-1', name: 'Troll', saveMod: 8 }],
    }));
    expect(args.appendLog.mock.calls[0][0].text).toContain('BEFORE applying this reaction Strike');
  });

  it('crit save fires only off criticalSuccess results, with per-degree conditions', () => {
    const ability = {
      name: 'Strike',
      whetstoneOnCrit: {
        itemName: 'Chroma Kaleidoscope',
        save: 'will',
        dc: 19,
        conditions: { failure: ['dazzled'] },
      },
    };
    const noCrit = baseArgs({
      ability, castCost: 1, rayGroups: ray([hit('e-1', 'success')]), order: [enemy], addSaveRequest: vi.fn(),
    });
    applyWhetstoneReactionAndCrit(noCrit);
    expect(noCrit.addSaveRequest).not.toHaveBeenCalled();

    const args = baseArgs({
      ability,
      castCost: 1,
      rayGroups: ray([hit('e-1', 'criticalSuccess')]),
      order: [enemy],
      addSaveRequest: vi.fn(),
    });
    applyWhetstoneReactionAndCrit(args);
    expect(args.addSaveRequest).toHaveBeenCalledWith(expect.objectContaining({
      abilityName: 'Chroma Kaleidoscope',
      save: 'will',
      dc: 19,
      targets: [{ entryId: 'e-1', name: 'Troll', saveMod: 5 }],
      conditions: { failure: ['dazzled'] },
    }));
  });
});
