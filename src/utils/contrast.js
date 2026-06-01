// WCAG 2.1 contrast ratio helpers for the GM Theme config page.

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

// Composite an rgba(r,g,b,a) value over the dark shell background (#12100e).
const SHELL_BG = { r: 18, g: 16, b: 14 };

const parseColor = (color) => {
  if (!color) return SHELL_BG;

  // rgba(r, g, b, a)
  const rgba = color.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)/);
  if (rgba) {
    const r = parseFloat(rgba[1]);
    const g = parseFloat(rgba[2]);
    const b = parseFloat(rgba[3]);
    const a = rgba[4] != null ? parseFloat(rgba[4]) : 1;
    if (a >= 1) return { r: clamp(r), g: clamp(g), b: clamp(b) };
    return {
      r: clamp(r * a + SHELL_BG.r * (1 - a)),
      g: clamp(g * a + SHELL_BG.g * (1 - a)),
      b: clamp(b * a + SHELL_BG.b * (1 - a)),
    };
  }

  // #rgb or #rrggbb
  const hex = color.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return SHELL_BG;
    return { r, g, b };
  }
  if (hex.length >= 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return SHELL_BG;
    return { r, g, b };
  }

  return SHELL_BG;
};

const relativeLuminance = ({ r, g, b }) => {
  const srgb = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
};

export const contrastRatio = (fg, bg) => {
  const L1 = relativeLuminance(parseColor(fg));
  const L2 = relativeLuminance(parseColor(bg));
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
};

export const wcagLevel = (ratio) => {
  if (ratio >= 7) return { cls: 'aaa', label: 'AAA' };
  if (ratio >= 4.5) return { cls: 'aa', label: 'AA' };
  if (ratio >= 3) return { cls: 'large', label: 'AA Large' };
  return { cls: 'fail', label: 'Fail' };
};
