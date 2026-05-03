import React from 'react';
import SpellCategorySection from './SpellCategorySection';

const StaffInfoBox = ({ themeColor }) => (
  <div className="bloodline-info">
    <h3 style={{ color: themeColor }}>Staff Rules</h3>
    <p className="bloodline-description">
      Each day during your daily preparations, you can prepare a staff to add charges to it for free.
      This gives the staff a number of charges equal to the level of your highest-level spell slot.
      You can use these charges to cast spells from the staff.
    </p>
    <div className="bloodline-magic">
      <span className="bloodline-magic-effect">
        A spontaneous spellcaster—such as a bard, oracle, or sorcerer—can reduce the number of charges it takes to Activate a staff by supplementing it with their own energy.
        When a spontaneous spellcaster Activates a staff, they can expend 1 charge from the staff and one of their spell slots to cast a spell from the staff of the same rank (or lower) as the expended spell slot.
        This doesn't change the number of actions it takes to cast the spell.
      </span>
    </div>
  </div>
);

const StaffSpells = ({ staff, spells, themeColor, characterLevel, defenseFilter, activeSpellRank }) => {
  const hasActiveFilter = activeSpellRank !== 'all' || defenseFilter !== 'all';

  const emptyMessage = hasActiveFilter
    ? 'No staff spells matching your current filters.'
    : undefined; // SpellCategorySection renders a default when undefined

  // The "no spells in data" case gets custom JSX; pass it only when there's no filter
  const noDataContent = !hasActiveFilter ? (
    <>
      <p>
        This staff does not have any spells specified in the character data.
        Staff spells should be added to the character's staff object under a "spells" property.
      </p>
      <div className="staff-placeholder">
        <h5 style={{ color: themeColor }}>Default Staff Functionality</h5>
        <p>
          Staves typically contain a selection of thematically linked spells that can be cast by
          expending charges from the staff. The exact spells depend on the type of staff and its magical properties.
        </p>
        <p>
          Consult your Game Master or the Pathfinder 2E rulebook for details on your specific staff's capabilities.
        </p>
      </div>
    </>
  ) : null;

  return (
    <SpellCategorySection
      title={staff.name}
      spells={spells}
      themeColor={themeColor}
      characterLevel={characterLevel}
      defenseFilter={defenseFilter}
      activeSpellRank={activeSpellRank}
      containerClass="staff-container"
      description={staff.description || 'A magical staff that can store spells.'}
      infoBox={<StaffInfoBox themeColor={themeColor} />}
      emptyMessage={emptyMessage}
      spellKeyFn={(spell) => spell.id}
    >
      {noDataContent}
    </SpellCategorySection>
  );
};

export default StaffSpells;
