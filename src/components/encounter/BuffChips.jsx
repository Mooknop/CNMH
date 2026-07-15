import React from 'react';
import { useEffects } from '../../hooks/useEffects';
import { useContent } from '../../contexts/ContentContext';
import { chipsForEffects } from '../../utils/effectChips';
import './BuffChips.css';

/**
 * Buff badges for one PC in the order strip. A child component (the
 * AuraChip/PlayingChip pattern) so each entry holds its own synced subscription
 * to cnmh_effects_<charId> plus the Foundry read-back; renders one chip per
 * distinct chip-worthy buff (e.g. ♪ Inspired while Courageous Anthem is up)
 * and nothing when the PC carries none. Which buffs are chip-worthy lives in
 * effectChips.js — the strip stays sparse by default.
 *
 * @param {Object} entry - Encounter order entry ({ entryId, name, kind, charId? })
 */
const BuffChips = ({ entry }) => {
  const { effects } = useEffects(entry?.charId || 'none');
  const { effects: catalog } = useContent();

  if (entry?.kind !== 'pc') return null;
  const chips = chipsForEffects(effects, catalog);
  if (chips.length === 0) return null;

  return chips.map((chip) => (
    <span
      key={chip.label}
      className="ttp-buff-chip"
      title={chip.title || chip.effectName}
      aria-label={`${entry.name} has ${chip.effectName}`}
    >
      {chip.symbol ? `${chip.symbol} ` : ''}{chip.label}
    </span>
  ));
};

export default BuffChips;
