import React, { useState, useMemo } from 'react';
import './StatsBlock.css';
import EnhancedSkillsList from '../character-sheet/EnhancedSkillsList';
import FeatsList from '../character-sheet/FeatsList';
import ConditionModal from './ConditionModal';
import PenaltyDisplay from '../shared/PenaltyDisplay';
import ProficiencyPips from '../shared/ProficiencyPips';
import { formatModifier, getProficiencyBonus } from '../../utils/CharacterUtils';
import { useCharacter } from '../../hooks/useCharacter';
import { useShield } from '../../hooks/useShield';
import { useAura } from '../../hooks/useAura';
import { useOmen } from '../../hooks/useOmen';
import { characterHasKineticAura } from '../../utils/kineticAura';
import { computeConditionEffects } from '../../utils/ConditionUtils';
import { computeEffectBonuses, combineModifiers, conditionalModifiersFor } from '../../utils/EffectUtils';
import { useEffects } from '../../hooks/useEffects';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';
import { getCondition, hydrateConditions } from '../../data/pf2eConditions';

const StatsBlock = ({ character, characterColor }) => {
  const [activeTab, setActiveTab] = useState('abilities');
  const characterKey = character?.id || 'unknown';
  const [activeConditions, setActiveConditions] = useLocalStorage(`cnmh_conditions_${characterKey}`, []);
  const [isConditionModalOpen, setIsConditionModalOpen] = useState(false);

  // Synced state stores only the dynamic shape `{ id, value }`; static
  // definition data (name, effect, maxValue, …) is re-derived for display.
  const handleAddCondition = (condition) => {
    setActiveConditions((prev) => {
      const alreadyActive = prev.find((c) => c.id === condition.id);
      if (alreadyActive) {
        if (!condition.valued) return prev;
        return prev.map((c) =>
          c.id === condition.id
            ? { ...c, value: Math.min(c.value + 1, condition.maxValue) }
            : c
        );
      }
      return [...prev, { id: condition.id, value: condition.valued ? 1 : null }];
    });
  };

  const handleRemoveCondition = (id) => {
    setActiveConditions((prev) => prev.filter((c) => c.id !== id));
  };

  const handleChangeValue = (id, delta) => {
    const maxValue = getCondition(id)?.maxValue;
    setActiveConditions((prev) =>
      prev.reduce((acc, c) => {
        if (c.id !== id) return [...acc, c];
        const next = c.value + delta;
        if (next <= 0) return acc;
        return [...acc, { ...c, value: Math.min(next, maxValue) }];
      }, [])
    );
  };

  // Re-derive full condition objects (with `effect`) for display/computation.
  const hydratedConditions = useMemo(
    () => hydrateConditions(activeConditions),
    [activeConditions]
  );

  // Data layer — all character reads go through this hook
  const charData = useCharacter(character);

  // Effect bonuses and catalog must be called unconditionally (Rules of Hooks)
  const { effects: activeEffects } = useEffects(characterKey);
  const { effects: effectCatalog } = useContent();

  // A raised shield contributes a circumstance bonus to AC, modeled as a
  // synthetic effect injected into the same computeEffectBonuses pipeline (so
  // stacking with Take Cover / the Shield cantrip is handled by bestOfKind).
  const { shieldEffect } = useShield(characterKey, charData?.inventory);

  // Kinetic aura (#228) — badge + out-of-encounter Dismiss for kineticists.
  const { active: auraActive, deactivate: deactivateAura } = useAura(characterKey);

  // Harrow omen (#227) — read-only badge for harrowers; the suit picker
  // lives in the Harrowing panel.
  const { suit: omenSuit } = useOmen(characterKey);

  if (!charData) return null;

  const {
    abilityModifiers,
    saves,
    proficiencies: rawProficiencies,
    classDC,
    level,
    maxHp,
    ac,
    size,
    speed,
    senses,
    hp,
    heroPoints,
    setHeroPoints,
  } = charData;

  // Hero points: GM awards them in Foundry, players spend them here. The pip
  // click mirrors the focus-pool UX — tap a filled pip to spend one, an empty
  // pip to add one. setHeroPoints broadcasts cnmh_heropoints_<id>, which the
  // bridge writes back to the Foundry actor.
  const HERO_POINTS_MAX = 3;
  const handleHeroPointClick = (i) => {
    if (!setHeroPoints) return;
    if (i < (heroPoints ?? 0)) {
      setHeroPoints((prev) => Math.max((prev ?? 0) - 1, 0));
    } else {
      setHeroPoints((prev) => Math.min((prev ?? 0) + 1, HERO_POINTS_MAX));
    }
  };

  const themeColor = characterColor || 'var(--color-primary)';
  const strMod = abilityModifiers.strength;
  const dexMod = abilityModifiers.dexterity;

  const defaultProficiencies = {
    weapons: {
      unarmed: { proficiency: 0, name: "Untrained" },
      simple: { proficiency: 0, name: "Untrained" },
      martial: { proficiency: 0, name: "Untrained" },
      advanced: { proficiency: 0, name: "Untrained" }
    },
    armor: {
      unarmored: { proficiency: 0, name: "Untrained" },
      light: { proficiency: 0, name: "Untrained" },
      medium: { proficiency: 0, name: "Untrained" },
      heavy: { proficiency: 0, name: "Untrained" }
    }
  };

  const proficiencies = rawProficiencies.weapons ? rawProficiencies : defaultProficiencies;

  // Compute condition penalties for every displayed stat
  const effects = computeConditionEffects(hydratedConditions, character?.keyAbility, level);

  // Combine condition penalties with effect bonuses. A raised shield appends a
  // synthetic active-effect entry + its dynamic catalog def (bonus = shield AC).
  const effectsList = shieldEffect ? [...activeEffects, shieldEffect.entry] : activeEffects;
  const catalogList = shieldEffect ? [...(effectCatalog || []), shieldEffect.def] : effectCatalog;
  const bonuses = computeEffectBonuses(effectsList, catalogList);
  const mod = (stat) => combineModifiers(effects[stat], bonuses[stat]);

  // Conditional ('vs X') effect modifiers can't be netted into the always-on
  // save number (the app doesn't know what a save is against), so surface them
  // as a small note beneath the relevant save line (#338).
  const renderConditionalHint = (stat) => {
    const mods = conditionalModifiersFor(effectsList, stat, catalogList);
    if (!mods.length) return null;
    return (
      <div className="defense-hint" role="note">
        {mods.map((m, i) => (
          <span key={i} className="defense-hint-item">
            {formatModifier(m.amount)} vs {m.vs} <span className="defense-hint-src">({m.label})</span>
          </span>
        ))}
      </div>
    );
  };

  // Helper: raw attack bonus as a number (no formatting) so PenaltyDisplay can apply the delta
  const attackNum = (abilityMod, proficiency) =>
    abilityMod + getProficiencyBonus(proficiency, level);

  // Render an attack-bonus cell with condition penalty wired in
  const renderAttackBonus = (abilityMod, proficiency, penaltyObj) => (
    <PenaltyDisplay
      base={attackNum(abilityMod, proficiency)}
      penalty={penaltyObj}
      format="modifier"
    />
  );

  const renderTabContent = () => {
    switch(activeTab) {
      case 'abilities':
        return (
          <>
            <div className="abilities-section">
              <div className="ability">
                <div className="ability-name">STR</div>
                <div className="ability-mod">{formatModifier(abilityModifiers.strength)}</div>
              </div>
              <div className="ability">
                <div className="ability-name">DEX</div>
                <div className="ability-mod">{formatModifier(abilityModifiers.dexterity)}</div>
              </div>
              <div className="ability">
                <div className="ability-name">CON</div>
                <div className="ability-mod">{formatModifier(abilityModifiers.constitution)}</div>
              </div>
              <div className="ability">
                <div className="ability-name">INT</div>
                <div className="ability-mod">{formatModifier(abilityModifiers.intelligence)}</div>
              </div>
              <div className="ability">
                <div className="ability-name">WIS</div>
                <div className="ability-mod">{formatModifier(abilityModifiers.wisdom)}</div>
              </div>
              <div className="ability">
                <div className="ability-name">CHA</div>
                <div className="ability-mod">{formatModifier(abilityModifiers.charisma)}</div>
              </div>
            </div>

            <div className="defenses-section">
              <div className="defense">
                <div className="defense-name">Fort</div>
                <div className="defense-value">
                  <PenaltyDisplay base={saves.fortitude} penalty={mod('fort')} format="modifier" />
                </div>
                {renderConditionalHint('fort')}
              </div>
              <div className="defense">
                <div className="defense-name">Ref</div>
                <div className="defense-value">
                  <PenaltyDisplay base={saves.reflex} penalty={mod('reflex')} format="modifier" />
                </div>
                {renderConditionalHint('reflex')}
              </div>
              <div className="defense">
                <div className="defense-name">Will</div>
                <div className="defense-value">
                  <PenaltyDisplay base={saves.will} penalty={mod('will')} format="modifier" />
                </div>
                {renderConditionalHint('will')}
              </div>
            </div>
          </>
        );

      case 'proficiencies':
        return (
          <div className="proficiencies-section">
            <div className="proficiency-group">
              <h4 className="proficiency-category">Class DC</h4>
              <div className="proficiency-items">
                <div className="proficiency-item">
                  <span className="proficiency-name">
                    <strong>
                      <PenaltyDisplay base={classDC} penalty={mod('classDC')} />
                    </strong>
                  </span>
                </div>
              </div>

              <h4 className="proficiency-category">Weapons</h4>
              <div className="proficiency-items">
                {/* Unarmed Attacks */}
                <div className="proficiency-item weapon-proficiency">
                  <div className="weapon-category">
                    <span className="proficiency-name">Unarmed</span>
                    <ProficiencyPips rank={proficiencies.weapons.unarmed?.proficiency || 0} showLabel={true} />
                  </div>
                  <div className="attack-bonuses">
                    <div className="bonus-container">
                      <div className="attack-type">Melee (STR)</div>
                      <div className="attack-bonus">
                        {renderAttackBonus(strMod, proficiencies.weapons.unarmed?.proficiency || 0, mod('meleeAttack'))}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus">
                        {renderAttackBonus(dexMod, proficiencies.weapons.unarmed?.proficiency || 0, mod('rangedAttack'))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Simple Weapons */}
                <div className="proficiency-item weapon-proficiency">
                  <div className="weapon-category">
                    <span className="proficiency-name">Simple</span>
                    <ProficiencyPips rank={proficiencies.weapons.simple?.proficiency || 0} showLabel={true} />
                  </div>
                  <div className="attack-bonuses">
                    <div className="bonus-container">
                      <div className="attack-type">Melee (STR)</div>
                      <div className="attack-bonus">
                        {renderAttackBonus(strMod, proficiencies.weapons.simple?.proficiency || 0, mod('meleeAttack'))}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus">
                        {renderAttackBonus(dexMod, proficiencies.weapons.simple?.proficiency || 0, mod('rangedAttack'))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Martial Weapons */}
                <div className="proficiency-item weapon-proficiency">
                  <div className="weapon-category">
                    <span className="proficiency-name">Martial</span>
                    <ProficiencyPips rank={proficiencies.weapons.martial?.proficiency || 0} showLabel={true} />
                  </div>
                  <div className="attack-bonuses">
                    <div className="bonus-container">
                      <div className="attack-type">Melee (STR)</div>
                      <div className="attack-bonus">
                        {renderAttackBonus(strMod, proficiencies.weapons.martial?.proficiency || 0, mod('meleeAttack'))}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus">
                        {renderAttackBonus(dexMod, proficiencies.weapons.martial?.proficiency || 0, mod('rangedAttack'))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advanced Weapons */}
                <div className="proficiency-item weapon-proficiency">
                  <div className="weapon-category">
                    <span className="proficiency-name">Advanced</span>
                    <ProficiencyPips rank={proficiencies.weapons.advanced?.proficiency || 0} showLabel={true} />
                  </div>
                  <div className="attack-bonuses">
                    <div className="bonus-container">
                      <div className="attack-type">Melee (STR)</div>
                      <div className="attack-bonus">
                        {renderAttackBonus(strMod, proficiencies.weapons.advanced?.proficiency || 0, mod('meleeAttack'))}
                      </div>
                    </div>
                    <div className="bonus-container">
                      <div className="attack-type">Ranged (DEX)</div>
                      <div className="attack-bonus">
                        {renderAttackBonus(dexMod, proficiencies.weapons.advanced?.proficiency || 0, mod('rangedAttack'))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Class Weapons (if available) */}
                {proficiencies.weapons.class && (
                  <div className="proficiency-item weapon-proficiency">
                    <div className="weapon-category">
                      <span className="proficiency-name">Class Weapons</span>
                      <ProficiencyPips rank={proficiencies.weapons.class?.proficiency || 0} showLabel={true} />
                    </div>
                    <div className="attack-bonuses">
                      <div className="bonus-container">
                        <div className="attack-type">Melee (STR)</div>
                        <div className="attack-bonus">
                          {renderAttackBonus(strMod, proficiencies.weapons.class?.proficiency || 0, mod('meleeAttack'))}
                        </div>
                      </div>
                      <div className="bonus-container">
                        <div className="attack-type">Ranged (DEX)</div>
                        <div className="attack-bonus">
                          {renderAttackBonus(dexMod, proficiencies.weapons.class?.proficiency || 0, mod('rangedAttack'))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Finesse Weapons (if available) */}
                {proficiencies.weapons.finesse && (
                  <div className="proficiency-item weapon-proficiency">
                    <div className="weapon-category">
                      <span className="proficiency-name">Finesse</span>
                      <ProficiencyPips rank={proficiencies.weapons.finesse?.proficiency || 0} showLabel={true} />
                    </div>
                    <div className="attack-bonuses">
                      <div className="bonus-container">
                        <div className="attack-type">Melee (STR/DEX)</div>
                        <div className="attack-bonus">
                          {renderAttackBonus(Math.max(strMod, dexMod), proficiencies.weapons.finesse?.proficiency || 0, mod('meleeAttack'))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="proficiency-group">
              <h4 className="proficiency-category">Armor</h4>
              <div className="proficiency-items">
                <div className="proficiency-item">
                  <span className="proficiency-name">Unarmored</span>
                  <ProficiencyPips rank={proficiencies.armor.unarmored?.proficiency || 0} showLabel={true} />
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Light</span>
                  <ProficiencyPips rank={proficiencies.armor.light?.proficiency || 0} showLabel={true} />
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Medium</span>
                  <ProficiencyPips rank={proficiencies.armor.medium?.proficiency || 0} showLabel={true} />
                </div>
                <div className="proficiency-item">
                  <span className="proficiency-name">Heavy</span>
                  <ProficiencyPips rank={proficiencies.armor.heavy?.proficiency || 0} showLabel={true} />
                </div>
              </div>
            </div>
          </div>
        );
      case 'feats':
        return (
          <FeatsList character={character} characterColor={themeColor} />
        );
      case 'skills':
        return (
          <EnhancedSkillsList
            character={character}
            characterColor={themeColor}
            activeConditions={hydratedConditions}
            effectBonuses={bonuses}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="stats-block" style={{ '--color-theme': themeColor }}>
      <div className="core-stats">
        <div className="hp-defense">
          <div className="hp-box">
            <div className="defense-name">HP</div>
            <div className="defense-value">
              <span className="hp-current">{hp?.current ?? maxHp}</span>
              {' / '}
              <PenaltyDisplay base={maxHp} penalty={mod('maxHp')} />
            </div>
            {hp?.temp > 0 && (
              <div className="hp-temp">+{hp.temp} temp</div>
            )}
            {(hp?.dying > 0 || hp?.wounded > 0) && (
              <div className="hp-status">
                {hp.dying  > 0 && <span className="hp-dying">Dying {hp.dying}</span>}
                {hp.wounded > 0 && <span className="hp-wounded">Wounded {hp.wounded}</span>}
              </div>
            )}
          </div>
          <div className="ac-box">
            <div className="defense-name">AC</div>
            <div className="defense-value">
              <PenaltyDisplay base={ac} penalty={mod('ac')} />
            </div>
          </div>
          <button
            className={`condition-box${activeConditions.length > 0 ? ' condition-box--active' : ''}`}
            onClick={() => setIsConditionModalOpen(true)}
          >
            <div className="defense-name">
              CONDITIONS
            </div>
            <div className="defense-value condition-count">
              {activeConditions.length > 0 ? activeConditions.length : '—'}
            </div>
          </button>
        </div>
      </div>

      {/* Hero Points */}
      <div className="hero-points-row">
        <span className="hero-points-label">
          Hero Points
        </span>
        <div className="hero-points-pips" role="group" aria-label="Hero points">
          {Array.from({ length: HERO_POINTS_MAX }, (_, i) => {
            const filled = i < (heroPoints ?? 0);
            return (
              <button
                key={i}
                type="button"
                className={`hero-pip${filled ? ' hero-pip--filled' : ''}`}
                aria-label={filled ? `Spend hero point ${i + 1}` : `Add hero point ${i + 1}`}
                aria-pressed={filled}
                onClick={() => handleHeroPointClick(i)}
              />
            );
          })}
        </div>
      </div>

      {/* Harrow omen (#227) — read-only row for harrowers (GM visibility);
          the suit picker lives in the Harrowing panel. */}
      {charData.hasHarrowing && (
        <div className="aura-row">
          <span className="aura-label">Harrow Omen</span>
          <span className={`aura-pill${omenSuit ? ' aura-pill--omen' : ''}`}>
            {omenSuit ? `🂠 ${omenSuit}` : 'none'}
          </span>
        </div>
      )}

      {/* Kinetic aura (#228) — only kineticists render the row. Dismiss here is
          the out-of-encounter hygiene surface (no action economy); in-encounter
          Dismiss lives on the turn tracker and spends the action. */}
      {characterHasKineticAura(character) && (
        <div className="aura-row">
          <span className="aura-label">Kinetic Aura</span>
          <span className={`aura-pill${auraActive ? ' aura-pill--active' : ''}`}>
            {auraActive ? '◈ Active' : 'Inactive'}
          </span>
          {auraActive && (
            <button
              type="button"
              className="aura-dismiss-btn"
              onClick={deactivateAura}
              aria-label="Dismiss kinetic aura"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Size and Speed Section */}
      <div className="character-attributes">
        <div className="attribute">
          <span className="attribute-label">Size</span>
          <span className="attribute-value">{size || 'teeny weeny'}</span>
        </div>
        <div className="attribute">
          <span className="attribute-label">Speed</span>
          <span className="attribute-value">
            <PenaltyDisplay base={speed || 69} penalty={mod('speed')} /> feet
          </span>
        </div>
        {senses && (
          <div className="attribute">
            <span className="attribute-label">Senses</span>
            <span className="attribute-value">{senses}</span>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="stats-tabs">
        <button
          className={`tab-button ${activeTab === 'abilities' ? 'active' : ''}`}
          onClick={() => setActiveTab('abilities')}
        >
          Abilities & Saves
        </button>
        <button
          className={`tab-button ${activeTab === 'proficiencies' ? 'active' : ''}`}
          onClick={() => setActiveTab('proficiencies')}
        >
          Proficiencies
        </button>
        <button
          className={`tab-button ${activeTab === 'feats' ? 'active' : ''}`}
          onClick={() => setActiveTab('feats')}
        >
          Feats
        </button>
        <button
          className={`tab-button ${activeTab === 'skills' ? 'active' : ''}`}
          onClick={() => setActiveTab('skills')}
        >
          Skills
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {renderTabContent()}
      </div>

      <ConditionModal
        isOpen={isConditionModalOpen}
        onClose={() => setIsConditionModalOpen(false)}
        themeColor={themeColor}
        activeConditions={hydratedConditions}
        onAdd={handleAddCondition}
        onRemove={handleRemoveCondition}
        onChangeValue={handleChangeValue}
      />
    </div>
  );
};

export default StatsBlock;
