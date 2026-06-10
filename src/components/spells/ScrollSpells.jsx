import React from 'react';
import { organizeSpellsByRank, getSortedRankList, filterSpellsByDefense } from '../../utils/SpellUtils';
import SpellCard from './SpellCard';
import { useCastingResources } from '../../hooks/useCastingResources';

const ScrollSpells = ({ spells, themeColor, characterLevel, defenseFilter, activeSpellRank, character, onCast }) => {
  // Scroll copies live in GM-authored inventory; consumption is the
  // player-writable overlay. The pip row doubles as the manual undo for
  // mis-taps (mirrors the wand control).
  const { consumables } = useCastingResources(character);

  const filtered = filterSpellsByDefense(spells, defenseFilter);
  const spellsByRank = organizeSpellsByRank(filtered);
  const ranksToShow = getSortedRankList(
    Object.keys(spellsByRank).filter(r => spellsByRank[r].length > 0)
  ).slice(1).filter(r => activeSpellRank === 'all' || r === activeSpellRank);

  const hasActiveFilter = activeSpellRank !== 'all' || defenseFilter !== 'all';

  const handlePipClick = (name, i, remaining) => {
    if (i < remaining) consumables.spend(name);
    else consumables.restore(name);
  };

  return (
    <div className="spells-container">
      {ranksToShow.map(rank => (
        <div className="repertoire-rank-section" key={rank}>
          <div className="rank-section-header">
            <span className="rank-label">
              {rank === 'cantrips' ? 'Cantrips' : `Rank ${rank}`}
            </span>
          </div>
          <div className="spells-grid">
            {spellsByRank[rank].map(spell => {
              const name = spell.scrollName || spell.name;
              const remaining = consumables.remainingFor(name);
              const consumedCount = consumables.map[name] || 0;
              const total = remaining + consumedCount;
              const usedUp = remaining === 0;
              return (
                <div className="wand-card-wrap" key={`${spell.id}-scroll`}>
                  <SpellCard
                    spell={spell}
                    themeColor={themeColor}
                    characterLevel={characterLevel}
                    character={character}
                    encounterMode={!!onCast}
                    onCast={usedUp ? undefined : onCast}
                  />
                  <div className="wand-control">
                    {Array.from({ length: total }, (_, i) => (
                      <button
                        key={i}
                        className={`slot-bubble ${i < remaining ? 'slot-filled' : 'slot-empty'}`}
                        onClick={() => handlePipClick(name, i, remaining)}
                        aria-label={i < remaining ? 'Unused scroll — tap to consume' : 'Consumed scroll — tap to restore'}
                      />
                    ))}
                    <span className="wand-control-label">
                      {usedUp ? 'Used up' : `${remaining} left`}
                    </span>
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
              ? 'No scrolls matching your current filters.'
              : 'No scrolls in inventory.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default ScrollSpells;
