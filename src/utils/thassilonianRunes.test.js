import { describe, it, expect } from 'vitest';
import {
  THASSILONIAN_RUNES,
  SIN_VIRTUE_PAIRS,
  runeForName,
} from './thassilonianRunes';

describe('THASSILONIAN_RUNES', () => {
  it('holds all seven sins and seven virtues', () => {
    const names = Object.keys(THASSILONIAN_RUNES);
    expect(names).toHaveLength(14);
    expect(names.filter((n) => THASSILONIAN_RUNES[n].kind === 'sin')).toHaveLength(7);
    expect(names.filter((n) => THASSILONIAN_RUNES[n].kind === 'virtue')).toHaveLength(7);
  });

  it('gives every rune a label and a non-trivial path', () => {
    for (const [name, rune] of Object.entries(THASSILONIAN_RUNES)) {
      expect(rune.label, name).toBeTruthy();
      expect(rune.d.length, name).toBeGreaterThan(40);
      expect(rune.d.trim(), name).toMatch(/^M/);
    }
  });

  it('opposes links are symmetric and match SIN_VIRTUE_PAIRS', () => {
    expect(SIN_VIRTUE_PAIRS).toHaveLength(7);
    for (const [sin, virtue] of SIN_VIRTUE_PAIRS) {
      expect(THASSILONIAN_RUNES[sin].kind).toBe('sin');
      expect(THASSILONIAN_RUNES[virtue].kind).toBe('virtue');
      expect(THASSILONIAN_RUNES[sin].opposes).toBe(virtue);
      expect(THASSILONIAN_RUNES[virtue].opposes).toBe(sin);
    }
  });

  it('every sin carries a school of magic', () => {
    for (const [sin] of SIN_VIRTUE_PAIRS) {
      expect(THASSILONIAN_RUNES[sin].school, sin).toBeTruthy();
    }
  });
});

describe('runeForName', () => {
  it('resolves case-insensitively', () => {
    expect(runeForName('Wrath')).toBe(THASSILONIAN_RUNES.wrath);
    expect(runeForName('KINDNESS')).toBe(THASSILONIAN_RUNES.kindness);
  });

  it('returns null for unknown or empty names', () => {
    expect(runeForName('avarice')).toBeNull();
    expect(runeForName('')).toBeNull();
    expect(runeForName(undefined)).toBeNull();
  });
});
