import {
  championAuraProfile,
  characterHasChampionAura,
  classAuraProfile,
  characterCastsSpell,
  effectAuraProfile,
  resolveAuraSource,
  auraNarrowedEntryIds,
  requiresAllyInAura,
  filterAllyAuraReactions,
} from './auraSources';

const championFeat = {
  name: "Champion's Aura",
  championAura: true,
  areaShape: { shape: 'emanation', feet: 15 },
};

const channelElements = {
  name: 'Channel Elements',
  traits: ['Aura', 'Kineticist'],
  areaShape: { shape: 'emanation', feet: 10 },
};

const champion   = { id: 'Pellias', feats: [championFeat] };
const kineticist = { id: 'Pellias', feats: [{ name: 'Dedication', actions: [channelElements] }] };
const both       = { id: 'Pellias', feats: [championFeat, { name: 'Dedication', actions: [channelElements] }] };

const bard = {
  id: 'IzzyUncut',
  focus_spells: [{ spellRef: 'inspire-courage' }, { spellRef: 'hymn-of-healing' }],
};
const fighter = { id: 'Blu-Kakke' };

const anthem = { id: 'inspire-courage', name: 'Inspire Courage', area: '60-foot emanation' };
const spells = [anthem, { id: 'bless', area: '15-foot emanation' }];

describe('championAuraProfile', () => {
  it('reads the authored emanation off a feats[] entry', () => {
    expect(championAuraProfile(champion)).toEqual({ feet: 15, label: "Champion's Aura" });
    expect(characterHasChampionAura(champion)).toBe(true);
  });

  it('finds one authored as an action on a feat', () => {
    const c = { feats: [{ name: 'Class Features', actions: [championFeat] }] };
    expect(championAuraProfile(c)?.feet).toBe(15);
  });

  it('is null for a character with none', () => {
    expect(championAuraProfile(kineticist)).toBeNull();
    expect(characterHasChampionAura(kineticist)).toBe(false);
  });

  it('refuses to guess a radius when the content authored none (#1733 ruling 2)', () => {
    const unsized = { feats: [{ name: "Champion's Aura", championAura: true }] };
    expect(championAuraProfile(unsized)).toBeNull();
    // The character still HAS the aura — only its size is unknown, which is
    // what gates the Activate affordance vs. what gates the mirror.
    expect(characterHasChampionAura(unsized)).toBe(true);
  });
});

describe('classAuraProfile priority', () => {
  it('prefers the champion aura when a character has both (they are one aura)', () => {
    expect(classAuraProfile(both)).toEqual({ feet: 15, label: "Champion's Aura", kind: 'champion' });
  });

  it('falls back to the kineticist aura', () => {
    expect(classAuraProfile(kineticist)).toEqual({
      feet: 10, label: 'Channel Elements', kind: 'kinetic',
    });
  });

  it('is null for a character with neither', () => {
    expect(classAuraProfile(bard)).toBeNull();
  });
});

describe('effect auras', () => {
  it('recognises the caster by their spell list when the effect came from Foundry', () => {
    const effects = [{ effectId: 'inspire-courage', fromFoundry: true }];
    expect(effectAuraProfile(bard, effects, spells)).toEqual({
      feet: 60, label: 'Courageous Anthem',
    });
  });

  it('does not turn a buffed ALLY into a second 60-foot aura source', () => {
    const effects = [{ effectId: 'inspire-courage', fromFoundry: true }];
    expect(effectAuraProfile(fighter, effects, spells)).toBeNull();
  });

  it('uses appliedBy when the app applied the effect itself', () => {
    const onCaster = [{ effectId: 'inspire-courage', appliedBy: 'IzzyUncut' }];
    const onAlly   = [{ effectId: 'inspire-courage', appliedBy: 'IzzyUncut' }];
    expect(effectAuraProfile(bard, onCaster, spells)?.feet).toBe(60);
    expect(effectAuraProfile(fighter, onAlly, spells)).toBeNull();
  });

  it('is null when the source spell has no parseable emanation', () => {
    expect(effectAuraProfile(bard, [{ effectId: 'inspire-courage' }], [{ id: 'inspire-courage' }]))
      .toBeNull();
  });

  it('characterCastsSpell reads focus spells, the repertoire and innate feats', () => {
    expect(characterCastsSpell(bard, 'inspire-courage')).toBe(true);
    expect(characterCastsSpell({ spellcasting: { spells: [{ spellRef: 'bless' }] } }, 'bless')).toBe(true);
    expect(characterCastsSpell({ feats: [{ innate: [{ spellRef: 'guidance' }] }] }, 'guidance')).toBe(true);
    expect(characterCastsSpell(fighter, 'inspire-courage')).toBe(false);
  });
});

describe('resolveAuraSource — one aura per character', () => {
  const anthemOnCaster = [{ effectId: 'inspire-courage', appliedBy: 'Pellias' }];
  const bardish = { ...both, focus_spells: [{ spellRef: 'inspire-courage' }] };

  it('gives the Region to the class aura while it is up', () => {
    const source = resolveAuraSource({
      character: bardish, auraActive: true, effects: anthemOnCaster, spells,
    });
    expect(source).toEqual({ feet: 15, label: "Champion's Aura", kind: 'champion' });
  });

  it('hands it to the effect aura while the class aura is down', () => {
    const source = resolveAuraSource({
      character: bardish, auraActive: false, effects: anthemOnCaster, spells,
    });
    expect(source).toEqual({ feet: 60, label: 'Courageous Anthem', kind: 'effect' });
  });

  it('is null when nothing is projecting', () => {
    expect(resolveAuraSource({ character: both, auraActive: false, effects: [], spells })).toBeNull();
  });

  it('ignores the aura key for a character whose only aura is effect-driven', () => {
    expect(resolveAuraSource({ character: bard, auraActive: true, effects: [], spells })).toBeNull();
  });
});

describe('auraNarrowedEntryIds', () => {
  const members = {
    known: true,
    inside: [
      { entryId: 'cbt-pellias', disposition: 1, hidden: false },
      { entryId: 'cbt-jade',    disposition: 1, hidden: true },
      { entryId: 'cbt-goblin',  disposition: -1, hidden: false },
    ],
  };
  const source = { feet: 60, label: 'Courageous Anthem', kind: 'effect' };

  it('narrows to the members inside, plus the caster', () => {
    const ids = auraNarrowedEntryIds({
      ability: anthem, auraSource: source, members, casterEntryId: 'cbt-izzy',
    });
    expect(ids).toEqual(expect.arrayContaining(['cbt-pellias', 'cbt-jade', 'cbt-goblin', 'cbt-izzy']));
    expect(ids).toHaveLength(4);
  });

  it('keeps a HIDDEN ally who is genuinely inside', () => {
    const ids = auraNarrowedEntryIds({ ability: anthem, auraSource: source, members });
    expect(ids).toContain('cbt-jade');
  });

  it('returns null when membership is unknown — the bridgeless mode', () => {
    expect(auraNarrowedEntryIds({
      ability: anthem, auraSource: source, members: { known: false, inside: [] },
    })).toBeNull();
  });

  it('returns null when the live aura is a DIFFERENT circle than the ability area', () => {
    expect(auraNarrowedEntryIds({
      ability: anthem, auraSource: { feet: 15, kind: 'champion' }, members,
    })).toBeNull();
  });

  it('returns null when the caster projects no aura at all', () => {
    expect(auraNarrowedEntryIds({ ability: anthem, auraSource: null, members })).toBeNull();
  });

  it('returns null for an ability with no emanation area', () => {
    expect(auraNarrowedEntryIds({
      ability: { id: 'fireball', area: '20-foot burst' }, auraSource: { feet: 20 }, members,
    })).toBeNull();
  });

  it('narrows to just the caster when the aura is empty', () => {
    expect(auraNarrowedEntryIds({
      ability: anthem,
      auraSource: source,
      members: { known: true, inside: [] },
      casterEntryId: 'cbt-izzy',
    })).toEqual(['cbt-izzy']);
  });
});

describe('filterAllyAuraReactions', () => {
  const retributive = { name: 'Retributive Strike', requiresAllyInAura: true };
  const shieldBlock = { name: 'Shield Block' };
  const list = [retributive, shieldBlock];
  const members = { known: true, inside: [{ entryId: 'cbt-jade' }] };

  it('flags the authored trigger', () => {
    expect(requiresAllyInAura(retributive)).toBe(true);
    expect(requiresAllyInAura(shieldBlock)).toBe(false);
  });

  it('drops an aura-scoped reaction when the struck ally is outside', () => {
    expect(filterAllyAuraReactions(list, { members, allyEntryId: 'cbt-izzy' }))
      .toEqual([shieldBlock]);
  });

  it('keeps everything when the struck ally is inside', () => {
    expect(filterAllyAuraReactions(list, { members, allyEntryId: 'cbt-jade' })).toEqual(list);
  });

  it('never suppresses on unknown membership', () => {
    expect(filterAllyAuraReactions(list, {
      members: { known: false, inside: [] }, allyEntryId: 'cbt-izzy',
    })).toEqual(list);
  });

  it('never suppresses when the GM named no struck ally', () => {
    expect(filterAllyAuraReactions(list, { members })).toEqual(list);
    expect(filterAllyAuraReactions(list, {})).toEqual(list);
  });
});
