import PF2E_CONDITIONS from './pf2eConditions';

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
});
