import React from 'react';
import SpellCategorySection from './SpellCategorySection';

const WandInfoBox = ({ themeColor }) => (
  <div className="bloodline-info">
    <h3 style={{ color: themeColor }}>Using Wands</h3>
    <p className="bloodline-description">
      To cast a spell from a wand, you must hold the wand in one hand and activate it with a Cast a Spell activity.
      This uses the spell's normal number of actions. A spell cast from a wand has the standard effects of that spell for someone
      of your level, without the need to meet the spell's requirements. A wand's spells are automatically heightened to half the
      wand's level rounded up. Each wand can be used to cast its spell only once per day without risking the wand's destruction.
    </p>
    <div className="bloodline-magic">
      <span className="bloodline-magic-label">Overcharging Wands:</span>
      <span className="bloodline-magic-effect">
        After the spell is cast from the wand for the day, you can attempt to cast it one more time—overcharging the wand at the risk of destroying it.
        Cast the Spell again, then roll a DC 10 flat check. On a success, the wand is broken.
        On a failure, the wand is destroyed.
        If anyone tries to overcharge a wand when it's already been overcharged that day, the wand is automatically destroyed (even if it had been repaired) and no spell is cast.
      </span>
    </div>
  </div>
);

const WandSpells = ({ spells, themeColor, characterLevel, defenseFilter, activeSpellRank }) => (
  <SpellCategorySection
    title="Wands"
    spells={spells}
    themeColor={themeColor}
    characterLevel={characterLevel}
    defenseFilter={defenseFilter}
    activeSpellRank={activeSpellRank}
    containerClass="wands-container"
    description="Wands allow you to cast a specific spell once per day without expending your own spell slots. Unlike scrolls, wands are not consumed when used and recharge each day at dawn."
    infoBox={<WandInfoBox themeColor={themeColor} />}
    spellKeyFn={(spell) => `${spell.id}-wand`}
    spellPropsFn={(spell) => ({ fromWand: true, wandName: spell.wandName || 'Wand' })}
  />
);

export default WandSpells;
