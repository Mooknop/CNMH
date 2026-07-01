import React from 'react';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';
import { useVeracious } from '../../hooks/useVeracious';
import { getFocusInfo } from '../../utils/SpellUtils';

/**
 * Compact spellcasting stat trio: Atk · DC · Focus (focus as arcane slot pips).
 * @param {Object} props
 * @param {Object} props.character - Character data
 */
const SpellsHeader = ({ character }) => {
  const { spellStats, flags, inventory } = useCharacter(character);
  const { spellAttackMod, spellDC } = spellStats;

  // Veracious Spell (#967 R7): an invested power ring lets a player arm the
  // ring's item bonus onto their NEXT spell attack. Display-only — it boosts the
  // shown Atk (never the DC) while armed and surfaces a reminder.
  const { itemBonus, imbuedRunes, armed, arm, disarm } = useVeracious(character?.id, inventory || []);
  const veracious = itemBonus > 0; // a power ring is invested with a bonus
  const shownAtk = spellAttackMod + (armed ? itemBonus : 0);

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
        <span className={`stat-value${armed ? ' is-boosted' : ''}`}>
          {shownAtk >= 0 ? `+${shownAtk}` : shownAtk}
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
      {veracious && (
        <div className={`veracious${armed ? ' is-armed' : ''}`} data-testid="veracious-control">
          <button
            type="button"
            className="veracious-toggle"
            aria-pressed={armed}
            onClick={armed ? disarm : arm}
          >
            {armed ? `Veracious Spell armed · +${itemBonus} to next spell attack` : 'Arm Veracious Spell'}
          </button>
          {armed && imbuedRunes.length > 0 && (
            <span className="veracious-runes">
              Imbued: {imbuedRunes.join(', ')} — effects apply to a spell attack modified by Veracious Spell.
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default SpellsHeader;
