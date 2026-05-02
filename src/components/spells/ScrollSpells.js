import React from 'react';
import SpellCategorySection from './SpellCategorySection';

const ScrollSpells = ({ spells, themeColor, characterLevel, defenseFilter, activeSpellRank }) => (
  <SpellCategorySection
    title="Spell Scrolls"
    spells={spells}
    themeColor={themeColor}
    characterLevel={characterLevel}
    defenseFilter={defenseFilter}
    activeSpellRank={activeSpellRank}
    containerClass="scrolls-container"
    description="Spell scrolls allow any magic user to cast the spell written upon them, even if they don't know the spell themselves, so long as the spell is part of their magical tradition."
    spellKeyFn={(spell) => `${spell.id}-scroll`}
  />
);

export default ScrollSpells;
