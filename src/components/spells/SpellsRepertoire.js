import React, { useState } from 'react';
import { organizeSpellsByRank, getSortedRankList, filterSpellsByDefense } from '../../utils/SpellUtils';

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
  const [slotsSpent, setSlotsSpent] = useState(() =>
    Object.fromEntries(Object.keys(spellSlots || {}).map(k => [k, 0]))
  );

  const handleBubbleClick = (rank, i) => {
    const total = spellSlots[rank] || 0;
    const spent = slotsSpent[rank] || 0;
    if (i < total - spent) {
      setSlotsSpent(prev => ({ ...prev, [rank]: Math.min(spent + 1, total) }));
    } else {
      setSlotsSpent(prev => ({ ...prev, [rank]: Math.max(spent - 1, 0) }));
    }
  };

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

        return (
          <div className="repertoire-rank-section" key={rank}>
            <div className="rank-section-header">
              <span className="rank-label" style={{ color: themeColor }}>
                {rank === 'cantrips' ? 'Cantrips' : `Rank ${rank}`}
              </span>
              {rank !== 'cantrips' && total > 0 && (
                <div className="slot-bubbles">
                  {Array.from({ length: total }, (_, i) => {
                    const isFilled = i < total - spent;
                    return (
                      <button
                        key={i}
                        className={`slot-bubble ${isFilled ? 'slot-filled' : 'slot-empty'}`}
                        style={isFilled ? { backgroundColor: themeColor, borderColor: themeColor } : { borderColor: themeColor }}
                        onClick={() => handleBubbleClick(rank, i)}
                        aria-label={isFilled ? 'Available slot' : 'Spent slot'}
                      />
                    );
                  })}
                </div>
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
          <h3 style={{ color: themeColor }}>Imperial Blood Magic:</h3>
          <p className="bloodline-magic-effect">Whenever you cast a bloodline spell you choose one blood magic effect you know to benefit from.</p>
          <div className="bloodline-info">
            <h3 style={{ color: themeColor }}>Imperious Defense</h3>
            <span className="bloodline-magic-effect">{character.spellcasting.bloodline.blood_magic}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpellsRepertoire;
