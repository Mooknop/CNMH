import React from 'react';
import { GAME_GLYPHS } from '../../utils/gameGlyphs';
import './GameGlyph.css';

// Inline renderer for a game-icon glyph (see utils/gameGlyphs.js). Sizes to 1em
// and paints with `currentColor`, so a caller controls size via font-size/width
// and color via `color` — the same knobs the tile/pip tints already use.
// Decorative by default; pass `title` to make it a labelled image.
const GameGlyph = ({ name, className = '', title }) => {
  const d = GAME_GLYPHS[name];
  if (!d) return null;
  const cls = ['game-glyph', className].filter(Boolean).join(' ');
  return (
    <svg
      className={cls}
      viewBox="0 0 512 512"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
    >
      {title && <title>{title}</title>}
      <path fill="currentColor" d={d} />
    </svg>
  );
};

export default GameGlyph;
