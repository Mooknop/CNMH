import { describe, it, expect } from 'vitest';
import {
  REINFORCING,
  REINFORCING_TIERS,
  buildShieldName,
  resolveShield,
  resolveShieldItem,
  resolveShieldBlock,
  shieldDisplayName,
  shieldRuneTierSummary,
  hasShieldRuneBlock,
  hasReinforcing,
  shieldPropertyRunes,
  shieldPropertySlotCapacity,
  usedShieldPropertySlots,
  freeShieldPropertySlots,
  shieldEffectiveTraits,
  shieldHasFinesse,
} from './shieldRunes';

const STEEL = { hardness: 5, health: 20, breakThreshold: 10, bonus: 2, speedPenalty: 0 };

describe('REINFORCING table', () => {
  it('has six ordered tiers minor → supreme', () => {
    expect(REINFORCING_TIERS).toEqual(['minor', 'lesser', 'moderate', 'greater', 'major', 'supreme']);
    REINFORCING_TIERS.forEach((k, i) => expect(REINFORCING[k].rank).toBe(i + 1));
  });
});

describe('resolveShield — additive with cap', () => {
  it('reproduces the retired Sturdy Shield (Minor) stats from a plain steel shield', () => {
    const r = resolveShield({ name: 'Steel Shield', ...STEEL }, { reinforcing: 'minor' });
    // min(5+3,8)=8 · min(20+44,64)=64 · min(10+22,32)=32
    expect(r).toMatchObject({ hardness: 8, hp: 64, brokenThreshold: 32 });
  });

  it('adds flat deltas over a steel base without reaching the higher caps (RAW)', () => {
    // A hardness-5 steel base + the flat +3/+5 delta never reaches the higher
    // grade caps — you need a tougher base shield to hit them. min(base+delta, cap).
    expect(resolveShield(STEEL, { reinforcing: 'lesser' })).toMatchObject({ hardness: 8, hp: 72, brokenThreshold: 36 });
    expect(resolveShield(STEEL, { reinforcing: 'moderate' })).toMatchObject({ hardness: 8, hp: 84, brokenThreshold: 42 });
    expect(resolveShield(STEEL, { reinforcing: 'supreme' })).toMatchObject({ hardness: 12, hp: 128, brokenThreshold: 64 });
  });

  it('clamps each stat to the tier cap (delta cannot exceed the ceiling)', () => {
    // A sturdy base already at/over the cap stays at the cap, never above.
    const beefy = { hardness: 20, health: 200, breakThreshold: 100 };
    expect(resolveShield(beefy, { reinforcing: 'minor' })).toMatchObject({ hardness: 8, hp: 64, brokenThreshold: 32 });
  });

  it('adds over a non-steel / precious-material base then caps', () => {
    // Higher base hardness (e.g. adamantine) still resolves additively-with-cap.
    const adamantine = { hardness: 13, health: 40, breakThreshold: 20, material: 'Adamantine' };
    const r = resolveShield({ name: 'Buckler', ...adamantine }, { reinforcing: 'greater' });
    // min(13+5,15)=15 · min(40+80,120)=120 · min(20+40,60)=60
    expect(r).toMatchObject({ hardness: 15, hp: 120, brokenThreshold: 60 });
  });

  it('passes AC bonus and speed penalty through untouched', () => {
    const r = resolveShield({ ...STEEL, bonus: 2, speedPenalty: 5 }, { reinforcing: 'major' });
    expect(r.bonus).toBe(2);
    expect(r.speedPenalty).toBe(5);
  });

  it('sums price and returns the base name with no rune', () => {
    const r = resolveShield({ name: 'Steel Shield', price: 2, ...STEEL }, {});
    expect(r).toMatchObject({ hardness: 5, hp: 20, brokenThreshold: 10, reinforcing: null, name: 'Steel Shield', price: 2 });
    expect(resolveShield({ name: 'Steel Shield', price: 2, ...STEEL }, { reinforcing: 'moderate' }).price).toBe(902);
  });

  it('ignores an unknown reinforcing tier (treats as none)', () => {
    const r = resolveShield(STEEL, { reinforcing: 'legendary' });
    expect(r).toMatchObject({ hardness: 5, hp: 20, brokenThreshold: 10, reinforcing: null });
  });
});

describe('buildShieldName — Remaster grade-first', () => {
  it('prefixes the grade label before material and base', () => {
    expect(buildShieldName({ reinforcing: 'minor', base: 'Steel Shield' })).toBe('Minor Reinforcing Steel Shield');
    expect(buildShieldName({ reinforcing: 'greater', material: 'Darkwood', base: 'Buckler' })).toBe('Greater Reinforcing Darkwood Buckler');
  });
  it('returns the bare base name with no rune', () => {
    expect(buildShieldName({ base: 'Steel Shield' })).toBe('Steel Shield');
  });
});

describe('item-level helpers', () => {
  const runed = { name: 'Steel Shield', price: 2, shield: STEEL, runes: { reinforcing: 'minor' } };
  const plain = { name: 'Steel Shield', price: 2, shield: STEEL };

  it('hasShieldRuneBlock / hasReinforcing detect the block', () => {
    expect(hasShieldRuneBlock(runed)).toBe(true);
    expect(hasReinforcing(runed)).toBe(true);
    expect(hasReinforcing(plain)).toBe(false);
    expect(hasReinforcing({ ...plain, runes: { reinforcing: 'nope' } })).toBe(false);
  });

  it('resolveShieldItem folds the block over the shield block', () => {
    expect(resolveShieldItem(runed)).toMatchObject({ hardness: 8, hp: 64, brokenThreshold: 32, name: 'Minor Reinforcing Steel Shield' });
  });

  it('resolveShieldBlock returns a durability block in both hp/health spellings', () => {
    const b = resolveShieldBlock(runed);
    expect(b).toMatchObject({ hardness: 8, hp: 64, health: 64, brokenThreshold: 32, breakThreshold: 32, bonus: 2 });
  });

  it('resolveShieldBlock passes a non-reinforced shield through unchanged', () => {
    expect(resolveShieldBlock(plain)).toBe(plain.shield);
    expect(resolveShieldBlock({ name: 'x' })).toBeNull();
  });

  it('shieldDisplayName derives only when reinforced', () => {
    expect(shieldDisplayName(runed)).toBe('Minor Reinforcing Steel Shield');
    expect(shieldDisplayName(plain)).toBe('Steel Shield');
  });

  it('shieldRuneTierSummary labels the tier', () => {
    expect(shieldRuneTierSummary({ reinforcing: 'moderate' })).toBe('Moderate Reinforcing');
    expect(shieldRuneTierSummary({})).toBe('');
    expect(shieldRuneTierSummary(null)).toBe('');
  });
});

// ── Property-rune slots + resolution (#1196 G2) ────────────────────────────────
describe('shieldPropertySlotCapacity (from reinforcing grade)', () => {
  it('maps grade → slots: minor/lesser → 1, moderate/greater → 2, major/supreme → 3', () => {
    expect(shieldPropertySlotCapacity({ reinforcing: 'minor' })).toBe(1);
    expect(shieldPropertySlotCapacity({ reinforcing: 'lesser' })).toBe(1);
    expect(shieldPropertySlotCapacity({ reinforcing: 'moderate' })).toBe(2);
    expect(shieldPropertySlotCapacity({ reinforcing: 'greater' })).toBe(2);
    expect(shieldPropertySlotCapacity({ reinforcing: 'major' })).toBe(3);
    expect(shieldPropertySlotCapacity({ reinforcing: 'supreme' })).toBe(3);
  });

  it('no reinforcing rune → 0 slots', () => {
    expect(shieldPropertySlotCapacity({})).toBe(0);
    expect(shieldPropertySlotCapacity(null)).toBe(0);
    expect(shieldPropertySlotCapacity({ reinforcing: 'bogus' })).toBe(0);
  });
});

describe('used / free shield property slots', () => {
  const energyRes = { id: 'energy-resistant', type: 'property', name: 'Energy-Resistant', price: 500 };
  it('an accessory rune never consumes a property slot', () => {
    // A moderate shield (2 slots) with one property + an accessory rune: 1 used, 1 free.
    const item = { shield: {}, runes: { reinforcing: 'moderate', property: [energyRes], accessory: 'presentable' } };
    expect(usedShieldPropertySlots(item)).toBe(1);
    expect(freeShieldPropertySlots(item)).toBe(1);
  });

  it('counts filled slots and floors free at 0', () => {
    const item = { shield: {}, runes: { reinforcing: 'minor', property: [energyRes, energyRes] } };
    expect(usedShieldPropertySlots(item)).toBe(2);      // two applied
    expect(shieldPropertySlotCapacity(item.runes)).toBe(1); // but capacity 1
    expect(freeShieldPropertySlots(item)).toBe(0);      // floored, never negative
  });

  it('shieldPropertyRunes returns only resolved docs', () => {
    const item = { shield: {}, runes: { reinforcing: 'moderate', property: [energyRes, 'unresolved-id'] } };
    expect(shieldPropertyRunes(item)).toEqual([energyRes]); // the bare id is dropped
  });
});

describe('resolveShield with property runes (name + price)', () => {
  const base = { name: 'Kite Shield', price: 5, hardness: 4, health: 22, breakThreshold: 11, bonus: 2 };
  const winglet = { name: 'Winglet', price: 350 };
  const energyRes = { name: 'Energy-Resistant', price: 500 };

  it('name lists properties after the reinforcing grade, price sums all', () => {
    const r = resolveShield(base, { reinforcing: 'moderate', property: [winglet, energyRes] });
    expect(r.name).toBe('Moderate Reinforcing Winglet Energy-Resistant Kite Shield');
    expect(r.price).toBe(5 + 900 + 350 + 500); // base + moderate reinforcing + two properties
    expect(r.properties).toEqual([winglet, energyRes]);
  });

  it('ignores unresolved (string) property refs in name/price', () => {
    const r = resolveShield(base, { reinforcing: 'minor', property: ['not-a-doc'] });
    expect(r.name).toBe('Minor Reinforcing Kite Shield');
    expect(r.price).toBe(5 + 75); // no property price added
  });
});

// ── Rune-granted traits (#1196 G3 wiring) ──────────────────────────────────────
describe('shieldEffectiveTraits + shieldHasFinesse', () => {
  const feather = { id: 'feather', type: 'property', name: 'Feather' };
  const throwing = { id: 'throwing', type: 'property', name: 'Throwing' };
  const energyRes = { id: 'energy-resistant', type: 'property', name: 'Energy-Resistant', choice: 'fire' };

  it('appends Feather → Finesse and Throwing → Thrown after base traits', () => {
    const item = { traits: ['Cumbersome'], shield: {}, runes: { reinforcing: 'moderate', property: [feather, throwing] } };
    expect(shieldEffectiveTraits(item)).toEqual(['Cumbersome', 'Finesse', 'Thrown']);
  });

  it('de-dupes a granted trait already present on the base (case-insensitive)', () => {
    // A Targe (base Finesse) with a Feather rune keeps a single Finesse.
    const item = { traits: ['Finesse'], shield: {}, runes: { reinforcing: 'minor', property: [feather] } };
    expect(shieldEffectiveTraits(item)).toEqual(['Finesse']);
  });

  it('ignores non-trait-granting runes and returns base traits when unruned', () => {
    expect(shieldEffectiveTraits({ traits: ['Accessible'], shield: {}, runes: { reinforcing: 'minor', property: [energyRes] } }))
      .toEqual(['Accessible']);
    expect(shieldEffectiveTraits({ traits: ['Deflecting'], shield: {} })).toEqual(['Deflecting']);
    expect(shieldEffectiveTraits({ shield: {} })).toEqual([]);
  });

  it('shieldHasFinesse: base finesse OR the Feather rune', () => {
    expect(shieldHasFinesse({ traits: ['Finesse'], shield: {} })).toBe(true); // Targe base
    expect(shieldHasFinesse({ traits: [], shield: {}, runes: { reinforcing: 'minor', property: [feather] } })).toBe(true);
    expect(shieldHasFinesse({ traits: ['Cumbersome'], shield: {}, runes: { reinforcing: 'minor', property: [throwing] } })).toBe(false);
  });
});
