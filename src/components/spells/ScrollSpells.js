import React from 'react';
import { organizeSpellsByRank, getSortedRankList, filterSpellsByDefense } from '../../utils/SpellUtils';
import SpellCard from './SpellCard';

const ScrollSpells = ({ spells, themeColor, characterLevel, defenseFilter, activeSpellRank, character }) => {
  const filtered = filterSpellsByDefense(spells, defenseFilter);
  const spellsByRank = organizeSpellsByRank(filtered);
  const ranksToShow = getSortedRankList(
    Object.keys(spellsByRank).filter(r => spellsByRank[r].length > 0)
  ).slice(1).filter(r => activeSpellRank === 'all' || r === activeSpellRank);

  const hasActiveFilter = activeSpellRank !== 'all' || defenseFilter !== 'all';

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
            {spellsByRank[rank].map(spell => (
              <SpellCard
                key={`${spell.id}-scroll`}
                spell={spell}
                themeColor={themeColor}
                characterLevel={characterLevel}
                character={character}
              />
            ))}
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
