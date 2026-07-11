import { actuatedCastsSpell, buildRuneCastSpell } from './runeSpellCast';

const fearDoc = {
  id: 'fear', name: 'Fear', level: 1, baseLevel: 0, defense: 'Will',
  traits: ['Emotion', 'Fear', 'Mental'], degrees: { Failure: 'Frightened 2.' },
};
const menacingActuated = {
  cost: 'none', name: 'Fear', actionCount: 2, frequency: 'once per day',
  traits: ['Concentrate', 'Manipulate'], spellRef: 'fear', castRank: 3, dc: 25,
};

describe('actuatedCastsSpell (#1055 S3)', () => {
  it('is true only for a block carrying a spellRef', () => {
    expect(actuatedCastsSpell(menacingActuated)).toBe(true);
    expect(actuatedCastsSpell({ cost: 'none', name: 'Call Item' })).toBe(false);
    expect(actuatedCastsSpell(null)).toBe(false);
    expect(actuatedCastsSpell('nope')).toBe(false);
  });
});

describe('buildRuneCastSpell (#1055 S3)', () => {
  it('casts at the rune rank with a fixed DC, no slot, shared frequency key', () => {
    const out = buildRuneCastSpell(menacingActuated, fearDoc, 'cloak-uid');
    expect(out.level).toBe(3);                                 // fixed rank, not 1
    expect(out.roll).toEqual({ type: 'spell-dc', bonus: 25 }); // fixed DC 25
    expect(out.innate).toBe(true);                             // no-slot cast source
    expect(out.id).toBe('cloak-uid:actuated');                 // shared freq key
    expect(out.frequency).toBe('once per day');
    expect(out.defense).toBe('Will');                          // spell fields preserved
    expect(out.degrees).toEqual(fearDoc.degrees);
  });

  it('falls back to the spell rank and spell id when castRank/dc/host are absent', () => {
    const out = buildRuneCastSpell({ spellRef: 'fear', name: 'Fear' }, fearDoc, null);
    expect(out.level).toBe(1);       // spell's own level
    expect(out.roll).toBeUndefined(); // no fixed DC → caster's spell DC used
    expect(out.id).toBe('fear');     // spell's own id (no host uid)
    expect(out.frequency).toBe('once per day');
  });

  it('returns null for a non-spell block or an unresolved doc', () => {
    expect(buildRuneCastSpell({ name: 'Call Item' }, fearDoc, 'u')).toBeNull();
    expect(buildRuneCastSpell(menacingActuated, null, 'u')).toBeNull();
    expect(buildRuneCastSpell(null, fearDoc, 'u')).toBeNull();
  });

  it('tags the cast with the granting rune for the runestamp flourish (#1377)', () => {
    const out = buildRuneCastSpell(menacingActuated, fearDoc, 'cloak-uid', 'greater-menacing');
    expect(out.runeSource).toBe('greater-menacing');
    // A host item's own actuation carries no tag.
    expect(buildRuneCastSpell(menacingActuated, fearDoc, 'cloak-uid').runeSource).toBeUndefined();
  });
});
