import React from 'react';
import { organizeSpellsByRank, getSortedRankList, filterSpellsByDefense } from '../../utils/SpellUtils';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';
import SpellCard from './SpellCard';
import { APP, syncKey } from '../../sync/keys';

const StaffInfoBox = ({ themeColor }) => (
  <div className="bloodline-info">
    <h3 >Staff Rules</h3>
    <p className="bloodline-description">
      Staves hold no charges on their own. Each day during your daily preparations you can prepare a
      single staff, giving it a number of charges equal to the highest spell rank you can cast. You can
      add even more charges by expending some of your own spell slots, each adding charges equal to its
      rank. You can use these charges to cast spells from the staff.
    </p>
    <div className="bloodline-magic">
      <span className="bloodline-magic-effect">
        A spontaneous spellcaster—such as a bard, oracle, or sorcerer—can reduce the number of charges it takes to Activate a staff by supplementing it with their own energy.
        When a spontaneous spellcaster Activates a staff, they can expend 1 charge from the staff and one of their spell slots to cast a spell from the staff of the same rank (or lower) as the expended spell slot.
        This doesn't change the number of actions it takes to cast the spell.
      </span>
    </div>
  </div>
);

const StaffSpells = ({ staff, spells, themeColor, characterLevel, defenseFilter, activeSpellRank, character, prepared = true, onCast }) => {
  const chargesMax = staff.charges?.max ?? 0;
  const [chargesSpent, setChargesSpent] = useLocalStorage(
    syncKey(APP.STAFF, character?.id || 'unknown'),
    chargesMax - (staff.charges?.current ?? chargesMax)
  );

  const handleChargeClick = (i) => {
    const available = chargesMax - chargesSpent;
    if (i < available) {
      setChargesSpent(prev => Math.min(prev + 1, chargesMax));
    } else {
      setChargesSpent(prev => Math.max(prev - 1, 0));
    }
  };

  // Staff spells are gated on the staff being held (useCharacter stamps the
  // same `active` on every staff spell from the matching inventory entry).
  // active === false ⇒ show but disabled.
  const inactive = spells.length > 0 && spells.every((s) => s.active === false);

  const filtered = filterSpellsByDefense(spells, defenseFilter);
  const spellsByRank = organizeSpellsByRank(filtered);
  const ranksToShow = getSortedRankList(
    Object.keys(spellsByRank).filter(r => spellsByRank[r].length > 0)
  ).slice(1).filter(r => activeSpellRank === 'all' || r === activeSpellRank);

  const hasActiveFilter = activeSpellRank !== 'all' || defenseFilter !== 'all';

  return (
    <div className={`spells-container${inactive ? ' is-inactive' : ''}`}>
      <StaffInfoBox themeColor={themeColor} />

      {inactive && (
        <div className="ability-inactive-hint">
          Not in hand — hold the staff to cast its spells.
        </div>
      )}

      {!inactive && !prepared && (
        <div className="ability-inactive-hint">
          Not prepared today — prepare this staff during your daily preparations to charge it.
        </div>
      )}

      {chargesMax > 0 && (
        <div className="staff-charges-section">
          <div className="rank-section-header">
            <span className="rank-label" >Charges</span>
            <div className="slot-bubbles">
              {Array.from({ length: chargesMax }, (_, i) => {
                const isFilled = i < chargesMax - chargesSpent;
                return (
                  <button
                    key={i}
                    className={`slot-bubble ${isFilled ? 'slot-filled' : 'slot-empty'}`}
                    onClick={() => handleChargeClick(i)}
                    aria-label={isFilled ? 'Available slot' : 'Spent slot'}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {ranksToShow.map(rank => (
        <div className="repertoire-rank-section" key={rank}>
          <div className="rank-section-header">
            <span className="rank-label">
              {rank === 'cantrips' ? 'Cantrips' : `Rank ${rank}`}
            </span>
          </div>
          <div className="spells-grid">
            {spellsByRank[rank].map(spell => (
              <SpellCard
                key={spell.id || spell.name}
                spell={spell}
                themeColor={themeColor}
                character={character}
                encounterMode={!!onCast}
                onCast={onCast}
              />
            ))}
          </div>
        </div>
      ))}

      {ranksToShow.length === 0 && (
        <div className="empty-state">
          <p>
            {hasActiveFilter
              ? 'No staff spells matching your current filters.'
              : 'This staff has no spells.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default StaffSpells;
