// buildTargetSaveRequest (#270, extracted #1317 D3) — the confirm-time save
// request payload for target-save abilities. The UseAbilityModal.saveDamage
// suite stays the integration gate; these cover the builder directly.

import { buildTargetSaveRequest } from './saveRequest';

const character = { id: 'char-a', name: 'Brimstone' };
const order = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Brimstone' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { saves: { reflex: 8 } } },
];
const saveTargets = [order[1]];

const baseCtx = {
  rollProfile: { mode: 'target-save', defense: 'reflex', dc: 22 },
  saveTargets,
  damageProfile: null,
  saveDmgInput: '',
  saveRiderState: {},
  ability: { name: 'Shard Strike', basic: true },
  character,
  casterEntryId: 'e-caster',
  order,
  saveDc: 22,
  directCastRank: undefined,
};

describe('buildTargetSaveRequest', () => {
  it('returns null when the profile is not target-save', () => {
    expect(buildTargetSaveRequest({ ...baseCtx, rollProfile: { mode: 'actor-roll', dc: 22 } })).toBeNull();
  });

  it('returns null with no save targets', () => {
    expect(buildTargetSaveRequest({ ...baseCtx, saveTargets: [] })).toBeNull();
  });

  it('returns null when the DC is unknown', () => {
    expect(buildTargetSaveRequest({
      ...baseCtx,
      rollProfile: { mode: 'target-save', defense: 'reflex', dc: null },
    })).toBeNull();
  });

  describe('per-degree target conditions (#987)', () => {
    const ladder = {
      criticalSuccess: [{ id: 'steal-the-show-spotlight', note: '+1 vs caster' }],
      success: [{ id: 'off-guard', note: 'except the caster' }],
      failure: [{ id: 'off-guard' }, { id: 'stupefied', value: 2 }],
      criticalFailure: [{ id: 'off-guard' }, { id: 'stupefied', value: 4 }],
    };

    it('passes an ability-authored saveConditions ladder onto the request', () => {
      const req = buildTargetSaveRequest({
        ...baseCtx,
        ability: { name: 'Steal the Show', saveConditions: ladder },
      });
      expect(req.conditions).toEqual(ladder);
    });

    it('carries a criticalSuccess entry — the degree the damage-rider ladder cannot reach', () => {
      const req = buildTargetSaveRequest({
        ...baseCtx,
        ability: { name: 'Steal the Show', saveConditions: ladder },
      });
      expect(req.conditions.criticalSuccess).toEqual([
        { id: 'steal-the-show-spotlight', note: '+1 vs caster' },
      ]);
    });

    it('omits `conditions` entirely when the ability authors none', () => {
      expect(buildTargetSaveRequest(baseCtx)).not.toHaveProperty('conditions');
      expect(buildTargetSaveRequest({
        ...baseCtx,
        ability: { name: 'X', saveConditions: 'nope' },
      })).not.toHaveProperty('conditions');
    });
  });

  it('builds the base payload: caster identity, save, DC, mapped targets', () => {
    const req = buildTargetSaveRequest(baseCtx);
    expect(req).toMatchObject({
      casterId: 'char-a',
      casterName: 'Brimstone',
      abilityName: 'Shard Strike',
      save: 'reflex',
      dc: 22,
      basic: true,
      targets: [{ entryId: 'e-gob', name: 'Goblin', saveMod: 8 }],
    });
    expect(req.damage).toBeUndefined();
    expect(req.casterEffect).toBeUndefined();
    expect(req.fx).toBeUndefined(); // no catalog in ctx → no animation rider
  });

  it('rides the resolved fx recipe when the catalog matches (#1414 A4)', () => {
    const req = buildTargetSaveRequest({
      ...baseCtx,
      damageProfile: { typeLabel: 'fire' },
      fxAnimations: [{
        id: 'fx-spell-save-fire',
        priority: 100,
        when: { kind: 'spell', defenseKind: 'save', damageType: 'fire' },
        play: { shape: 'burst', file: 'jb2a.fireball.explosion.orange' },
      }],
    });
    expect(req.fx).toEqual({
      shape: 'burst',
      file: 'jb2a.fireball.explosion.orange',
      source: 'e-caster',
    });
  });

  it('missing target save mods serialize as null', () => {
    const bare = { entryId: 'e-orc', kind: 'enemy', name: 'Orc' };
    const req = buildTargetSaveRequest({ ...baseCtx, saveTargets: [bare] });
    expect(req.targets).toEqual([{ entryId: 'e-orc', name: 'Orc', saveMod: null }]);
  });

  it('uses the variant-adjusted saveDc, not the raw profile DC', () => {
    const req = buildTargetSaveRequest({ ...baseCtx, saveDc: 12 });
    expect(req.dc).toBe(12);
  });

  it('flags basic from a "basic Reflex" defense string when ability.basic is unset', () => {
    const req = buildTargetSaveRequest({
      ...baseCtx,
      ability: { name: 'Fireball', defense: 'basic Reflex' },
    });
    expect(req.basic).toBe(true);
    const plain = buildTargetSaveRequest({
      ...baseCtx,
      ability: { name: 'Fear', defense: 'Will' },
    });
    expect(plain.basic).toBe(false);
  });

  it('carries the cast rank through', () => {
    expect(buildTargetSaveRequest({ ...baseCtx, directCastRank: 3 }).rank).toBe(3);
  });

  it('attaches the entered total and serialized riders when a damage profile exists', () => {
    const req = buildTargetSaveRequest({
      ...baseCtx,
      damageProfile: {
        expression: '2d6',
        typeLabel: 'fire',
        riders: [{
          id: 'r1', label: 'Persistent bleed',
          persistent: { dice: '1d6', type: 'bleed' }, on: ['criticalFailure'],
        }],
      },
      saveDmgInput: '11',
    });
    expect(req.damage).toEqual({
      entered: 11,
      expression: '2d6',
      typeLabel: 'fire',
      riders: [{
        id: 'r1', label: 'Persistent bleed',
        persistent: { dice: '1d6', type: 'bleed' }, on: ['criticalFailure'],
      }],
    });
    // Crosses the WebSocket — must round-trip as plain JSON.
    expect(JSON.parse(JSON.stringify(req.damage))).toEqual(req.damage);
  });

  it('sends entered: null for rider-only profiles with no total typed', () => {
    const req = buildTargetSaveRequest({
      ...baseCtx,
      damageProfile: {
        riders: [{ id: 'r1', label: 'Persistent', persistent: { dice: '2d4', type: 'electricity' } }],
      },
      saveDmgInput: '',
    });
    expect(req.damage.entered).toBeNull();
  });

  it('omits damage when nothing was entered and no rider survives', () => {
    const req = buildTargetSaveRequest({
      ...baseCtx,
      damageProfile: { expression: '2d6', typeLabel: 'fire', riders: [] },
      saveDmgInput: '',
    });
    expect(req.damage).toBeUndefined();
  });

  it('unticked riders are omitted from the snapshot', () => {
    const req = buildTargetSaveRequest({
      ...baseCtx,
      damageProfile: {
        expression: '2d6',
        typeLabel: 'fire',
        riders: [{ id: 'r1', label: 'Persistent', persistent: { dice: '1d6', type: 'bleed' } }],
      },
      saveDmgInput: '11',
      saveRiderState: { r1: false },
    });
    expect(req.damage.riders).toEqual([]);
  });

  it('resolves saveOutcomeEffect ally targets into casterEffect (#274)', () => {
    const req = buildTargetSaveRequest({
      ...baseCtx,
      ability: {
        name: 'Shining Guidance', basic: true,
        saveOutcomeEffect: {
          effectId: 'shining-guidance', applyTo: 'all-allies',
          onDegrees: ['success', 'failure'],
          duration: { until: 'caster-turn-end' },
        },
      },
    });
    expect(req.casterEffect).toEqual({
      def: {
        effectId: 'shining-guidance',
        duration: { until: 'caster-turn-end' },
        onDegrees: ['success', 'failure'],
      },
      targets: [{ charId: 'char-a', entryId: 'e-caster' }],
      casterId: 'char-a',
      casterName: 'Brimstone',
      casterEntryId: 'e-caster',
    });
  });

  it('defaults saveOutcomeEffect applyTo to self and onDegrees to []', () => {
    const req = buildTargetSaveRequest({
      ...baseCtx,
      ability: {
        name: 'Shining Guidance', basic: true,
        saveOutcomeEffect: { effectId: 'limned' },
      },
    });
    expect(req.casterEffect.def).toEqual({ effectId: 'limned', duration: null, onDegrees: [] });
    expect(req.casterEffect.targets).toEqual([{ charId: 'char-a', entryId: 'e-caster' }]);
  });
});
