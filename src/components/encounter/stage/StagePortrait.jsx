// src/components/encounter/stage/StagePortrait.jsx
// Portrait/token art for the off-turn stage (#473). Renders the art when present
// (cover-fit, authored crop via a CSS custom property — no inline geometry), and
// falls back to a monogram so a missing/loading image never breaks the layout.
// The fixed-size box is owned by the caller's className, so the fallback and the
// loaded image occupy the exact same space (no layout shift). Reused by the
// acting-combatant banner now and by reactor avatars later (#476).
import React from 'react';

const monogramOf = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';

const StagePortrait = ({ src, name, imagePosition, className = '' }) => (
  <div className={`stage-portrait ${className}`.trim()}>
    {src ? (
      <img
        className="stage-portrait-img"
        src={src}
        alt={`Portrait of ${name}`}
        style={
          imagePosition
            ? { '--portrait-pos': `${imagePosition.x ?? 50}% ${imagePosition.y ?? 0}%` }
            : undefined
        }
      />
    ) : (
      <span className="stage-portrait-mono" aria-hidden="true">
        {monogramOf(name)}
      </span>
    )}
  </div>
);

export default StagePortrait;
