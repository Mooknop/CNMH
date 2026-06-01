// Maps a theme palette object to the themeable CSS custom properties
// (the THEMEABLE block in pf2e-tokens.css). Used by ContentContext to inject
// vars onto :root and by GmTheme for the live preview.

export const hexToSoft = (hex, alpha) => {
  if (!hex || hex[0] !== '#') return `rgba(192, 68, 14, ${alpha})`;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const paletteToVars = (palette = {}) => ({
  '--theme-accent': palette.accent,
  '--theme-accent-mid': palette.accentMid,
  '--theme-accent-soft': hexToSoft(palette.accent, 0.25),
  '--theme-gold': palette.gold,
  '--theme-arcane': palette.arcane,
  '--theme-verdant': palette.verdant,
  '--theme-peril': palette.peril,
  '--theme-bg': palette.bg,
  '--theme-surface': palette.surface,
  '--theme-surface-card': palette.surfaceCard,
  '--theme-text': palette.text,
  '--theme-text-secondary': palette.textSecondary,
  '--theme-text-tertiary': palette.textTertiary,
  '--theme-border': palette.border,
  '--theme-border-strong': palette.borderStrong,
});
