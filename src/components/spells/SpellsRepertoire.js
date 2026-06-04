import React from 'react';
import { organizeSpellsByRank, getSortedRankList, filterSpellsByDefense } from '../../utils/SpellUtils';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';

const SpellNameChip = ({ spell, character }) => {
  const isSignature = !!spell.signature;
  const isBloodline = !!spell.bloodline;

  const chipClass = `spell-name-chip${isSignature ? ' signature-indicator' : isBloodline ? ' bloodline-indicator' : ''}`;
  const symbol = isSignature ? '★' : isBloodline ? '✦' : null;
  const tooltipText = isSignature
    ? 'Signature Spell: Cast at any rank up to your highest available spell rank.'
    : isBloodline
    ? (character?.spellcasting?.bloodline?.blood_magic || '')
    : null;

  const aonUrl = `https://2e.aonprd.com/Search.aspx?q=${encodeURIComponent(spell.name)}`;

  return (
    <div className={chipClass}>
      <a
        className="chip-name"
        href={aonUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {spell.name}
      </a>
      {symbol && <span className="chip-symbol">{symbol}</span>}
      {tooltipText && <div className="spell-tooltip">{tooltipText}</div>}
    </div>
  );
};

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
              <span className="rank-label" >
                {rank === 'cantrips' ? 'Cantrips' : `Rank ${rank}`}
              </span>
              {rank !== 'cantrips' && total > 0 && (
                <button
                  className="slot-bar"
                  disabled={remaining === 0}
                  onClick={() => handleSpend(rank)}
                  aria-label={`Rank ${rank} spell slots: ${remaining} of ${total} remaining`}
                >
                  <span
                    className="slot-bar-fill"
                    style={{ width: `${(remaining / total) * 100}%` }}
                  />
                  <span className="slot-bar-label">{remaining}/{total}</span>
                </button>
              )}
            </div>
            <div className="spell-chips-row">
              {spellsByRank[rank].map(spell => (
                <SpellNameChip
                  key={spell.id || spell.name}
                  spell={spell}
                  character={character}
                />
              ))}
            </div>
          </div>
        );
      })}

      {character?.spellcasting?.bloodline != null && (
        <div className="bloodline-info">
          <h3 >Imperial Blood Magic:</h3>
          <p className="bloodline-magic-effect">Whenever you cast a bloodline spell you choose one blood magic effect you know to benefit from.</p>
          <div className="bloodline-info">
            <h3 >Imperious Defense</h3>
            <span className="bloodline-magic-effect">{character.spellcasting.bloodline.blood_magic}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpellsRepertoire;
