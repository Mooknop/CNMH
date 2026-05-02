import React from 'react';
import SpellCategorySection from './SpellCategorySection';

const GemInfoBox = ({ themeColor }) => (
  <div className="bloodline-info">
    <h3 style={{ color: themeColor }}>Using Spell Gems</h3>
    <p className="bloodline-description">
      To cast a spell from a gem, you must hold the gem in one hand and activate it with a Cast a Spell activity.
      A spell gem can be used only once, and it's consumed when the spell is cast or the gem is destroyed.
    </p>
  </div>
);

const GemSpells = ({ spells, themeColor, characterLevel, defenseFilter, activeSpellRank }) => (
  <SpellCategorySection
    title="Spell Gems"
    spells={spells}
    themeColor={themeColor}
    characterLevel={characterLevel}
    defenseFilter={defenseFilter}
    activeSpellRank={activeSpellRank}
    containerClass="gems-container"
    description="Spell gems contain the magical script necessary to cast a specific spell once. These latticed gemstones are suspended in silicon casings and function similar to scrolls, containing encoded magical energy that can be released by anyone who knows how to activate them."
    infoBox={<GemInfoBox themeColor={themeColor} />}
    infoBoxFirst
    spellKeyFn={(spell) => `${spell.id}-gem`}
  />
);

export default GemSpells;
