import { describe, test, expect } from 'vitest';
import {
  traitToAccent,
  classificationLabel,
  dexOrder,
  dexNumber,
  formatDexNo,
  revealFlags,
  DEFAULT_ACCENT,
} from './bestiaryPresentation';

describe('traitToAccent', () => {
  test('maps a known primary type trait', () => {
    expect(traitToAccent(['aberration', 'air'])).toBe('var(--arcane-light)');
  });

  test('scans in order for the first recognised trait', () => {
    // "goblin" is unrecognised; "humanoid" is the primary type.
    expect(traitToAccent(['goblin', 'humanoid'])).toBe('var(--iron-light)');
  });

  test('falls back to wisp when nothing matches', () => {
    expect(traitToAccent(['goblin', 'spooky'])).toBe(DEFAULT_ACCENT);
    expect(traitToAccent([])).toBe(DEFAULT_ACCENT);
    expect(traitToAccent(undefined)).toBe(DEFAULT_ACCENT);
  });

  test('is case-insensitive', () => {
    expect(traitToAccent(['UNDEAD'])).toBe('#9fb4c4');
  });
});

describe('classificationLabel', () => {
  test('uppercases the primary type trait', () => {
    expect(classificationLabel(['aberration', 'air'])).toBe('ABERRATION CLASS');
  });

  test('falls back to the first trait when no type is recognised', () => {
    expect(classificationLabel(['goblin'])).toBe('GOBLIN CLASS');
  });

  test('handles no traits', () => {
    expect(classificationLabel([])).toBe('UNCLASSIFIED');
    expect(classificationLabel(undefined)).toBe('UNCLASSIFIED');
  });
});

describe('dex numbering', () => {
  const monsters = [
    { id: 'c', name: 'Cinder', bestiary: {}, capturedAt: 300 },
    { id: 'a', name: 'Aboleth', bestiary: {}, capturedAt: 100 },
    { id: 'b', name: 'Bog', bestiary: {}, capturedAt: 200 },
    { id: 'no-stats', name: 'Ghost', capturedAt: 50 }, // no bestiary → not catalogued
  ];

  test('orders by capture time then id', () => {
    expect(dexOrder(monsters).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  test('dexNumber is 1-based position in the catalogue', () => {
    expect(dexNumber(monsters, 'a')).toBe(1);
    expect(dexNumber(monsters, 'b')).toBe(2);
    expect(dexNumber(monsters, 'c')).toBe(3);
  });

  test('returns null for an un-catalogued or keyless creature', () => {
    expect(dexNumber(monsters, 'no-stats')).toBe(null);
    expect(dexNumber(monsters, 'missing')).toBe(null);
    expect(dexNumber(monsters, null)).toBe(null);
  });

  test('formatDexNo zero-pads, and marks unknowns', () => {
    expect(formatDexNo(6)).toBe('№006');
    expect(formatDexNo(142)).toBe('№142');
    expect(formatDexNo(null)).toBe('№0??');
  });
});

describe('revealFlags', () => {
  test('reads nested record paths into flat booleans', () => {
    const rec = {
      identity: true,
      ac: true,
      saves: { fortitude: true, reflex: false, will: false },
      iwr: { immunities: false, resistances: true, weaknesses: false },
    };
    const f = revealFlags(rec);
    expect(f.identity).toBe(true);
    expect(f.ac).toBe(true);
    expect(f.fortitude).toBe(true);
    expect(f.reflex).toBe(false);
    expect(f.resistances).toBe(true);
    expect(f.weaknesses).toBe(false);
  });

  test('revealAll forces every flag true', () => {
    const f = revealFlags({}, true);
    expect(Object.values(f).every(Boolean)).toBe(true);
  });

  test('tolerates a missing record', () => {
    const f = revealFlags(undefined);
    expect(f.identity).toBe(false);
    expect(f.fortitude).toBe(false);
  });
});
