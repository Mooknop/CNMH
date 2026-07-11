import React from 'react';
import { resolveRuneIcon } from '../../utils/runeIcons';
import './GameGlyph.css';
import './RuneIcon.css';

// Inline renderer for a catalog rune's glyph (utils/runeIcons.js — epic
// #1369). Same contract as GameGlyph/ThassilonianRune: sizes to 1em via the
// .game-glyph class and paints with `currentColor`, so callers control size
// via font-size/width and color via `color`. Decorative by default; pass
// `title` to make it a labelled image. `tint` opts into the family's
// --runeicon-* token (RuneIcon.css); families without a token — and the
// generic fallback mark — stay currentColor.
//
// Tier layers render as SIBLING paths (each with its own evenodd fill) so a
// layer's cutouts never knock holes in another layer.
const RuneIcon = ({ runeId, className = '', title, tint = false }) => {
  const icon = resolveRuneIcon(runeId);
  if (!icon) return null;
  const cls = ['game-glyph', 'rune-icon', tint && !icon.generic ? 'runeicon-tint' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      className={cls}
      data-runeicon={icon.generic ? 'generic' : icon.family}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
    >
      {title && <title>{title}</title>}
      {icon.layers.map((d, i) => (
        <path key={i} fill="currentColor" fillRule="evenodd" d={d} />
      ))}
    </svg>
  );
};

export default RuneIcon;
