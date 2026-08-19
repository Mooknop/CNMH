import React from 'react';
import { useBystander } from '../../hooks/useBystander';
import { armedSenseMotiveHint } from '../../utils/bystander';
import './BystanderNotice.css';

/**
 * Player-side read-out for a live Harmless Bystander declaration (#465). Shown
 * under the initiative toggle so the table can see, at declaration time, what
 * the feat is actually doing right now:
 *
 *   • whether non-allies still can't react against her (or she's been made),
 *   • which creatures in THIS encounter are already immune — they watched her
 *     turn hostile within the last day, so the disguise never worked on them,
 *   • the +4 circumstance bonus their Sense Motive gets while she's visibly
 *     wielding a weapon.
 *
 * Props only (no context beyond the synced flag) so the surfaces that host it
 * decide where the order and the resolved inventory come from.
 *
 * @param {string} charId    - the declaring PC
 * @param {Array}  order     - live encounter order (observers are its enemies)
 * @param {Array}  inventory - resolved inventory (useCharacter output) for the
 *                             armed hint; omit to skip it
 */
const BystanderNotice = ({ charId, order = [], inventory = [] }) => {
  const { active, revealed, immuneIn } = useBystander(charId);
  if (!active) return null;

  const immune = immuneIn(order);
  const armed = armedSenseMotiveHint(inventory);

  return (
    <div
      className={`bystander-notice${revealed ? ' bystander-notice--revealed' : ''}`}
      role="note"
      aria-label="Harmless Bystander status"
      data-testid="bystander-notice"
    >
      <p className="bystander-notice-line">
        {revealed
          ? 'You were observed taking a hostile action — Harmless Bystander has ended for this fight.'
          : 'Non-allies must Sense Motive to realize you are hostile, and cannot use reactions against you until you take a hostile action.'}
      </p>

      {!revealed && armed.armed && (
        <p className="bystander-notice-line bystander-notice-line--warn" data-testid="bystander-armed-hint">
          +{armed.bonus} circumstance bonus to their Sense Motive — you are visibly
          wielding {armed.weapons.join(' and ')}.
        </p>
      )}

      {immune.length > 0 && (
        <p className="bystander-notice-line bystander-notice-line--warn" data-testid="bystander-immune-list">
          Already wise to it (temporarily immune for 1 day):{' '}
          {immune.map((o) => o.name).join(', ')}.
        </p>
      )}
    </div>
  );
};

export default BystanderNotice;
