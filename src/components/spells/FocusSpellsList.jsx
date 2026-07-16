import React, { useMemo } from 'react';
import { organizeSpellsByRank, getSortedRankList, getFocusInfo, getFocusSpellEntries, getFocusSpellLabel } from '../../utils/SpellUtils';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';
import SpellCard from './SpellCard';
import GameGlyph from '../shared/GameGlyph';
import { focusGlyphForClass } from '../../utils/gameGlyphs';
import { useContent } from '../../contexts/ContentContext';
import { spellCatalogMap, resolveFocusSpells } from '../../utils/contentUtils';
import { APP, syncKey } from '../../sync/keys';

const FocusSpellsList = ({ character, characterColor, onCast }) => {
  const themeColor = characterColor || 'var(--color-primary)';
  const { spells: catalogSpells } = useContent();
  const spellMap = useMemo(() => spellCatalogMap(catalogSpells), [catalogSpells]);

  // Source-priority + labeling shared with the Segmented Deck's Spells
  // segment (SpellUtils.getFocusSpellEntries / getFocusSpellLabel).
  const hasFocusSpells = () => {
    if (character.spellcasting?.focus) return true;
    return getFocusSpellEntries(character).length > 0;
  };

  const focusSpellsLabel = getFocusSpellLabel(character);
  const focusSpells = resolveFocusSpells(getFocusSpellEntries(character), spellMap);
  const focusInfo = getFocusInfo(character);
  const focusMax = focusInfo?.max ?? 0;
  // Class-flavored focus glyph inside each bubble (Bard/Sorcerer today); other
  // classes keep the plain bubble.
  const focusGlyph = focusGlyphForClass(character?.class);

  const [pointsSpent, setPointsSpent] = useLocalStorage(
    syncKey(APP.FOCUS, character?.id || 'unknown'),
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
            <span className="rank-label">Focus Points</span>
            <div className="slot-bubbles">
              {Array.from({ length: focusMax }, (_, i) => {
                const isFilled = i < focusMax - pointsSpent;
                return (
                  <button
                    key={i}
                    className={`slot-bubble ${isFilled ? 'slot-filled' : 'slot-empty'}${focusGlyph ? ' has-glyph' : ''}`}
                    onClick={() => handlePointClick(i)}
                    aria-label={isFilled ? 'Available slot' : 'Spent slot'}
                  >
                    {focusGlyph && <GameGlyph name={focusGlyph} />}
                  </button>
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
                characterLevel={character.level}
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
          <p>No {focusSpellsLabel.toLowerCase()} available.</p>
        </div>
      )}

      {character.spellcasting?.bloodline && (
        <div className="bloodline-info">
          <h3>Imperious Defense</h3>
          <div className="bloodline-magic">
            <span className="bloodline-magic-effect">{character.spellcasting.bloodline.blood_magic}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FocusSpellsList;
