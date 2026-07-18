// deriveDiceSet (#1490 S7) — the zero-config appearance a character's accent
// produces: accent body, luminance-picked numerals, darkened edge.
import { deriveDiceSet, DEFAULT_ENEMY_SET, DICE_MATERIALS } from './diceSets';

describe('deriveDiceSet', () => {
  test('dark accent → white numerals, darkened edge, accent body', () => {
    const set = deriveDiceSet('#c0440e');
    expect(set).toEqual({
      background: '#c0440e',
      foreground: '#ffffff',
      outline: '#000000',
      edge: '#732908',
      material: 'plastic',
    });
  });

  test('light accent → black numerals', () => {
    expect(deriveDiceSet('#e8d44f').foreground).toBe('#000000');
  });

  test('junk input falls back to the app default accent', () => {
    expect(deriveDiceSet(null).background).toBe('#c0440e');
    expect(deriveDiceSet('rgba(1,2,3,0.5)').background).toBe('#c0440e');
  });

  test('default enemy set uses a known DSN material', () => {
    expect(DICE_MATERIALS).toContain(DEFAULT_ENEMY_SET.material);
  });
});
