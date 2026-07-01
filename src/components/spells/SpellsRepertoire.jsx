import React from 'react';
import { organizeSpellsByRank, getSortedRankList, filterSpellsByDefense } from '../../utils/SpellUtils';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';
import SpellCard from './SpellCard';

/**
 * Read-only slot-pip ledger shown in a rank header. Reflects slots spent by
 * casting (in or out of encounter) and refreshed at daily preparations — no
 * hand-toggling. GMs remediate via CharacterStateModal if a correction is needed.
 */
const RankSlotPips = ({ rank, total, remaining }) => (
  <span
    className="rank-slot-pips"
    role="img"
    aria-label={`Rank ${rank} spell slots: ${remaining} of ${total} remaining`}
  >
    {Array.from({ length: total }, (_, i) => (
      <span key={i} className={`rank-slot-pip${i < remaining ? ' filled' : ''}`} />
    ))}
  </span>
);

const SpellsRepertoire = ({
  spells,
  spellSlots,
  themeColor,
  characterLevel,
  defenseFilter,
  character,
  onCast,
  castResources,
}) => {
  const characterKey = character?.id || 'unknown';
  // Read-only view of the slot ledger. The sole player-side writer is the cast
  // path (useCastingResources.spend); daily preparations reset it.
  const [slotsSpent] = useLocalStorage(
    `cnmh_slots_${characterKey}`,
    () => Object.fromEntries(Object.keys(spellSlots || {}).map(k => [k, 0]))
  );

  const filtered = filterSpellsByDefense(spells, defenseFilter);
  const spellsByRank = organizeSpellsByRank(filtered);
  const ranksToShow = getSortedRankList(
    Object.keys(spellsByRank).filter(r => spellsByRank[r].length > 0)
  ).slice(1); // drop the leading 'all' entry

  return (
    <div className="spells-container">
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
                  encounterMode={!!onCast}
                  onCast={onCast}
                  castResources={castResources}
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
