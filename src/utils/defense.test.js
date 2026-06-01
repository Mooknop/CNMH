import { defenseDC, DEFENSE_LABELS, DEFENSE_OPTIONS } from './defense';

describe('defenseDC', () => {
  const defenses = {
    ac: 18,
    saves: { fortitude: 10, reflex: 7, will: 5 },
    immunities: [],
    resistances: [],
    weaknesses: [],
  };

  test('returns ac directly for defense "ac"', () => {
    expect(defenseDC(defenses, 'ac')).toBe(18);
  });

  test('returns 10 + modifier for each save', () => {
    expect(defenseDC(defenses, 'fortitude')).toBe(20);
    expect(defenseDC(defenses, 'reflex')).toBe(17);
    expect(defenseDC(defenses, 'will')).toBe(15);
  });

  test('returns null when ac is null', () => {
    expect(defenseDC({ ac: null, saves: {} }, 'ac')).toBeNull();
  });

  test('returns null when save modifier is null', () => {
    expect(defenseDC({ ac: 18, saves: { fortitude: null } }, 'fortitude')).toBeNull();
  });

  test('returns null when defenses is null or undefined', () => {
    expect(defenseDC(null, 'ac')).toBeNull();
    expect(defenseDC(undefined, 'reflex')).toBeNull();
  });

  test('handles a save modifier of 0', () => {
    expect(defenseDC({ saves: { will: 0 } }, 'will')).toBe(10);
  });

  test('handles negative save modifier', () => {
    expect(defenseDC({ saves: { reflex: -2 } }, 'reflex')).toBe(8);
  });
});

describe('DEFENSE_LABELS', () => {
  test('has a label for each defense type', () => {
    expect(DEFENSE_LABELS.ac).toBe('AC');
    expect(DEFENSE_LABELS.fortitude).toBe('Fortitude DC');
    expect(DEFENSE_LABELS.reflex).toBe('Reflex DC');
    expect(DEFENSE_LABELS.will).toBe('Will DC');
  });
});

describe('DEFENSE_OPTIONS', () => {
  test('includes all four options', () => {
    const values = DEFENSE_OPTIONS.map((o) => o.value);
    expect(values).toEqual(['ac', 'fortitude', 'reflex', 'will']);
  });
});
