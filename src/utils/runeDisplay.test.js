import { runeModifierText, runeUsageText } from './runeDisplay';

describe('runeModifierText (#1055 S1)', () => {
  it('renders a skill item bonus', () => {
    expect(runeModifierText({ stat: 'intimidation', kind: 'item', amount: 1 }))
      .toBe('+1 item bonus to Intimidation');
    expect(runeModifierText({ stat: 'stealth', kind: 'item', amount: 2 }))
      .toBe('+2 item bonus to Stealth');
  });

  it('renders a kind-less bonus and labels AC specially', () => {
    expect(runeModifierText({ stat: 'ac', amount: 1 })).toBe('+1 bonus to AC');
  });

  it('renders a typed resistance', () => {
    expect(runeModifierText({ stat: 'resistance', amount: 5, vs: 'acid' }))
      .toBe('Resistance 5 to acid');
  });

  it('renders the eased flat check (Greater Stanching) with vs de-hyphenated', () => {
    expect(runeModifierText({ stat: 'resistance', vs: 'persistent-bleed', flatCheckEase: true }))
      .toBe('Eases the flat check to end persistent bleed');
  });

  it('returns null for junk', () => {
    expect(runeModifierText(null)).toBeNull();
    expect(runeModifierText({})).toBeNull();
    expect(runeModifierText({ stat: 'stealth' })).toBeNull(); // no amount
  });
});

describe('runeUsageText (#1055 S1)', () => {
  it('lists an accessory rune usage tags with display labels', () => {
    expect(runeUsageText({ target: 'accessory', usage: ['pocketed'] }))
      .toBe('Etches onto pocketed items');
    expect(runeUsageText({ target: 'accessory', usage: ['dueling-cape', 'shield', 'light'] }))
      .toBe('Etches onto dueling capes, shields, light items (Bulk L or less)');
  });

  it('falls back to de-hyphenating an unknown accessory tag', () => {
    expect(runeUsageText({ target: 'accessory', usage: ['wide-brim-hat'] }))
      .toBe('Etches onto wide brim hat');
  });

  it('names the slot for targeted runes, including the legacy armorRune fallback', () => {
    expect(runeUsageText({ target: 'ring' })).toBe('Etches onto a power ring');
    expect(runeUsageText({ target: 'armor' })).toBe('Etches onto armor');
    expect(runeUsageText({ armorRune: true })).toBe('Etches onto armor');
    expect(runeUsageText({ id: 'flaming' })).toBe('Etches onto weapons'); // legacy weapon default
  });

  it('returns null for an accessory rune without usage tags and for non-objects', () => {
    expect(runeUsageText({ target: 'accessory' })).toBeNull();
    expect(runeUsageText(null)).toBeNull();
  });
});
