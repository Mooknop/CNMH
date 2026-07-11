import { describe, it, expect } from 'vitest';
import { flourishFor } from './flourishFor';

const pc = (cls) => ({ id: 'pc-1', class: cls });

describe('flourishFor — authored override', () => {
  it('an explicit ability.flourish wins over every rule', () => {
    expect(
      flourishFor({
        ability: { name: 'Dragon Stance', flourish: 'custom-one-off' },
        character: pc('Monk'),
      })
    ).toBe('custom-one-off');
  });

  it('a non-string flourish field is ignored', () => {
    expect(
      flourishFor({ ability: { name: 'Whatever', flourish: 7 }, character: pc('Fighter') })
    ).toBeUndefined();
  });
});

describe('flourishFor — shadow-tendrils (Thaumaturge)', () => {
  it('fires on Exploit Vulnerability by name (case-insensitive)', () => {
    expect(
      flourishFor({ ability: { name: 'Exploit Vulnerability' }, character: pc('Thaumaturge') })
    ).toBe('shadow-tendrils');
  });

  it('fires on any scroll cast', () => {
    expect(
      flourishFor({
        ability: { name: 'Heal' }, castSource: 'scroll', character: pc('Thaumaturge'),
      })
    ).toBe('shadow-tendrils');
  });

  it('other thaumaturge abilities stay plain', () => {
    expect(
      flourishFor({ ability: { name: 'Intensify Vulnerability' }, character: pc('Thaumaturge') })
    ).toBeUndefined();
  });
});

describe('flourishFor — dragon-lightning (Monk)', () => {
  it.each(['Dragon Stance', 'Dragon Spit'])('fires on %s by name', (name) => {
    expect(flourishFor({ ability: { name }, character: pc('Monk') })).toBe('dragon-lightning');
  });

  it('other monk abilities stay plain', () => {
    expect(
      flourishFor({ ability: { name: 'Flurry of Blows' }, character: pc('Monk') })
    ).toBeUndefined();
  });
});

describe('flourishFor — composition-burst (Bard)', () => {
  it('fires on the Composition trait', () => {
    expect(
      flourishFor({
        ability: { name: 'Courageous Anthem', traits: ['Bard', 'Composition'] },
        castSource: 'focus',
        character: pc('Bard'),
      })
    ).toBe('composition-burst');
  });

  it('fires on a repertoire (slot) cast', () => {
    expect(
      flourishFor({
        ability: { name: 'Phantasmal Killer' }, castSource: 'slot', character: pc('Bard'),
      })
    ).toBe('composition-burst');
  });

  it('a non-composition focus cast stays plain', () => {
    expect(
      flourishFor({
        ability: { name: 'Some Focus Spell' }, castSource: 'focus', character: pc('Bard'),
      })
    ).toBeUndefined();
  });
});

describe('flourishFor — blood-swirl (Sorcerer)', () => {
  it('fires on a repertoire (slot) cast', () => {
    expect(
      flourishFor({
        ability: { name: 'Fireball' }, castSource: 'slot', character: pc('Sorcerer'),
      })
    ).toBe('blood-swirl');
  });

  it('fires on a blood-magic rider without a slot cast', () => {
    expect(
      flourishFor({
        ability: { name: 'Ancestral Memories' },
        castSource: 'focus',
        character: pc('Sorcerer'),
        bloodMagicActive: true,
      })
    ).toBe('blood-swirl');
  });

  it('escalates to blood-swirl-loud when both land on one confirm', () => {
    expect(
      flourishFor({
        ability: { name: 'Fireball' },
        castSource: 'slot',
        character: pc('Sorcerer'),
        bloodMagicActive: true,
      })
    ).toBe('blood-swirl-loud');
  });

  it('a plain focus cast without blood magic stays plain', () => {
    expect(
      flourishFor({
        ability: { name: 'Ancestral Memories' }, castSource: 'focus', character: pc('Sorcerer'),
      })
    ).toBeUndefined();
  });
});

describe('flourishFor — rust-bloom (Champion w/ Kineticist archetype)', () => {
  it('fires on any Impulse-trait ability', () => {
    expect(
      flourishFor({
        ability: { name: 'Melee Metal Blast', traits: ['Attack', 'Impulse', 'Kineticist'] },
        character: pc('Champion'),
      })
    ).toBe('rust-bloom');
  });

  it('fires on Shields of the Spirit by name', () => {
    expect(
      flourishFor({
        ability: { name: 'Shields of the Spirit' }, castSource: 'focus', character: pc('Champion'),
      })
    ).toBe('rust-bloom');
  });

  it('other champion abilities stay plain', () => {
    expect(
      flourishFor({ ability: { name: 'Retributive Strike' }, character: pc('Champion') })
    ).toBeUndefined();
  });
});

describe('flourishFor — rune-marked gear (thassilonianRune)', () => {
  const hammer = { name: "Xanderghul's Flawless Hammer", thassilonianRune: 'pride' };
  const withHammer = (cls) => ({ ...pc(cls), inventory: [{ name: 'Rope' }, hammer] });

  it('a derived strike sourced from a rune item stamps that rune', () => {
    expect(
      flourishFor({
        ability: { name: 'Flawless Hammer Melee Strike', source: hammer.name },
        character: withHammer('Fighter'),
      })
    ).toBe('rune-pride');
  });

  it('a staff cast from a rune staff stamps the rune (staffName path)', () => {
    expect(
      flourishFor({
        ability: { name: 'Mirror Image', fromStaff: true, staffName: hammer.name },
        castSource: 'staff',
        character: withHammer('Sorcerer'),
      })
    ).toBe('rune-pride');
  });

  it('beats the class rule — the item is the signature', () => {
    // A Champion Impulse would be rust-bloom; sourced from the hammer it runes.
    expect(
      flourishFor({
        ability: { name: 'Emotional Surge', traits: ['Impulse'], source: hammer.name },
        character: withHammer('Champion'),
      })
    ).toBe('rune-pride');
  });

  it('loses to an authored ability.flourish', () => {
    expect(
      flourishFor({
        ability: { name: 'Special', source: hammer.name, flourish: 'custom-one-off' },
        character: withHammer('Fighter'),
      })
    ).toBe('custom-one-off');
  });

  it('a source naming a non-rune item (or a feat) stays plain', () => {
    expect(
      flourishFor({
        ability: { name: 'Rope Trick', source: 'Rope' },
        character: withHammer('Fighter'),
      })
    ).toBeUndefined();
    expect(
      flourishFor({
        ability: { name: 'Power Attack', source: 'Power Attack' },
        character: withHammer('Fighter'),
      })
    ).toBeUndefined();
  });

  it('an unsourced ability never rune-stamps (repertoire casts stay class-ruled)', () => {
    expect(
      flourishFor({
        ability: { name: 'Daze' }, castSource: 'slot',
        character: withHammer('Sorcerer'),
      })
    ).toBe('blood-swirl');
  });
});

describe('flourishFor — catalog property runes (#1369 R7)', () => {
  const sword = (property) => ({ name: 'Longsword', runes: { potency: 2, property } });
  const withSword = (property, cls = 'Fighter') => ({
    ...pc(cls),
    inventory: [{ name: 'Rope' }, sword(property)],
  });
  const strike = { name: 'Longsword Melee Strike', source: 'Longsword' };

  it('a strike with a property-runed weapon stamps the rune glyph', () => {
    expect(
      flourishFor({
        ability: strike,
        character: withSword([{ id: 'flaming', name: 'Flaming' }]),
      })
    ).toBe('runestamp:flaming');
  });

  it('picks the first rune with a drawn glyph, in slot order', () => {
    // a synthetic post-wave id with no drawn family (generic fallback) — skipped.
    expect(
      flourishFor({
        ability: strike,
        character: withSword([
          { id: 'unwritten', name: 'Unwritten' },
          { id: 'frost-greater', name: 'Greater Frost' },
        ]),
      })
    ).toBe('runestamp:frost-greater');
  });

  it('all-generic runes never stamp — the class rule still applies', () => {
    expect(
      flourishFor({
        ability: { ...strike, traits: ['Impulse'] },
        character: withSword([{ id: 'unwritten', name: 'Unwritten' }], 'Champion'),
      })
    ).toBe('rust-bloom');
  });

  it('unresolved string refs are skipped', () => {
    expect(
      flourishFor({
        ability: strike,
        character: withSword(['flaming']),
      })
    ).toBeUndefined();
  });

  it('fundamental runes never stamp — display-only, excluded from the juice layer', () => {
    // A +2 greater-striking weapon with no property runes shows its
    // fundamental glyphs in inventory/shop, but a Strike with it plays no
    // runestamp: flourishFor reads runes.property only.
    const character = {
      ...pc('Fighter'),
      inventory: [{ name: 'Longsword', runes: { potency: 2, striking: 'greater', property: [] } }],
    };
    expect(flourishFor({ ability: strike, character })).toBeUndefined();
  });

  it('loses to a sin rune on the same item — the sin is the identity', () => {
    const marked = {
      name: 'Longsword',
      thassilonianRune: 'pride',
      runes: { potency: 1, property: [{ id: 'flaming', name: 'Flaming' }] },
    };
    expect(
      flourishFor({
        ability: strike,
        character: { ...pc('Fighter'), inventory: [marked] },
      })
    ).toBe('rune-pride');
  });

  it('loses to an authored ability.flourish', () => {
    expect(
      flourishFor({
        ability: { ...strike, flourish: 'custom-one-off' },
        character: withSword([{ id: 'flaming', name: 'Flaming' }]),
      })
    ).toBe('custom-one-off');
  });
});

describe('flourishFor — rune-granted abilities (#1377 R8)', () => {
  // Abilities the rune itself grants carry `runeSource: <runeId>` (tagged at
  // fold time in actionUtils, or on a buildRuneCastSpell synthetic cast).
  const runeAbility = { name: 'Rune Action', source: 'Gloves (Frost)', runeSource: 'frost' };

  it('a rune-granted ability stamps the granting rune', () => {
    expect(flourishFor({ ability: runeAbility, character: pc('Fighter') }))
      .toBe('runestamp:frost');
  });

  it('an undrawn family never stamps — falls through to the class rules', () => {
    expect(
      flourishFor({
        ability: { ...runeAbility, runeSource: 'unwritten', traits: ['Impulse'] },
        character: pc('Champion'),
      })
    ).toBe('rust-bloom');
  });

  it('beats the host\'s property-rune slot scan — the granting rune is the signature', () => {
    // The ability's source names a weapon whose FIRST drawn property rune is
    // flaming, but the ability was granted by the frost rune: frost stamps.
    const character = {
      ...pc('Fighter'),
      inventory: [{
        name: 'Longsword',
        runes: { potency: 2, property: [{ id: 'flaming', name: 'Flaming' }] },
      }],
    };
    const granted = { name: 'Rune Action', source: 'Longsword', runeSource: 'frost' };
    expect(flourishFor({ ability: granted, character })).toBe('runestamp:frost');
  });

  it('loses to a sin rune on the source item, and to an authored flourish', () => {
    const character = {
      ...pc('Fighter'),
      inventory: [{ name: 'Gloves', thassilonianRune: 'pride' }],
    };
    expect(
      flourishFor({ ability: { ...runeAbility, source: 'Gloves' }, character })
    ).toBe('rune-pride');
    expect(
      flourishFor({ ability: { ...runeAbility, flourish: 'custom-one-off' }, character: pc('Fighter') })
    ).toBe('custom-one-off');
  });
});

describe('flourishFor — class keying', () => {
  it('rules never leak across classes (a Monk composition stays plain)', () => {
    expect(
      flourishFor({
        ability: { name: 'Song', traits: ['Composition'] }, character: pc('Monk'),
      })
    ).toBeUndefined();
  });

  it('an unknown class never matches', () => {
    expect(
      flourishFor({ ability: { name: 'Exploit Vulnerability' }, character: pc('Fighter') })
    ).toBeUndefined();
  });

  it('tolerates a missing character', () => {
    expect(flourishFor({ ability: { name: 'Anything' } })).toBeUndefined();
  });
});
