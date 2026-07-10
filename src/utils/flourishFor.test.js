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
