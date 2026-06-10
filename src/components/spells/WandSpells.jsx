import React from 'react';
import { organizeSpellsByRank, getSortedRankList, filterSpellsByDefense } from '../../utils/SpellUtils';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';
import SpellCard from './SpellCard';

const WandInfoBox = ({ themeColor }) => (
  <div className="bloodline-info">
    <h3 >Using Wands</h3>
    <p className="bloodline-description">
      To cast a spell from a wand, you must hold the wand in one hand and activate it with a Cast a Spell activity.
      This uses the spell's normal number of actions. A spell cast from a wand has the standard effects of that spell for someone
      of your level, without the need to meet the spell's requirements. A wand's spells are automatically heightened to half the
      wand's level rounded up. Each wand can be used to cast its spell only once per day without risking the wand's destruction.
    </p>
    <div className="bloodline-magic">
      <span className="bloodline-magic-label">Overcharging Wands:</span>
      <span className="bloodline-magic-effect">
        After the spell is cast from the wand for the day, you can attempt to cast it one more time—overcharging the wand at the risk of destroying it.
        Cast the Spell again, then roll a DC 10 flat check. On a success, the wand is broken.
        On a failure, the wand is destroyed.
        If anyone tries to overcharge a wand when it's already been overcharged that day, the wand is automatically destroyed (even if it had been repaired) and no spell is cast.
      </span>
    </div>
  </div>
);

const wandKey = (spell) => spell.wandName || spell.id;

// State cycle per wand: 'available' → 'used' → 'overcharged' → 'available'
const WandSpells = ({ spells, themeColor, defenseFilter, activeSpellRank, character, onCast }) => {
  const characterKey = character?.id || 'unknown';
  const [wandStates, setWandStates] = useLocalStorage(
    `cnmh_wands_${characterKey}`,
    () => Object.fromEntries(spells.map(s => [wandKey(s), 'available']))
  );

  const handleSlotClick = (key) => {
    setWandStates(prev => ({
      ...prev,
      [key]: prev[key] === 'available' ? 'used' : 'available',
    }));
  };

  const handleOvercharge = (key) => {
    setWandStates(prev => ({ ...prev, [key]: 'overcharged' }));
  };

  const handleReset = (key) => {
    setWandStates(prev => ({ ...prev, [key]: 'available' }));
  };

  const filtered = filterSpellsByDefense(spells, defenseFilter);
  const spellsByRank = organizeSpellsByRank(filtered);
  const ranksToShow = getSortedRankList(
    Object.keys(spellsByRank).filter(r => spellsByRank[r].length > 0)
  ).slice(1).filter(r => activeSpellRank === 'all' || r === activeSpellRank);

  const hasActiveFilter = activeSpellRank !== 'all' || defenseFilter !== 'all';

  return (
    <div className="spells-container">
      <WandInfoBox themeColor={themeColor} />

      {ranksToShow.map(rank => (
        <div className="repertoire-rank-section" key={rank}>
          <div className="rank-section-header">
            <span className="rank-label">
              {rank === 'cantrips' ? 'Cantrips' : `Rank ${rank}`}
            </span>
          </div>
          <div className="spells-grid">
            {spellsByRank[rank].map(spell => {
              const key = wandKey(spell);
              const state = wandStates[key] ?? 'available';
              return (
                <div className="wand-card-wrap" key={key}>
                  <SpellCard
                    spell={spell}
                    themeColor={themeColor}
                    character={character}
                    encounterMode={!!onCast}
                    onCast={onCast}
                  />
                  <div className="wand-control">
                    {state !== 'overcharged' ? (
                      <button
                        className={`slot-bubble ${state === 'available' ? 'slot-filled' : 'slot-empty'}`}
                        onClick={() => handleSlotClick(key)}
                        aria-label={state === 'available' ? 'Available charge' : 'Spent charge'}
                      />
                    ) : (
                      <button
                        className="slot-bubble wand-overcharged-slot"
                        onClick={() => handleReset(key)}
                        aria-label="Reset wand"
                      />
                    )}
                    {state === 'available' && <span className="wand-control-label">Charged</span>}
                    {state === 'used' && (
                      <button
                        className="wand-overcharge-btn"
                        onClick={() => handleOvercharge(key)}
                      >
                        Overcharge
                      </button>
                    )}
                    {state === 'overcharged' && (
                      <span
                        className="wand-overcharged-label"
                        role="button"
                        tabIndex={0}
                        onClick={() => handleReset(key)}
                        onKeyDown={e => e.key === 'Enter' && handleReset(key)}
                      >
                        Overcharged — tap to reset
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {ranksToShow.length === 0 && (
        <div className="empty-state">
          <p>
            {hasActiveFilter
              ? 'No wands matching your current filters.'
              : 'No wands in inventory.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default WandSpells;
