import { hexToSoft, paletteToVars } from './themeVars';

describe('hexToSoft', () => {
  it('converts a hex colour to rgba with the given alpha', () => {
    expect(hexToSoft('#c0440e', 0.25)).toBe('rgba(192, 68, 14, 0.25)');
  });

  it('returns a fallback rgba when hex is missing', () => {
    expect(hexToSoft(null, 0.25)).toBe('rgba(192, 68, 14, 0.25)');
    expect(hexToSoft('', 0.5)).toBe('rgba(192, 68, 14, 0.5)');
  });

  it('returns a fallback rgba when value does not start with #', () => {
    expect(hexToSoft('red', 0.1)).toBe('rgba(192, 68, 14, 0.1)');
  });

  it('handles the full 6-digit hex correctly', () => {
    const result = hexToSoft('#3d9458', 0.15);
    expect(result).toBe('rgba(61, 148, 88, 0.15)');
  });
});

describe('paletteToVars', () => {
  const palette = {
    accent: '#c0440e',
    accentMid: '#e85d1a',
    gold: '#c49a2e',
    arcane: '#7a54ba',
    verdant: '#3d9458',
    peril: '#ef5350',
    bg: '#12100e',
    surface: '#1a1612',
    surfaceCard: 'rgba(28, 24, 18, 0.82)',
    text: '#f5ede4',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textTertiary: 'rgba(255, 255, 255, 0.45)',
    border: 'rgba(255, 255, 255, 0.07)',
    borderStrong: 'rgba(255, 255, 255, 0.12)',
  };

  it('maps every palette key to the matching CSS custom property', () => {
    const vars = paletteToVars(palette);
    expect(vars['--theme-accent']).toBe('#c0440e');
    expect(vars['--theme-accent-mid']).toBe('#e85d1a');
    expect(vars['--theme-gold']).toBe('#c49a2e');
    expect(vars['--theme-arcane']).toBe('#7a54ba');
    expect(vars['--theme-verdant']).toBe('#3d9458');
    expect(vars['--theme-peril']).toBe('#ef5350');
    expect(vars['--theme-bg']).toBe('#12100e');
    expect(vars['--theme-surface']).toBe('#1a1612');
    expect(vars['--theme-surface-card']).toBe('rgba(28, 24, 18, 0.82)');
    expect(vars['--theme-text']).toBe('#f5ede4');
    expect(vars['--theme-text-secondary']).toBe('rgba(255, 255, 255, 0.7)');
    expect(vars['--theme-text-tertiary']).toBe('rgba(255, 255, 255, 0.45)');
    expect(vars['--theme-border']).toBe('rgba(255, 255, 255, 0.07)');
    expect(vars['--theme-border-strong']).toBe('rgba(255, 255, 255, 0.12)');
  });

  it('derives --theme-accent-soft from the accent hex', () => {
    const vars = paletteToVars(palette);
    expect(vars['--theme-accent-soft']).toBe('rgba(192, 68, 14, 0.25)');
  });

  it('returns undefined values when palette keys are missing', () => {
    const vars = paletteToVars({});
    expect(vars['--theme-accent']).toBeUndefined();
    expect(vars['--theme-gold']).toBeUndefined();
  });

  it('handles an empty-object palette without throwing', () => {
    expect(() => paletteToVars({})).not.toThrow();
  });

  it('handles undefined palette without throwing', () => {
    expect(() => paletteToVars()).not.toThrow();
  });
});
