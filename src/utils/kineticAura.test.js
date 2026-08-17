import {
  activatesAura,
  requiresAura,
  isOverflow,
  characterHasKineticAura,
  auraProfile,
} from './kineticAura';

const channelElements = {
  name: 'Channel Elements',
  traits: ['Aura', 'Kineticist', 'Metal', 'Primal'],
};

const metalBlast = {
  name: 'Melee Metal Blast',
  traits: ['Attack', 'Impulse', 'Kineticist', 'Metal', 'Primal'],
};

const shardStrike = {
  name: 'Shard Strike',
  traits: ['Impulse', 'Kineticist', 'Metal', 'Primal'],
};

describe('activatesAura', () => {
  it('matches Aura + Kineticist traits (Channel Elements)', () => {
    expect(activatesAura(channelElements)).toBe(true);
  });

  it('rejects Aura without Kineticist (champion auras cannot false-positive)', () => {
    expect(activatesAura({ traits: ['Aura', 'Champion'] })).toBe(false);
  });

  it('rejects impulses and untagged abilities', () => {
    expect(activatesAura(metalBlast)).toBe(false);
    expect(activatesAura({ name: 'Strike' })).toBe(false);
    expect(activatesAura(null)).toBe(false);
  });

  it('explicit boolean overrides the trait heuristic both ways', () => {
    expect(activatesAura({ activatesAura: true })).toBe(true);
    expect(activatesAura({ ...channelElements, activatesAura: false })).toBe(false);
  });

  it('is case-insensitive on traits', () => {
    expect(activatesAura({ traits: ['aura', 'KINETICIST'] })).toBe(true);
  });
});

describe('requiresAura', () => {
  it('matches the Impulse trait (blasts, Shard Strike)', () => {
    expect(requiresAura(metalBlast)).toBe(true);
    expect(requiresAura(shardStrike)).toBe(true);
  });

  it('Channel Elements is never self-gated', () => {
    expect(requiresAura(channelElements)).toBe(false);
  });

  it('explicit boolean overrides the trait heuristic both ways', () => {
    expect(requiresAura({ requiresAura: true })).toBe(true);
    expect(requiresAura({ ...metalBlast, requiresAura: false })).toBe(false);
  });

  it('rejects untagged abilities and null', () => {
    expect(requiresAura({ name: 'Strike', traits: ['Attack'] })).toBe(false);
    expect(requiresAura(null)).toBe(false);
  });
});

describe('isOverflow', () => {
  it('matches the Overflow trait and the explicit tag', () => {
    expect(isOverflow({ traits: ['Impulse', 'Overflow'] })).toBe(true);
    expect(isOverflow({ overflow: true })).toBe(true);
  });

  it('rejects plain impulses', () => {
    expect(isOverflow(metalBlast)).toBe(false);
    expect(isOverflow(null)).toBe(false);
  });
});

describe('characterHasKineticAura', () => {
  it('detects a kineticist via feat actions (Pellias shape)', () => {
    const pellias = {
      feats: [
        { name: 'Kineticist Dedication', actions: [channelElements], strikes: [metalBlast] },
        { name: 'Devoted Guardian', actions: [{ name: 'Devoted Guardian', traits: ['Champion'] }] },
      ],
    };
    expect(characterHasKineticAura(pellias)).toBe(true);
  });

  it('detects via feat strikes when the activator is strike-shaped', () => {
    const char = { feats: [{ strikes: [{ traits: ['Aura', 'Kineticist'] }] }] };
    expect(characterHasKineticAura(char)).toBe(true);
  });

  it('rejects a champion-only character and empty shapes', () => {
    const champion = {
      feats: [{ name: 'Shield Block', actions: [{ traits: ['Champion'] }] }],
    };
    expect(characterHasKineticAura(champion)).toBe(false);
    expect(characterHasKineticAura({})).toBe(false);
    expect(characterHasKineticAura(null)).toBe(false);
  });
});

describe('auraProfile', () => {
  it('resolves the authored radius via areaShape (#1733 ruling 2 — Channel Elements)', () => {
    const pellias = {
      feats: [{
        name: 'Kineticist Dedication',
        actions: [{ ...channelElements, areaShape: { shape: 'emanation', feet: 10 } }],
        strikes: [metalBlast],
      }],
    };
    expect(auraProfile(pellias)).toEqual({ feet: 10, label: 'Channel Elements' });
  });

  it('finds the activator via feat strikes when it is strike-shaped', () => {
    const char = {
      feats: [{
        strikes: [{ name: 'Aura Strike', traits: ['Aura', 'Kineticist'], areaShape: { shape: 'emanation', feet: 15 } }],
      }],
    };
    expect(auraProfile(char)).toEqual({ feet: 15, label: 'Aura Strike' });
  });

  it('finds the activator among top-level actions', () => {
    const char = { actions: [{ ...channelElements, areaShape: { shape: 'emanation', feet: 5 } }] };
    expect(auraProfile(char)).toEqual({ feet: 5, label: 'Channel Elements' });
  });

  it('returns null with no authored size — no fallback radius', () => {
    const pellias = {
      feats: [{ name: 'Kineticist Dedication', actions: [channelElements], strikes: [metalBlast] }],
    };
    expect(auraProfile(pellias)).toBeNull();
  });

  it('returns null when the areaShape is a non-emanation shape', () => {
    const char = {
      actions: [{ ...channelElements, areaShape: { shape: 'burst', feet: 10 } }],
    };
    expect(auraProfile(char)).toBeNull();
  });

  it('returns null when the character has no aura-activating ability', () => {
    expect(auraProfile({ feats: [{ actions: [metalBlast] }] })).toBeNull();
    expect(auraProfile({})).toBeNull();
    expect(auraProfile(null)).toBeNull();
  });
});
