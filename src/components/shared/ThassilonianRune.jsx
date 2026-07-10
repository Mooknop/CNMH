import React from 'react';
import { runeForName } from '../../utils/thassilonianRunes';
import './GameGlyph.css';

// Inline renderer for a Thassilonian sin/virtue rune (see
// utils/thassilonianRunes.js). Same contract as GameGlyph: sizes to 1em via
// the .game-glyph class and paints with `currentColor`, so callers control
// size via font-size/width and color via `color`. Decorative by default;
// pass `title` to make it a labelled image.
const ThassilonianRune = ({ name, className = '', title }) => {
  const rune = runeForName(name);
  if (!rune) return null;
  const cls = ['game-glyph', 'thassilonian-rune', className].filter(Boolean).join(' ');
  return (
    <svg
      className={cls}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
    >
      {title && <title>{title}</title>}
      <path fill="currentColor" fillRule="evenodd" d={rune.d} />
    </svg>
  );
};

export default ThassilonianRune;
