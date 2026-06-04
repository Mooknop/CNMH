import React from 'react';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';
import { getFocusInfo } from '../../utils/SpellUtils';

/**
 * Compact spellcasting stat trio: Atk · DC · Focus (focus as arcane slot pips).
 * @param {Object} props
 * @param {Object} props.character - Character data
 */
const SpellsHeader = ({ character }) => {
  const { spellStats, flags } = useCharacter(character);
  const { spellAttackMod, spellDC } = spellStats;

  const focusInfo = getFocusInfo(character);
  const focusMax = focusInfo?.max ?? 0;
  const showFocus = flags?.hasFocusSpells && focusMax > 0;

  // Read-only mirror of the focus-spent count owned by FocusSpellsList via the
  // same synced key, so the header pips stay in sync without duplicating writes.
  const [pointsSpent] = useLocalStorage(
    `cnmh_focus_${character?.id || 'unknown'}`,
    focusMax - (focusInfo?.current ?? focusMax)
  );
  const focusRemaining = Math.max(0, focusMax - (pointsSpent || 0));

  return (
    <div className="spellcasting-stats">
      <div className="spell-attack">
        <span className="stat-label">Atk</span>
        <span className="stat-value">
          {spellAttackMod >= 0 ? `+${spellAttackMod}` : spellAttackMod}
        </span>
      </div>
      <div className="spell-dc">
        <span className="stat-label">DC</span>
        <span className="stat-value">{spellDC}</span>
      </div>
      {showFocus && (
        <div className="focus-points">
          <span className="stat-label">Focus</span>
          <span className="slot-pips-row" aria-label={`${focusRemaining} of ${focusMax} focus points`}>
            {Array.from({ length: focusMax }, (_, i) => (
              <span
                key={i}
                className={`slot-pip${i < focusRemaining ? ' filled' : ''}`}
              />
            ))}
          </span>
        </div>
      )}
    </div>
  );
};

export default SpellsHeader;
