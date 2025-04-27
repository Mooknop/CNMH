import React from 'react';
import { getProficiencyLabel } from '../../utils/CharacterUtils';
import { calculateSpellStats } from '../../utils/SpellUtils';

/**
 * Component to display spellcasting statistics
 * @param {Object} props
 * @param {Object} props.character - Character data
 * @param {string} props.themeColor - Theme color
 */
const SpellsHeader = ({ character, themeColor }) => {
  const spellcasting = character.spellcasting || {};
  const { spellAttackMod, spellDC } = calculateSpellStats(character);

  return (
    <div className="spellcasting-stats">
      <div className="spellcasting-tradition">
        <span className="stat-label">Tradition</span>
        <span className="stat-value" style={{ color: themeColor }}>
          {spellcasting.tradition}
        </span>
      </div>
      <div className="spell-proficiency">
        <span className="stat-label">Proficiency</span>
        <span className="stat-value" style={{ color: themeColor }}>
          {getProficiencyLabel(spellcasting.proficiency)}
        </span>
      </div>
      <div className="spell-attack">
        <span className="stat-label">Spell Attack</span>
        <span className="stat-value" style={{ color: themeColor }}>
          +{spellAttackMod}
        </span>
      </div>
      <div className="spell-dc">
        <span className="stat-label">Spell DC</span>
        <span className="stat-value" style={{ color: themeColor }}>
          {spellDC}
        </span>
      </div>
      {spellcasting.focus && (
        <div className="focus-points">
          <span className="stat-label">Focus Points</span>
          <span className="stat-value" style={{ color: themeColor }}>
            {spellcasting.focus.current}/{spellcasting.focus.max}
          </span>
        </div>
      )}
    </div>
  );
};

export default SpellsHeader;