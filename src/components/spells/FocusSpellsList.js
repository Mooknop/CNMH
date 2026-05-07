import React, { useState } from 'react';
import { organizeSpellsByRank, getSortedRankList } from '../../utils/SpellUtils';

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

const FocusSpellsList = ({ character, characterColor }) => {
  const themeColor = characterColor || 'var(--color-primary)';

  const getFocusSpellsLabel = () => {
    if (character.champion) return 'Devotion Spells';
    if (character.monk) return 'Qi Spells';
    if (character.spellcasting?.bloodline) {
      return `${character.spellcasting.bloodline.name} Bloodline Spells`;
    }
    if (character.class === 'Bard') return 'Compositions';
    return 'Focus Spells';
  };

  const hasFocusSpells = () => {
    if (character.champion?.devotion_spells) return true;
    if (character.spellcasting?.focus) return true;
    if (character.monk?.ki_spells) return true;
    if (character.focus_spells?.length > 0) return true;
    if (character.spellcasting?.bloodline?.focus_spells) return true;
    if (character.witchwarper?.warpSpells) return true;
    return false;
  };

  const getFocusSpells = () => {
    if (character.champion?.devotion_spells) return character.champion.devotion_spells;
    if (character.monk?.ki_spells) return character.monk.ki_spells;
    if (character.spellcasting?.bloodline?.focus_spells) return character.spellcasting.bloodline.focus_spells;
    if (character.focus_spells) return character.focus_spells;
    if (character.witchwarper?.warpSpells) return character.witchwarper.warpSpells;
    return [];
  };

  const getFocusInfo = () => {
    if (character.champion?.focus_points !== undefined) {
      return { max: character.champion.focus_points, current: character.champion.focus_points };
    }
    if (character.monk?.focus_points !== undefined) {
      return { max: character.monk.focus_points, current: character.monk.focus_points };
    }
    if (character.spellcasting?.focus?.max !== undefined) {
      const { max, current } = character.spellcasting.focus;
      return { max, current: current ?? max };
    }
    return null;
  };

  const focusSpellsLabel = getFocusSpellsLabel();
  const focusSpells = getFocusSpells();
  const focusInfo = getFocusInfo();
  const focusMax = focusInfo?.max ?? 0;

  const [pointsSpent, setPointsSpent] = useState(
    focusMax - (focusInfo?.current ?? focusMax)
  );

  const handlePointClick = (i) => {
    const available = focusMax - pointsSpent;
    if (i < available) {
      setPointsSpent(prev => Math.min(prev + 1, focusMax));
    } else {
      setPointsSpent(prev => Math.max(prev - 1, 0));
    }
  };

  if (!hasFocusSpells()) {
    return (
      <div className="spells-container">
        <div className="empty-state">
          <p>This character doesn't have any {focusSpellsLabel.toLowerCase()}.</p>
        </div>
      </div>
    );
  }

  const spellsByRank = organizeSpellsByRank(focusSpells);
  const ranksToShow = getSortedRankList(
    Object.keys(spellsByRank).filter(r => spellsByRank[r].length > 0)
  ).slice(1);

  return (
    <div className="spells-container">
      {focusInfo && focusMax > 0 && (
        <div className="staff-charges-section">
          <div className="rank-section-header">
            <span className="rank-label" style={{ color: themeColor }}>Focus Points</span>
            <div className="slot-bubbles">
              {Array.from({ length: focusMax }, (_, i) => {
                const isFilled = i < focusMax - pointsSpent;
                return (
                  <button
                    key={i}
                    className={`slot-bubble ${isFilled ? 'slot-filled' : 'slot-empty'}`}
                    style={isFilled ? { backgroundColor: themeColor, borderColor: themeColor } : { borderColor: themeColor }}
                    onClick={() => handlePointClick(i)}
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
            <span className="rank-label" style={{ color: themeColor }}>
              {rank === 'cantrips' ? 'Cantrips' : `Rank ${rank}`}
            </span>
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
      ))}

      {ranksToShow.length === 0 && (
        <div className="empty-state">
          <p>No {focusSpellsLabel.toLowerCase()} available.</p>
        </div>
      )}

      {character.spellcasting?.bloodline && (
        <div className="bloodline-info">
          <h3 style={{ color: themeColor }}>Imperious Defense</h3>
          <div className="bloodline-magic">
            <span className="bloodline-magic-effect">{character.spellcasting.bloodline.blood_magic}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FocusSpellsList;
