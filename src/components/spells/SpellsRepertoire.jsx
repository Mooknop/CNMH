import React from 'react';
import { organizeSpellsByRank, getSortedRankList, filterSpellsByDefense } from '../../utils/SpellUtils';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';
import SpellCard from './SpellCard';

/**
 * Clickable slot-pip ledger shown in a rank header. Tapping spends one slot.
 */
const RankSlotPips = ({ rank, total, remaining, onSpend }) => (
  <button
    className="rank-slot-pips"
    disabled={remaining === 0}
    onClick={onSpend}
    aria-label={`Rank ${rank} spell slots: ${remaining} of ${total} remaining. Tap to spend one.`}
  >
    {Array.from({ length: total }, (_, i) => (
      <span key={i} className={`rank-slot-pip${i < remaining ? ' filled' : ''}`} />
    ))}
  </button>
);

const SpellsRepertoire = ({
  spells,
  spellSlots,
  themeColor,
  characterLevel,
  defenseFilter,
  character,
}) => {
  const characterKey = character?.id || 'unknown';
  const [slotsSpent, setSlotsSpent] = useLocalStorage(
    `cnmh_slots_${characterKey}`,
    () => Object.fromEntries(Object.keys(spellSlots || {}).map(k => [k, 0]))
  );

  const handleSpend = (rank) => {
    const total = spellSlots[rank] || 0;
    const spent = slotsSpent[rank] || 0;
    if (spent < total) {
      setSlotsSpent(prev => ({ ...prev, [rank]: spent + 1 }));
    }
  };

  const handleRest = () => {
    setSlotsSpent(Object.fromEntries(Object.keys(spellSlots || {}).map(k => [k, 0])));
  };

  const filtered = filterSpellsByDefense(spells, defenseFilter);
  const spellsByRank = organizeSpellsByRank(filtered);
  const ranksToShow = getSortedRankList(
    Object.keys(spellsByRank).filter(r => spellsByRank[r].length > 0)
  ).slice(1); // drop the leading 'all' entry

  const hasNonCantripSlots = Object.keys(spellSlots || {}).some(
    k => k !== 'cantrips' && (spellSlots[k] || 0) > 0
  );

  return (
    <div className="spells-container">
      {hasNonCantripSlots && (
        <div className="repertoire-rest-row">
          <button
            className="btn-secondary btn-small"
            aria-label="Rest: restore all spell slots"
            onClick={handleRest}
          >
            Rest
          </button>
        </div>
      )}

      {ranksToShow.map(rank => {
        const total = spellSlots?.[rank] || 0;
        const spent = slotsSpent[rank] || 0;
        const remaining = total - spent;

        return (
          <div className="repertoire-rank-section" key={rank}>
            <div className="rank-section-header">
              <span className="rank-label">
                {rank === 'cantrips' ? 'Cantrips' : `Rank ${rank}`}
              </span>
              {rank !== 'cantrips' && total > 0 && (
                <RankSlotPips
                  rank={rank}
                  total={total}
                  remaining={remaining}
                  onSpend={() => handleSpend(rank)}
                />
              )}
            </div>
            <div className="spells-grid">
              {spellsByRank[rank].map(spell => (
                <SpellCard
                  key={spell.id || spell.name}
                  spell={spell}
                  themeColor={themeColor}
                  characterLevel={characterLevel}
                  character={character}
                />
              ))}
            </div>
          </div>
        );
      })}

      {character?.spellcasting?.bloodline != null && (
        <div className="bloodline-info">
          <h3>Imperial Blood Magic:</h3>
          <p className="bloodline-magic-effect">Whenever you cast a bloodline spell you choose one blood magic effect you know to benefit from.</p>
          <div className="bloodline-info">
            <h3>Imperious Defense</h3>
            <span className="bloodline-magic-effect">{character.spellcasting.bloodline.blood_magic}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpellsRepertoire;
