import React from 'react';
import './RankRing.css';

const RANK_LABELS = ['Untrained', 'Trained', 'Expert', 'Master', 'Legendary'];

/**
 * Mini proficiency rank-ring (Ability Dial S2) — a circular badge whose
 * border color IS the proficiency rank (--color-rank-*, load-bearing),
 * echoing the dial itself: modifier inside the ring, name below, optional
 * caption under the name. Lay a set of these out inside a `.snode-wrap`.
 *
 * Interactive when `onClick` is passed (skill snodes toggle a detail strip);
 * otherwise a static display node (proficiency clusters).
 *
 * @param {number} rank     - 0 (Untrained) … 4 (Legendary); drives ring color
 * @param {node}   value    - shown inside the ring (usually a PenaltyDisplay)
 * @param {string} name     - label under the ring
 * @param {string} caption  - optional second line (e.g. "Ranged +9", "+2 item")
 * @param {node}   hint     - optional trailing node (conditional 'vs X' hints)
 * @param {boolean} selected - accent-glows the ring; aria-expanded on buttons
 */
const RankRing = ({ rank = 0, value, name, caption, hint, selected = false, onClick }) => {
  const rankLabel = RANK_LABELS[rank] ?? RANK_LABELS[0];
  const className = `snode rank-${rank}${selected ? ' sel' : ''}`;
  const body = (
    <>
      <span className="ring">{value}</span>
      <span className="snode-name">{name}</span>
      {caption && <span className="snode-caption">{caption}</span>}
      {hint}
    </>
  );

  if (!onClick) {
    return (
      <div className={className} aria-label={`${name}, ${rankLabel}`}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-label={`${name}, ${rankLabel}`}
      aria-expanded={selected}
      onClick={onClick}
    >
      {body}
    </button>
  );
};

export default RankRing;
