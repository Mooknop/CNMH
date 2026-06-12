import { WARD_EFFECT_IDS, isWardEffectId, isWardEntry, characterHasShieldWard } from './ward';

describe('isWardEffectId / isWardEntry', () => {
  it('matches both ward catalog ids and nothing else', () => {
    for (const id of WARD_EFFECT_IDS) expect(isWardEffectId(id)).toBe(true);
    expect(isWardEffectId('heroism-1')).toBe(false);
    expect(isWardEffectId(undefined)).toBe(false);
  });

  it('entry must match both effectId and the warder', () => {
    const entry = { effectId: 'devoted-guardian-tower', appliedBy: 'Pellias' };
    expect(isWardEntry(entry, 'Pellias')).toBe(true);
    expect(isWardEntry(entry, 'Ashka')).toBe(false);
    expect(isWardEntry({ effectId: 'heroism-1', appliedBy: 'Pellias' }, 'Pellias')).toBe(false);
    expect(isWardEntry(null, 'Pellias')).toBe(false);
  });
});

describe('characterHasShieldWard', () => {
  const dgAction = {
    name: 'Devoted Guardian',
    effects: [{ effectId: 'devoted-guardian-tower', applyTo: 'ally' }],
  };

  it('detects a ward-applying feat action (Pellias shape)', () => {
    expect(characterHasShieldWard({ feats: [{ name: 'Devoted Guardian', actions: [dgAction] }] })).toBe(true);
  });

  it('detects a ward-applying top-level action', () => {
    expect(characterHasShieldWard({ actions: [dgAction] })).toBe(true);
  });

  it('rejects characters without ward effects', () => {
    expect(characterHasShieldWard({
      feats: [{ actions: [{ name: 'Shard Strike', effects: [{ effectId: 'heroism-1' }] }] }],
    })).toBe(false);
    expect(characterHasShieldWard({})).toBe(false);
    expect(characterHasShieldWard(null)).toBe(false);
  });
});
