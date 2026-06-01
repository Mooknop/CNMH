import { contrastRatio, wcagLevel } from './contrast';

describe('wcagLevel', () => {
  it('returns AAA for ratio >= 7', () => {
    expect(wcagLevel(7).cls).toBe('aaa');
    expect(wcagLevel(21).label).toBe('AAA');
  });

  it('returns AA for ratio between 4.5 and 7', () => {
    expect(wcagLevel(4.5).cls).toBe('aa');
    expect(wcagLevel(6.9).label).toBe('AA');
  });

  it('returns AA Large for ratio between 3 and 4.5', () => {
    expect(wcagLevel(3).cls).toBe('large');
    expect(wcagLevel(4.49).label).toBe('AA Large');
  });

  it('returns Fail for ratio below 3', () => {
    expect(wcagLevel(1).cls).toBe('fail');
    expect(wcagLevel(2.9).label).toBe('Fail');
  });
});

describe('contrastRatio', () => {
  it('returns 1 for identical colors', () => {
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 1);
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 1);
  });

  it('returns ~21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('returns ~21 for white on black', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });

  it('accepts 3-digit hex shorthand', () => {
    const full = contrastRatio('#ffffff', '#000000');
    const short = contrastRatio('#fff', '#000');
    expect(short).toBeCloseTo(full, 1);
  });

  it('accepts rgba() colors (fully opaque)', () => {
    const ratio = contrastRatio('rgba(255, 255, 255, 1)', 'rgba(0, 0, 0, 1)');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('composites semi-transparent rgba over the dark shell background', () => {
    // rgba(255,255,255,0.07) is very close to the bg; ratio should be low
    const ratio = contrastRatio('rgba(255,255,255,0.07)', '#12100e');
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(3);
  });

  it('handles null/undefined gracefully — falls back to shell bg', () => {
    // Both fallback to shell bg → ratio ≈ 1
    const ratio = contrastRatio(null, null);
    expect(ratio).toBeCloseTo(1, 1);
  });

  it('handles unknown color string gracefully — returns a finite number', () => {
    const ratio = contrastRatio('notacolor', 'notacolor');
    expect(Number.isFinite(ratio)).toBe(true);
    expect(ratio).toBeGreaterThanOrEqual(1);
  });

  it('is symmetric', () => {
    const a = contrastRatio('#c0440e', '#1a1612');
    const b = contrastRatio('#1a1612', '#c0440e');
    expect(a).toBeCloseTo(b, 5);
  });
});
