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
