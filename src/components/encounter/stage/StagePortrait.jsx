// src/components/encounter/stage/StagePortrait.jsx
// Portrait/token art for the off-turn stage (#473). Renders the art when present
// (cover-fit, authored crop via a CSS custom property — no inline geometry), and
// falls back to a monogram so a missing/loading image never breaks the layout.
// The fixed-size box is owned by the caller's className, so the fallback and the
// loaded image occupy the exact same space (no layout shift). Reused by the
// acting-combatant banner now and by reactor avatars later (#476).
//
// Juice (#1346): pass the PC's `charId` and the portrait blooms in their accent
// when a fresh ability-use event lands on cnmh_fx_global. Omit it (enemies,
// transient cards) and the hook never matches. The bloom key re-keys the root
// DOM node so rapid re-uses restart the animation — children are stateless, so
// the remount is free.
import React from 'react';
import { useFxBloom } from '../../../hooks/useFxChannel';
import Flourish from '../../fx/Flourish';

const monogramOf = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';

const StagePortrait = ({ src, name, imagePosition, className = '', charId = null }) => {
  const bloom = useFxBloom(charId);
  return (
    <div
      key={bloom ? bloom.key : 'idle'}
      className={`stage-portrait ${className}`.trim()}
      data-fx={bloom ? 'bloom' : undefined}
    >
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
      {/* Signature flourish (#1347); unknown/missing id → plain bloom only. */}
      {bloom && <Flourish id={bloom.flourish} />}
    </div>
  );
};

export default StagePortrait;
