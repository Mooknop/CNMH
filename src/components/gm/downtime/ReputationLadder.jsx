import React from 'react';
import { ladderBounds, ladderSegments, segmentTone } from '../../../utils/reputation';

// The Reputation view's one genuinely new visual primitive (#1855): a 7-band
// strip of a faction's GMG rank ladder (or the faction's own authored `ranks`,
// when it has them — see utils/reputation.js `ladderSegments`) with a marker
// pinned at the exact score. Pure/stateless — every value here is derived from
// `faction` + `rep` at render, per the redesign's "derived, never stored" rule.
//
// `flashFx` is spread onto the active segment for a rank-change highlight
// (FactionCard computes it via useValueFlash on the rank name); segments also
// carry their own short CSS transition (DowntimeViews.css) so a rank change
// reads as a change even under prefers-reduced-motion, which strips the
// data-fx keyframe.
const ReputationLadder = ({ faction, rep, flashFx }) => {
  const segments = ladderSegments(faction);
  const { min, max } = ladderBounds(faction);
  const span = max - min || 1;
  const clamped = Math.min(Math.max(typeof rep === 'number' ? rep : 0, min), max);
  const markerPct = ((clamped - min) / span) * 100;
  const activeIndex = segments.findIndex((seg) => rep >= seg.min && rep <= seg.max);

  return (
    <div className="dock-dt-ladder">
      <div className="dock-dt-ladder-track">
        {segments.map((seg, i) => {
          const active = i === activeIndex;
          const toneClass = active ? ` dock-dt-ladder-seg--active dock-dt-ladder-seg--${segmentTone(seg)}` : '';
          return (
            <span
              key={`${seg.name}-${seg.min}`}
              className={`dock-dt-ladder-seg${toneClass}`}
              style={{ flex: seg.span }}
              title={seg.name}
              data-fx={active ? flashFx : undefined}
            >
              {seg.abbr}
            </span>
          );
        })}
      </div>
      <span
        className="dock-dt-ladder-marker"
        style={{ left: `${markerPct}%` }}
        aria-hidden="true"
      />
    </div>
  );
};

export default ReputationLadder;
