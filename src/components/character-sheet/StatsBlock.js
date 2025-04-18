import React from 'react';
import './StatsBlock.css';

const StatsBlock = ({ character }) => {
  const getModifier = (value) => {
    const mod = Math.floor((value - 10) / 2);
    return mod >= 0 ? `+${mod}` : mod.toString();
  };
  
  return (
    <div className="stats-block">
      <div className="core-stats">
        <div className="hp-defense">
          <div className="hp-box">
            <div className="defense-name">HP</div>
            <div className="defense-value">{character.maxHp || 0}</div>
          </div>
          <div className="ac-box">
            <div className="defense-name">AC</div>
            <div className="defense-value">{character.ac || 10}</div>
          </div>
        </div>
      </div>
      
      <div className="abilities-section">
        <div className="ability">
          <div className="ability-name">STR</div>
          <div className="ability-mod">{getModifier(character.abilities?.strength || 10)}</div>
        </div>
        <div className="ability">
          <div className="ability-name">DEX</div>
          <div className="ability-mod">{getModifier(character.abilities?.dexterity || 10)}</div>
        </div>
        <div className="ability">
          <div className="ability-name">CON</div>
          <div className="ability-mod">{getModifier(character.abilities?.constitution || 10)}</div>
        </div>
        <div className="ability">
          <div className="ability-name">INT</div>
          <div className="ability-mod">{getModifier(character.abilities?.intelligence || 10)}</div>
        </div>
        <div className="ability">
          <div className="ability-name">WIS</div>
          <div className="ability-mod">{getModifier(character.abilities?.wisdom || 10)}</div>
        </div>
        <div className="ability">
          <div className="ability-name">CHA</div>
          <div className="ability-mod">{getModifier(character.abilities?.charisma || 10)}</div>
        </div>
      </div>
      
      <div className="defenses-section">
        <div className="defense">
          <div className="defense-name">Fort</div>
          <div className="defense-value">{`+` + character.saves?.fortitude || 0}</div>
        </div>
        <div className="defense">
          <div className="defense-name">Ref</div>
          <div className="defense-value">{`+` + character.saves?.reflex || 0}</div>
        </div>
        <div className="defense">
          <div className="defense-name">Will</div>
          <div className="defense-value">{`+` + character.saves?.will || 0}</div>
        </div>
      </div>
    </div>
  );
};

export default StatsBlock;