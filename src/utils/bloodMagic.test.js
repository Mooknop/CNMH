import {
  BLOOD_MAGIC_OPTIONS,
  bloodMagicOption,
  hasBloodMagic,
  isBloodlineSpell,
  bloodMagicTriggered,
} from './bloodMagic';

const jade = {
  id: 'JadeInferno',
  spellcasting: {
    bloodline: {
      name: 'Imperial',
      blood_magic: 'Until the start of your next turn, you gain +1 to either your AC or to Saving Throws.',
    },
  },
};
const champion = { id: 'Pellias', spellcasting: { tradition: 'divine' } };

const forceBarrage = { name: 'Force Barrage', bloodline: true };
const light        = { name: 'Light' };

describe('bloodMagic predicates', () => {
  it('hasBloodMagic requires a bloodline with blood_magic text', () => {
    expect(hasBloodMagic(jade)).toBe(true);
    expect(hasBloodMagic(champion)).toBe(false);
    expect(hasBloodMagic({ spellcasting: { bloodline: { name: 'Imperial' } } })).toBe(false);
    expect(hasBloodMagic(null)).toBe(false);
  });

  it('isBloodlineSpell only fires on an explicit true flag', () => {
    expect(isBloodlineSpell(forceBarrage)).toBe(true);
    expect(isBloodlineSpell(light)).toBe(false);
    expect(isBloodlineSpell({ bloodline: 'Imperial' })).toBe(false);
    expect(isBloodlineSpell(null)).toBe(false);
  });

  it('triggers on a direct bloodline cast', () => {
    expect(bloodMagicTriggered(jade, forceBarrage)).toBe(true);
    expect(bloodMagicTriggered(jade, light)).toBe(false);
  });

  it('triggers when the chained spell is bloodline-flagged', () => {
    expect(bloodMagicTriggered(jade, null, forceBarrage)).toBe(true);
    expect(bloodMagicTriggered(jade, null, light)).toBe(false);
    expect(bloodMagicTriggered(jade, null, null)).toBe(false);
  });

  it('never triggers for a caster without blood magic', () => {
    expect(bloodMagicTriggered(champion, forceBarrage)).toBe(false);
    expect(bloodMagicTriggered(champion, null, forceBarrage)).toBe(false);
  });
});

describe('bloodMagicOption', () => {
  it('resolves each option by id', () => {
    expect(bloodMagicOption('ac').effectId).toBe('imperial-blood-magic-ac');
    expect(bloodMagicOption('saves').effectId).toBe('imperial-blood-magic-saves');
  });

  it('falls back to the first option for unknown ids', () => {
    expect(bloodMagicOption('nonsense')).toBe(BLOOD_MAGIC_OPTIONS[0]);
    expect(bloodMagicOption(undefined)).toBe(BLOOD_MAGIC_OPTIONS[0]);
  });
});
