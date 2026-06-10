// src/components/spells/MagicModal.js
import React, { useState } from 'react';
import Modal from '../shared/Modal';
import SpellsRepertoire from './SpellsRepertoire';
import InnateCastingList from './InnateCastingList';
import FocusSpellsList from './FocusSpellsList';
import StaffSpells from './StaffSpells';
import ScrollSpells from './ScrollSpells';
import WandSpells from './WandSpells';
import EldPowers from './EldPowers';
import Harrowing from './Harrowing';
import SpellsHeader from './SpellsHeader';
import CastSpellModal from '../encounter/CastSpellModal';
import { useCharacter } from '../../hooks/useCharacter';
import { useSpellCastFlow } from '../../hooks/useSpellCastFlow';
import './MagicModal.css';

const CATEGORY_LABELS = {
  spells: 'Spells',
  innate: 'Innate',
  focus: 'Focus',
  staff: 'Staff',
  scrolls: 'Scrolls',
  wands: 'Wands',
  eld: 'Eld Powers',
  harrow: 'Harrowing',
};

/**
 * Two-level magic modal:
 *   Level 1 – grid of category buttons (one per available spell type)
 *   Level 2 – nested modal showing that category's spell list
 */
const MagicModal = ({ isOpen, onClose, character, themeColor }) => {
  const [activeCategory, setActiveCategory] = useState(null);

  // Cast buttons appear on the character's turn; the source tag tells the
  // cast modal which pool (slot/focus/staff/wand/scroll) pays for the spell.
  const { makeOnCast, castRequest, clearCast } = useSpellCastFlow(character);

  const {
    spellcasting,
    scrollSpells,
    wandSpells,
    innateSpells,
    staffSpells,
    staff,
    eldPowers,
    level,
    flags,
  } = useCharacter(character);

  const {
    hasSpellcasting,
    hasFocusSpells: hasFocus,
    hasInnateSpells: hasInnate,
    hasScrolls,
    hasWands,
    hasStaff,
    hasEldPowers,
    hasHarrowing,
  } = flags;

  const availableCategories = [
    hasSpellcasting && 'spells',
    hasInnate && 'innate',
    hasFocus && 'focus',
    hasStaff && 'staff',
    hasScrolls && 'scrolls',
    hasWands && 'wands',
    hasEldPowers && 'eld',
    hasHarrowing && 'harrow',
  ].filter(Boolean);

  const getFocusLabel = () => {
    if (character.champion) return 'Devotion';
    if (character.monk) return 'Qi Spells';
    if (character.class === 'Bard') return 'Compositions';
    return 'Focus';
  };

  const getCategoryLabel = (cat) => {
    if (cat === 'focus') return getFocusLabel();
    if (cat === 'staff') return staff?.name || 'Staff';
    return CATEGORY_LABELS[cat] || cat;
  };

  const renderCategoryContent = (cat) => {
    switch (cat) {
      case 'spells':
        return (
          <>
            {hasSpellcasting && <SpellsHeader character={character} themeColor={themeColor} />}
            <SpellsRepertoire
              spells={spellcasting.spells || []}
              spellSlots={spellcasting.spell_slots || {}}
              themeColor={themeColor}
              characterLevel={level}
              defenseFilter="all"
              character={character}
              onCast={makeOnCast('slot')}
            />
          </>
        );
      case 'innate':
        return (
          <InnateCastingList
            spells={innateSpells}
            themeColor={themeColor}
            characterLevel={level}
            defenseFilter="all"
            character={character}
            onCast={makeOnCast('innate')}
          />
        );
      case 'focus':
        return (
          <FocusSpellsList
            character={character}
            characterColor={themeColor}
            onCast={makeOnCast('focus')}
          />
        );
      case 'staff':
        return (
          <StaffSpells
            staff={staff}
            spells={staffSpells}
            themeColor={themeColor}
            characterLevel={level}
            defenseFilter="all"
            activeSpellRank="all"
            character={character}
            onCast={makeOnCast('staff')}
          />
        );
      case 'scrolls':
        return (
          <ScrollSpells
            spells={scrollSpells}
            themeColor={themeColor}
            characterLevel={level}
            defenseFilter="all"
            activeSpellRank="all"
            character={character}
            onCast={makeOnCast('scroll')}
          />
        );
      case 'wands':
        return (
          <WandSpells
            spells={wandSpells}
            themeColor={themeColor}
            characterLevel={level}
            defenseFilter="all"
            activeSpellRank="all"
            character={character}
            onCast={makeOnCast('wand')}
          />
        );
      case 'eld':
        return (
          <EldPowers eldPowers={eldPowers} themeColor={themeColor} characterLevel={level} />
        );
      case 'harrow':
        return <Harrowing character={character} themeColor={themeColor} />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Level 1: category picker */}
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Magic"
        themeColor={themeColor}
        maxWidth="500px"
      >
        {availableCategories.length === 0 ? (
          <p style={{ padding: '1rem', color: 'var(--shell-text-tertiary)' }}>
            No spellcasting available for this character.
          </p>
        ) : (
          <div className="magic-category-grid">
            {availableCategories.map((cat) => (
              <button
                key={cat}
                className="magic-category-btn"
                style={{ '--category-color': themeColor }}
                onClick={() => setActiveCategory(cat)}
              >
                {getCategoryLabel(cat)}
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Level 2: selected category spells */}
      <Modal
        isOpen={!!activeCategory}
        onClose={() => setActiveCategory(null)}
        title={activeCategory ? getCategoryLabel(activeCategory) : ''}
        themeColor={themeColor}
        maxWidth="680px"
        highZ
      >
        {activeCategory && renderCategoryContent(activeCategory)}
      </Modal>

      {/* Cast spell modal — opened from SpellCard Cast buttons in encounter mode */}
      {castRequest && (
        <CastSpellModal
          isOpen={!!castRequest}
          onClose={clearCast}
          spell={castRequest.spell}
          cost={castRequest.cost}
          castSource={castRequest.source}
          character={character}
          themeColor={themeColor}
        />
      )}
    </>
  );
};

export default MagicModal;
