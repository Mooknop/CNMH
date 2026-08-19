import React from 'react';
import { useBystander } from '../../hooks/useBystander';
import './BystanderChip.css';

/**
 * Harmless Bystander badge for one PC in the order strip (#226 Slice D, #465).
 * A child component (the AuraChip/OmenChip/StanceChip pattern) so each entry
 * holds its own synced subscription to cnmh_bystander_<charId>; renders nothing
 * unless the PC has declared it for this encounter.
 *
 * Two states now (#465): still hiding (non-allies can't react against them) and
 * recognized — she took a hostile action, so reactions are live again and the
 * creatures that watched are immune to the trick for a day.
 *
 * @param {Object} entry - Encounter order entry ({ entryId, name, kind, charId? })
 */
const BystanderChip = ({ entry }) => {
  const { active, revealed } = useBystander(entry?.charId);

  if (entry?.kind !== 'pc' || !active) return null;

  const title = revealed
    ? `${entry.name} was observed taking a hostile action — Harmless Bystander has ended. `
      + 'Non-allies may react against them again, and every creature that watched is '
      + 'immune to their Harmless Bystander for 1 day.'
    : `${entry.name} declared Harmless Bystander (rolled Deception for initiative). `
      + 'Non-allies must Sense Motive to realize they are hostile and cannot react '
      + 'against them until they take a hostile action; once observed being hostile, '
      + 'those creatures are immune to this for 1 day.';

  return (
    <span
      className={`ttp-bystander-chip${revealed ? ' ttp-bystander-chip--revealed' : ''}`}
      title={title}
      data-testid={`bystander-chip-${entry.charId}`}
      aria-label={
        revealed
          ? `${entry.name} was recognized as hostile — Harmless Bystander ended`
          : `${entry.name} declared Harmless Bystander`
      }
    >
      {revealed ? '🎭❗' : '🎭'}
    </span>
  );
};

export default BystanderChip;
