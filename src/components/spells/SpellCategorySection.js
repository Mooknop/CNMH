// src/components/spells/SpellCategorySection.js
// Unified renderer for scroll, wand, gem, and staff spell sections.
// Replaces ScrollSpells, WandSpells, GemSpells, and StaffSpells.
import React from 'react';
import SpellCard from './SpellCard';
import { filterSpellsByDefense } from '../../utils/SpellUtils';

/**
 * Renders a titled section of spell cards with optional description and info box.
 *
 * @param {string}    title           - Section heading
 * @param {Array}     spells          - Spells to display (pre-filtered by rank if needed)
 * @param {string}    themeColor
 * @param {number}    characterLevel
 * @param {string}    defenseFilter
 * @param {string}    activeSpellRank
 * @param {string}    [description]   - Short paragraph below the title
 * @param {ReactNode} [infoBox]       - Optional info/rules block (bloodline-info style)
 * @param {boolean}   [infoBoxFirst]  - Render infoBox before the spell list (default: after)
 * @param {string}    [emptyMessage]  - Custom message when no spells match filters
 * @param {Function}  [spellKeyFn]    - Custom key generator: (spell) => string
 * @param {Function}  [spellPropsFn]  - Merge extra props into SpellCard: (spell) => object
 * @param {string}    containerClass  - CSS class for the outer container div
 */
const SpellCategorySection = ({
  title,
  spells = [],
  themeColor,
  characterLevel,
  defenseFilter,
  activeSpellRank,
  description,
  infoBox,
  infoBoxFirst = false,
  emptyMessage,
  spellKeyFn,
  spellPropsFn,
  containerClass = 'spell-category-container',
}) => {
  const filteredSpells = filterSpellsByDefense(spells, defenseFilter);

  const hasActiveFilter = activeSpellRank !== 'all' || defenseFilter !== 'all';
  const defaultEmpty = hasActiveFilter
    ? `No ${title.toLowerCase()} matching your current filters.`
    : `No ${title.toLowerCase()} found.`;

  return (
    <div className={containerClass}>
      <h3 style={{ color: themeColor }}>{title}</h3>

      {description && <p className="spell-category-description">{description}</p>}

      {infoBoxFirst && infoBox}

      {filteredSpells.length > 0 ? (
        <div className="cards-grid">
          {filteredSpells.map((spell) => {
            const key = spellKeyFn ? spellKeyFn(spell) : spell.id;
            const extraProps = spellPropsFn ? spellPropsFn(spell) : {};
            return (
              <SpellCard
                key={key}
                spell={{ ...spell, ...extraProps }}
                themeColor={themeColor}
                characterLevel={characterLevel}
              />
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <p>{emptyMessage || defaultEmpty}</p>
        </div>
      )}

      {!infoBoxFirst && infoBox}
    </div>
  );
};

export default SpellCategorySection;
