import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import { useLore } from '../contexts/LoreContext';
import { useContent } from '../contexts/ContentContext';
import StatsBlock from '../components/character-sheet/StatsBlock';
import ActionsList from '../components/actions/ActionsList';
import ExplorationList from '../components/actions/ExplorationList';
import FamiliarModal from '../components/character-sheet/FamiliarModal';
import AnimalCompanionModal from '../components/character-sheet/AnimalCompanionModal';
import ItemModal from '../components/inventory/ItemModal';
import InventoryTab from '../components/inventory/InventoryTab';
import HandsPanel from '../components/character-sheet/HandsPanel';
import InitiativeEntry from '../components/encounter/InitiativeEntry';
import TurnTrackerPanel from '../components/encounter/TurnTrackerPanel';
import SavePrompt from '../components/encounter/SavePrompt';
import SpellsList from '../components/spells/SpellsList';

import CombatLogPanel from '../components/encounter/CombatLogPanel';
import EffectsPanel from '../components/character-sheet/EffectsPanel';
import EffectsModal from '../components/character-sheet/EffectsModal';
import { useCharacter } from '../hooks/useCharacter';
import { useSyncedState } from '../hooks/useSyncedState';
import { hydrateConditions } from '../data/pf2eConditions';
import './CharacterSheet.css';

const RAIL_TABS = [
  { id: 'encounter', icon: 'ti-sword',      label: 'Encounter' },
  { id: 'explore',   icon: 'ti-map',        label: 'Explore'   },
  { id: 'inventory', icon: 'ti-backpack',   label: 'Inventory' },
  { id: 'stats',     icon: 'ti-chart-dots', label: 'Stats'     },
  { id: 'spells',    icon: 'ti-sparkles',   label: 'Spells'    },
];

const CharacterSheet = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getCharacter, setActiveCharacter, activeCharacterColor } = useContext(CharacterContext);
  const [character, setCharacter] = useState(null);
  const [activeTab, setActiveTab] = useState('encounter');
  // Valid values: 'encounter' | 'explore' | 'inventory' | 'stats' | 'spells'
  const [isFamiliarModalOpen, setIsFamiliarModalOpen] = useState(false);
  const [isAnimalCompanionOpen, setIsAnimalCompanionOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isEffectsModalOpen, setIsEffectsModalOpen] = useState(false);

  // characterColor is now derived by CharacterContext from the active character's index
  const characterColor = activeCharacterColor;
  const { openLore } = useLore();
  const { loreEntries, loading, theme } = useContent();

  useEffect(() => {
    // Wait for the server snapshot before deciding to redirect — otherwise the
    // initial render runs while characters=FALLBACK and would push us to '/'
    // every time a direct deep-link landed on a character not in the bundled
    // defaults (e.g., a freshly-seeded character on staging).
    if (loading) return;
    const characterData = getCharacter(id);
    if (characterData) {
      setCharacter(characterData);
      setActiveCharacter(characterData);
    } else {
      navigate('/');
    }
  }, [id, loading, getCharacter, setActiveCharacter, navigate]);

  // Handle opening the item detail modal
  const handleItemClick = (item) => {
    setSelectedItem(item);
    setIsItemModalOpen(true);
  };

  // Handle closing the item detail modal
  const closeItemModal = () => {
    setIsItemModalOpen(false);
  };

  // Data layer — all character reads go through this hook
  const characterModel = useCharacter(character);

  // Conditions are owned (written) by StatsBlock's ConditionModal via this same
  // synced key. We read it here — without touching useCharacter — so the
  // masthead can show conditions "always in view". hydrateConditions re-derives
  // the display fields (name, value, …) from the stored { id, value } shape.
  const [activeConditions] = useSyncedState(`cnmh_conditions_${character?.id || 'none'}`, []);
  const hydratedConditions = useMemo(
    () => hydrateConditions(activeConditions),
    [activeConditions]
  );

  if (!character || !characterModel) return <div data-testid="character-loading">Loading character...</div>;

  const { flags, familiar, animalCompanion } = characterModel;
  const { hasFamiliar, hasAnimalCompanion } = flags;

  const hasAnySpells =
    flags.hasSpellcasting ||
    flags.hasFocusSpells ||
    flags.hasInnateSpells ||
    flags.hasScrolls ||
    flags.hasWands ||
    flags.hasStaff ||
    flags.hasEldPowers;

  // Function to render the active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'encounter':
        return (
          <>
            <SavePrompt charId={character.id} characterName={character.name} saves={characterModel.saves} />
            <InitiativeEntry charId={character.id} />
            <TurnTrackerPanel charId={character.id} characterName={character.name} inventory={characterModel.inventory} />
            <HandsPanel character={character} characterColor={characterColor} />
            <ActionsList character={character} characterColor={characterColor} />
            <CombatLogPanel />
          </>
        );
      case 'explore':
        return <ExplorationList character={character} characterColor={characterColor} />;
      case 'inventory':
        return (
          <InventoryTab
            character={character}
            characterColor={characterColor}
            onItemClick={handleItemClick}
          />
        );
      case 'stats':
        return (
          <>
            <EffectsPanel charId={character.id} themeColor={characterColor} />
            <StatsBlock character={character} characterColor={characterColor} />
          </>
        );
      case 'spells':
        return hasAnySpells ? (
          <SpellsList character={character} characterColor={characterColor} />
        ) : (
          <div className="cs-empty">No spellcasting.</div>
        );
      default:
        return null;
    }
  };

  const overrideColor = theme?.accentOverrides?.[character?.id];
  const resolvedAccent = overrideColor || characterColor;

  return (
    <div
      className="character-sheet-page"
      style={resolvedAccent ? { '--color-theme': resolvedAccent } : undefined}
    >
      <div className="character-sheet">

        {/* ── Masthead ──────────────────────────────────────────── */}
        <header className="cs-masthead">

          {/* Portrait column */}
          <div className="cs-portrait">
            {character.image ? (
              <img
                src={`/api/images/${character.image}`}
                alt={`Portrait of ${character.name}`}
                className="entity-image cs-portrait-img"
                style={
                  character.imagePosition
                    ? { objectPosition: `${character.imagePosition.x ?? 50}% ${character.imagePosition.y ?? 0}%` }
                    : undefined
                }
              />
            ) : (
              <div className="cs-portrait-fallback" aria-hidden="true">
                <div className="cs-monogram">
                  {character.name
                    .split(' ')
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()}
                </div>
              </div>
            )}
            <div className="cs-portrait-fade" aria-hidden="true" />
          </div>

          {/* Info column */}
          <div className="cs-info">
            <div className="cs-info-bg" aria-hidden="true" />
            <div className="cs-info-content">
              <h1 className="cs-char-name">{character.name}</h1>
              <p className="cs-char-sub">
                {[
                  character.ancestry,
                  character.class,
                  character.level ? `Level ${character.level}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              {/* Active conditions strip */}
              {hydratedConditions.length > 0 && (
                <div className="cs-conditions" role="list" aria-label="Active conditions">
                  {hydratedConditions.map((c, i) => (
                    <span key={c.id || i} className="cs-cond" role="listitem">
                      {c.name}
                      {c.value != null && <span className="cs-cond-val">{c.value}</span>}
                    </span>
                  ))}
                </div>
              )}

              {/* Action buttons row */}
              <div className="cs-masthead-actions">
                {character.loreEntryId &&
                  loreEntries.some((e) => e.id === character.loreEntryId) && (
                    <button
                      className="cs-action-btn"
                      onClick={() => openLore(character.loreEntryId)}
                      aria-label="Open lore entry"
                    >
                      <i className="ti ti-book" aria-hidden="true" />
                      Lore
                    </button>
                  )}
                {hasFamiliar && (
                  <button
                    className="cs-action-btn"
                    onClick={() => setIsFamiliarModalOpen(true)}
                  >
                    {familiar.name}
                  </button>
                )}
                {hasAnimalCompanion && (
                  <button
                    className="cs-action-btn"
                    onClick={() => setIsAnimalCompanionOpen(true)}
                  >
                    {animalCompanion.name}
                  </button>
                )}
                <button
                  className="cs-action-btn cs-action-btn--effect"
                  onClick={() => setIsEffectsModalOpen(true)}
                >
                  <i className="ti ti-sparkles" aria-hidden="true" />
                  Effect
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* ── Vitals strip ──────────────────────────────────────── */}
        <div className="cs-vitals" role="region" aria-label="Character vitals">
          <div className="cs-vital">
            <span className="cs-vital-val cs-vital-val--hp" aria-label="Hit points">
              {characterModel.hp?.current ?? '—'}
              <span className="cs-vital-max">/{characterModel.maxHp}</span>
            </span>
            <span className="cs-vital-lbl">HP</span>
          </div>
          <div className="cs-vital">
            <span className="cs-vital-val" aria-label="Armor class">
              {characterModel.ac ?? '—'}
            </span>
            <span className="cs-vital-lbl">AC</span>
          </div>
          <div className="cs-vital">
            <span className="cs-vital-val cs-vital-val--hero" aria-label="Hero points">
              {Array.from({ length: 3 }, (_, i) => (
                <span
                  key={i}
                  className={`cs-hero-pip${i < (characterModel.heroPoints ?? 0) ? ' cs-hero-pip--filled' : ''}`}
                />
              ))}
            </span>
            <span className="cs-vital-lbl">Hero</span>
          </div>
        </div>

        {/* ── Ability scores strip ──────────────────────────────── */}
        <div className="cs-abilities" role="region" aria-label="Ability scores">
          {['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map(
            (abl) => {
              const score = character.abilities?.[abl] ?? 10;
              const mod = characterModel.abilityModifiers?.[abl] ?? 0;
              const abbr = abl.slice(0, 3).toUpperCase();
              return (
                <div key={abl} className="cs-abl">
                  <span className="cs-abl-score">{score}</span>
                  <span className="cs-abl-mod">{mod >= 0 ? `+${mod}` : mod}</span>
                  <span className="cs-abl-name">{abbr}</span>
                </div>
              );
            }
          )}
        </div>

        {/* ── Scrollable content zone ───────────────────────────── */}
        <main className="cs-content" id="cs-tab-content">
          {renderTabContent()}
        </main>

        {/* ── Bottom navigation rail ───────────────────────────── */}
        <nav className="cs-rail" aria-label="Character sheet sections">
          {RAIL_TABS.map(({ id: tabId, icon, label }) => (
            <button
              key={tabId}
              className={`cs-rail-tab${activeTab === tabId ? ' cs-rail-tab--active' : ''}`}
              onClick={() => setActiveTab(tabId)}
              aria-label={label}
              aria-current={activeTab === tabId ? 'page' : undefined}
            >
              <i className={`ti ${icon}`} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

      </div>

      {/* ── Modals (unchanged) ──────────────────────────────────── */}
      <FamiliarModal
        isOpen={isFamiliarModalOpen}
        onClose={() => setIsFamiliarModalOpen(false)}
        familiar={familiar}
        character={character}
        characterColor={characterColor}
      />
      <AnimalCompanionModal
        isOpen={isAnimalCompanionOpen}
        onClose={() => setIsAnimalCompanionOpen(false)}
        animalCompanion={animalCompanion}
        character={character}
        characterColor={characterColor}
      />
      {selectedItem && (
        <ItemModal
          isOpen={isItemModalOpen}
          onClose={closeItemModal}
          item={selectedItem}
          characterColor={characterColor}
        />
      )}
      <EffectsModal
        isOpen={isEffectsModalOpen}
        onClose={() => setIsEffectsModalOpen(false)}
        themeColor={characterColor}
        selfCharId={character.id}
        selfName={character.name}
      />
    </div>
  );
};

export default CharacterSheet;
