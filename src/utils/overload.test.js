import { rollOverload, OVERLOAD_DC } from './overload';

describe('rollOverload', () => {
  it('exposes a DC of 10', () => {
    expect(OVERLOAD_DC).toBe(10);
  });

  it('succeeds when the d20 meets the DC', () => {
    // rng 0.5 → floor(0.5*20)+1 = 11 → success
    const r = rollOverload(() => 0.5);
    expect(r).toEqual({ roll: 11, dc: 10, success: true });
  });

  it('a natural 10 passes (>= DC)', () => {
    // rng that yields exactly 10: floor(x*20)+1 = 10 → x in [0.45, 0.5)
    const r = rollOverload(() => 0.45);
    expect(r.roll).toBe(10);
    expect(r.success).toBe(true);
  });

  it('fails below the DC', () => {
    // rng 0 → roll 1 → fail
    expect(rollOverload(() => 0)).toEqual({ roll: 1, dc: 10, success: false });
    // rng 0.4 → floor(8)+1 = 9 → fail
    expect(rollOverload(() => 0.4)).toEqual({ roll: 9, dc: 10, success: false });
  });

  it('a natural 20 passes', () => {
    const r = rollOverload(() => 0.999);
    expect(r.roll).toBe(20);
    expect(r.success).toBe(true);
  });
});
