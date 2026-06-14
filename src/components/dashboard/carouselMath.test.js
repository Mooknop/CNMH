import {
  SPACING,
  clampIndex,
  dragFraction,
  resolveRelease,
  cardStyleForOffset,
} from './carouselMath';

describe('clampIndex', () => {
  it('clamps below 0 and above n-1', () => {
    expect(clampIndex(-3, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
  });
  it('passes through in-range values', () => {
    expect(clampIndex(2, 5)).toBe(2);
  });
});

describe('dragFraction', () => {
  it('maps a one-slot left drag to +1 (advance)', () => {
    expect(dragFraction(-SPACING, 0, 5)).toBeCloseTo(1, 5);
  });
  it('maps a one-slot right drag to -1 from the middle', () => {
    expect(dragFraction(SPACING, 2, 5)).toBeCloseTo(-1, 5);
  });
  it('applies end-resistance past the first card', () => {
    // dragging right at index 0 projects to -1, dampened ×0.35
    expect(dragFraction(SPACING, 0, 5)).toBeCloseTo(-0.35, 5);
  });
  it('applies end-resistance past the last card', () => {
    // dragging left at index 4 (n=5) projects to 5, dampened ×0.35
    expect(dragFraction(-SPACING, 4, 5)).toBeCloseTo(0.35, 5);
  });
});

describe('resolveRelease', () => {
  it('rounds to the nearest slot and clamps', () => {
    expect(resolveRelease(0, 0.6, 5)).toBe(1);
    expect(resolveRelease(0, 0.4, 5)).toBe(0);
    expect(resolveRelease(4, 0.35, 5)).toBe(4); // resistance never overshoots the end
    expect(resolveRelease(0, -0.35, 5)).toBe(0);
  });
});

describe('cardStyleForOffset', () => {
  it('renders the centered card at full scale/opacity', () => {
    const s = cardStyleForOffset(0);
    expect(s.culled).toBe(false);
    expect(s.translateX).toBe(0);
    expect(s.scale).toBe(1);
    expect(s.opacity).toBe(1);
    expect(s.blur).toBe(0);
    expect(s.brightness).toBe(1);
    expect(s.zIndex).toBe(100);
  });
  it('dims, shrinks and blurs a one-slot neighbour', () => {
    const s = cardStyleForOffset(1);
    expect(s.culled).toBe(false);
    expect(s.scale).toBeCloseTo(0.86, 5);
    expect(s.opacity).toBeCloseTo(0.58, 5);
    expect(s.blur).toBeCloseTo(1.92, 5);
    expect(s.brightness).toBeCloseTo(0.72, 5);
    expect(s.zIndex).toBe(90);
    expect(s.translateX).toBeCloseTo(SPACING, 5);
  });
  it('culls cards beyond 2.2 slots from center', () => {
    expect(cardStyleForOffset(2.5).culled).toBe(true);
    expect(cardStyleForOffset(-3).culled).toBe(true);
  });
});
