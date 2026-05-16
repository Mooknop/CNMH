import PF2E_CONDITIONS, {
  getCondition,
  hydrateCondition,
  hydrateConditions,
} from './pf2eConditions';

describe('pf2eConditions', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(PF2E_CONDITIONS)).toBe(true);
    expect(PF2E_CONDITIONS.length).toBeGreaterThan(20);
  });

  it('all conditions have required string fields', () => {
    PF2E_CONDITIONS.forEach((cond) => {
      expect(typeof cond.id).toBe('string');
      expect(typeof cond.name).toBe('string');
      expect(typeof cond.summary).toBe('string');
      expect(typeof cond.effect).toBe('function');
    });
  });

  it('valued conditions have a positive maxValue', () => {
    PF2E_CONDITIONS.filter((c) => c.valued).forEach((cond) => {
      expect(cond.maxValue).toBeGreaterThan(0);
    });
  });

  it('effect functions return non-empty strings for all conditions', () => {
    PF2E_CONDITIONS.forEach((cond) => {
      const result = cond.valued ? cond.effect(1) : cond.effect(null);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  it('valued condition effects incorporate the value', () => {
    const valued = PF2E_CONDITIONS.filter((c) => c.valued);
    valued.forEach((cond) => {
      const at1 = cond.effect(1);
      const at3 = cond.effect(3);
      // Different numeric values should produce different effect text
      expect(at1).not.toBe(at3);
    });
  });

  it('each condition has a unique id', () => {
    const ids = PF2E_CONDITIONS.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  describe('specific condition spot-checks', () => {
    it('Frightened is valued, decrements, and scales with value', () => {
      const cond = PF2E_CONDITIONS.find((c) => c.id === 'frightened');
      expect(cond.valued).toBe(true);
      expect(cond.decrements).toBe(true);
      expect(cond.effect(2)).toContain('2');
      expect(cond.effect(4)).toContain('4');
    });

    it('Off-Guard is a toggle with a non-empty effect', () => {
      const cond = PF2E_CONDITIONS.find((c) => c.id === 'off-guard');
      expect(cond.valued).toBe(false);
      expect(typeof cond.effect(null)).toBe('string');
      expect(cond.effect(null).length).toBeGreaterThan(0);
    });

    it('Clumsy is valued and affects Dex', () => {
      const cond = PF2E_CONDITIONS.find((c) => c.id === 'clumsy');
      expect(cond.valued).toBe(true);
      expect(cond.effect(1)).toContain('1');
    });

    it('Drained is valued and mentions HP', () => {
      const cond = PF2E_CONDITIONS.find((c) => c.id === 'drained');
      expect(cond.valued).toBe(true);
      expect(cond.effect(2).toLowerCase()).toContain('hp');
    });

    it('Fatigued is a toggle condition', () => {
      const cond = PF2E_CONDITIONS.find((c) => c.id === 'fatigued');
      expect(cond.valued).toBe(false);
      expect(typeof cond.effect(null)).toBe('string');
    });

    it('Prone is a toggle condition', () => {
      const cond = PF2E_CONDITIONS.find((c) => c.id === 'prone');
      expect(cond.valued).toBe(false);
      expect(typeof cond.effect(null)).toBe('string');
    });

    it('Stupefied is valued', () => {
      const cond = PF2E_CONDITIONS.find((c) => c.id === 'stupefied');
      expect(cond.valued).toBe(true);
      expect(cond.effect(3)).toContain('3');
    });

    it('Encumbered is a toggle condition', () => {
      const cond = PF2E_CONDITIONS.find((c) => c.id === 'encumbered');
      expect(cond.valued).toBe(false);
      expect(typeof cond.effect(null)).toBe('string');
    });
  });

  describe('hydration helpers', () => {
    it('getCondition returns the definition for a known id', () => {
      const cond = getCondition('frightened');
      expect(cond).toBeDefined();
      expect(cond.id).toBe('frightened');
      expect(typeof cond.effect).toBe('function');
    });

    it('getCondition returns undefined for an unknown id', () => {
      expect(getCondition('nope')).toBeUndefined();
    });

    it('hydrateCondition restores static fields and keeps the stored value', () => {
      const hydrated = hydrateCondition({ id: 'clumsy', value: 2 });
      expect(hydrated.name).toBe('Clumsy');
      expect(hydrated.maxValue).toBe(4);
      expect(hydrated.value).toBe(2);
      expect(typeof hydrated.effect).toBe('function');
      expect(hydrated.effect(2)).toContain('2');
    });

    it('hydrateCondition returns null for an unknown id', () => {
      expect(hydrateCondition({ id: 'xxx', value: 1 })).toBeNull();
      expect(hydrateCondition(undefined)).toBeNull();
    });

    it('hydrateConditions defaults to an empty array and drops unknown ids', () => {
      expect(hydrateConditions()).toEqual([]);
      const result = hydrateConditions([
        { id: 'clumsy', value: 2 },
        { id: 'xxx', value: 1 },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('clumsy');
    });

    it('reproduces the sync bug: a JSON round-trip still yields a working effect', () => {
      // Functions do not survive JSON; hydration must restore them.
      const stored = [
        { id: 'blinded', value: null },
        { id: 'clumsy', value: 3 },
      ];
      const roundTripped = JSON.parse(JSON.stringify(stored));
      expect(typeof roundTripped[0].effect).toBe('undefined');

      const hydrated = hydrateConditions(roundTripped);
      expect(typeof hydrated[0].effect).toBe('function');
      expect(hydrated[0].effect(null).length).toBeGreaterThan(0);
      expect(hydrated[1].effect(hydrated[1].value)).toContain('3');
    });
  });
});
