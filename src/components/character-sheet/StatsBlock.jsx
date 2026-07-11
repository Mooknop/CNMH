import React, { useState, useMemo } from 'react';
import './StatsBlock.css';
import EnhancedSkillsList from '../character-sheet/EnhancedSkillsList';
import FeatsList from '../character-sheet/FeatsList';
import ConditionModal from './ConditionModal';
import PenaltyDisplay from '../shared/PenaltyDisplay';
import RankRing from '../shared/RankRing';
import { formatModifier, getProficiencyBonus, getProficiencyLabel } from '../../utils/CharacterUtils';
import { useCharacter } from '../../hooks/useCharacter';
import { useResolvedEffects } from '../../hooks/useResolvedEffects';
import { useAura } from '../../hooks/useAura';
import { useOmen } from '../../hooks/useOmen';
import { usePlaying } from '../../hooks/usePlaying';
import { characterHasKineticAura } from '../../utils/kineticAura';
import { computeConditionEffects, withDerivedEncumbrance } from '../../utils/ConditionUtils';
import { computeEffectBonuses, combineModifiers, conditionalModifiersFor } from '../../utils/EffectUtils';
import { useSyncedState as useLocalStorage } from '../../hooks/useSyncedState';
import { getCondition, hydrateConditions } from '../../data/pf2eConditions';
import { speedModifier } from '../../utils/speed';
import { RELAY, syncKey } from '../../sync/keys';
import { ABILITIES, SAVES_BY_ABILITY, skillsForAbility } from '../../data/skills';

const ABILITY_KEYS = ABILITIES.map((a) => a.key);
const EMPTY_MOD = { total: 0, sources: [] };

const StatsBlock = ({ character, characterColor }) => {
  // Ability Dial: the active node — an ability key ('strength'…'charisma')
  // or 'core' (character-wide proficiencies/feats). Defaults to the
  // character's key ability so the panel opens populated.
  const [selected, setSelected] = useState(
    ABILITY_KEYS.includes(character?.keyAbility) ? character.keyAbility : 'strength'
  );
  const [coreView, setCoreView] = useState('profs');
  const characterKey = character?.id || 'unknown';
  const [activeConditions, setActiveConditions] = useLocalStorage(syncKey(RELAY.CONDITIONS, characterKey), []);
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

  // Data layer — all character reads go through this hook
  const charData = useCharacter(character);

  // Re-derive full condition objects (with `effect`) for display/computation.
  // Bulk-derived encumbrance (SP3, #1222) is appended here — Encumbered +
  // Clumsy 1 as non-removable `derived` rows — so the tracker, the condition
  // penalties below and EnhancedSkillsList all see the same augmented list.
  // The Speed spine applies the same augmentation inside useCharacter.
  const encumbranceDerived = !!charData?.encumbrance?.derived;
  const hydratedConditions = useMemo(
    () => hydrateConditions(withDerivedEncumbrance(activeConditions, encumbranceDerived)),
    [activeConditions, encumbranceDerived]
  );

  // The full effect universe + its catalog (Rules of Hooks: unconditional).
  // app + Foundry effects plus the synthetic raised-shield and worn-gear effects
  // (potency AC, resilient saves, typed resistance, …), with the dynamic synth
  // defs appended to the catalog so every reader resolves them (#922 S2).
  const { effects: effectsList, catalog: catalogList } = useResolvedEffects(
    characterKey,
    charData?.inventory,
  );

  // Kinetic aura (#228) — badge + out-of-encounter Dismiss for kineticists.
  const { active: auraActive, deactivate: deactivateAura } = useAura(characterKey);

  // 'While playing' (#935) — Composition-sustained performance flag.
  const { playing, stop: stopPlaying } = usePlaying(characterKey);

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
    ac,
    armorClass,
    size,
    speed,
    senses,
    skillModifiers,
    skillProficiencies,
    flags,
    spellStats,
  } = charData;

  const themeColor = characterColor || 'var(--color-primary)';
  const strMod = abilityModifiers.strength;
  const dexMod = abilityModifiers.dexterity;

  // AC base (AC4, #750): the worn-armor-derived value (10 + proficiency +
  // capped Dex + armor item bonus) when available, else the synced scalar.
  // Effect bonuses (Raise a Shield, conditions, the worn-gear magic layer)
  // still layer on top via mod('ac') / bestOfKind below. The derived AC is
  // display-only — the app never commits it back to the doc (the scalar stays
  // the authored fallback), so it sits outside the #555 reconciliation.
  const acBase = armorClass?.value ?? ac;
  const acSourceLabel = !armorClass?.derived
    ? 'Synced Armor Class'
    : armorClass.armorName
      ? `Derived from ${armorClass.armorName} (10 + proficiency + Dex + armor)`
      : 'Derived (10 + unarmored proficiency + Dex)';

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

  // Combine condition penalties with effect bonuses (effectsList/catalogList
  // already fold in the raised shield and worn gear — see useResolvedEffects).
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

  // Core panel proficiencies (Ability Dial S2) — the old attack table
  // rendered as mini rank-ring clusters: perception / class DC / spell
  // attack, then weapon and armor category ranks. Ring value is the roll
  // modifier (weapons: melee, with ranged as the caption; armor: the
  // proficiency bonus contributed to AC).
  const renderProficiencies = () => {
    const rankOf = (group, key) => group?.[key]?.proficiency || 0;
    // Class DC's rank ships at character.proficiencies.class; default Trained,
    // matching calculateClassDC's derivation.
    const classRank = rawProficiencies?.class ?? 1;
    const spellRank = character?.spellcasting?.proficiency || 0;
    const perceptionMods = combineModifiers(
      effects.skillPenalty('wisdom'),
      bonuses.perception ?? EMPTY_MOD
    );

    const weaponCats = [
      { key: 'unarmed', name: 'Unarmed' },
      { key: 'simple', name: 'Simple' },
      { key: 'martial', name: 'Martial' },
      { key: 'advanced', name: 'Advanced' },
      ...(proficiencies.weapons.class ? [{ key: 'class', name: 'Class Weapons' }] : []),
      ...(proficiencies.weapons.finesse ? [{ key: 'finesse', name: 'Finesse', finesse: true }] : []),
    ];
    const armorCats = [
      { key: 'unarmored', name: 'Unarmored' },
      { key: 'light', name: 'Light' },
      { key: 'medium', name: 'Medium' },
      { key: 'heavy', name: 'Heavy' },
    ];

    return (
      <div className="proficiencies-section">
        <h4 className="proficiency-category">Checks</h4>
        <div className="snode-wrap">
          <RankRing
            rank={skillProficiencies?.perception || 0}
            name="Perception"
            caption={getProficiencyLabel(skillProficiencies?.perception || 0)}
            value={<PenaltyDisplay base={skillModifiers?.perception || 0} penalty={perceptionMods} format="modifier" />}
          />
          <RankRing
            rank={classRank}
            name="Class DC"
            caption={getProficiencyLabel(classRank)}
            value={<PenaltyDisplay base={classDC} penalty={mod('classDC')} />}
          />
          {flags?.hasSpellcasting && (
            <RankRing
              rank={spellRank}
              name="Spell Attack"
              caption={getProficiencyLabel(spellRank)}
              value={<PenaltyDisplay base={spellStats?.spellAttackMod ?? 0} penalty={mod('spellAttack')} format="modifier" />}
            />
          )}
        </div>

        <h4 className="proficiency-category">Weapons</h4>
        <div className="snode-wrap">
          {weaponCats.map((w) => {
            const rank = rankOf(proficiencies.weapons, w.key);
            const meleeMod = w.finesse ? Math.max(strMod, dexMod) : strMod;
            return (
              <RankRing
                key={w.key}
                rank={rank}
                name={w.name}
                value={renderAttackBonus(meleeMod, rank, mod('meleeAttack'))}
                caption={w.finesse
                  ? 'Melee (STR/DEX)'
                  : `Ranged ${formatModifier(attackNum(dexMod, rank))}`}
              />
            );
          })}
        </div>

        <h4 className="proficiency-category">Armor</h4>
        <div className="snode-wrap">
          {armorCats.map((a) => {
            const rank = rankOf(proficiencies.armor, a.key);
            return (
              <RankRing
                key={a.key}
                rank={rank}
                name={a.name}
                caption={getProficiencyLabel(rank)}
                value={formatModifier(getProficiencyBonus(rank, level))}
              />
            );
          })}
        </div>
      </div>
    );
  };

  // Ability Dial panel context — the selected node's identity, its governed
  // save (CON→Fort, DEX→Ref, WIS→Will; the rest have none), and how many
  // catalog skills its cluster holds.
  const selectedAbility = ABILITIES.find((a) => a.key === selected);
  const selectedSave = SAVES_BY_ABILITY[selected];
  const selectedSkillCount = selectedAbility ? skillsForAbility(selected).length : 0;

  return (
    <div className="stats-block" style={{ '--color-theme': themeColor }}>
      {/* Status strip — conditions + passive traits in the dial's chip
          idiom. The conditions chip is dashed while dormant (no active
          conditions) and goes solid gold when any are; HP/AC/hero points
          live in the pinned masthead. */}
      <div className="status-strip">
        <button
          type="button"
          className={`cond-chip${hydratedConditions.length > 0 ? ' cond-chip--active' : ''}`}
          onClick={() => setIsConditionModalOpen(true)}
        >
          Conditions
          <span className="cond-count">
            {hydratedConditions.length > 0 ? hydratedConditions.length : '—'}
          </span>
        </button>
        <span className="tchip">
          <span className="tchip-label">Size</span>
          {size || 'teeny weeny'}
        </span>
        {/* Speed spine (SP1, #1220): useCharacter derives the total (base +
            conditions + effect stat:'speed' mods, floored at 5 ft). Do NOT
            layer mod('speed') here — that channel is already inside the
            derivation, and re-applying it would double-count mutagens et al.
            The breakdown rides PenaltyDisplay's tooltip like every other stat. */}
        <span className="tchip">
          <span className="tchip-label">Speed</span>
          <PenaltyDisplay base={speed?.base ?? 0} penalty={speedModifier(speed)} /> ft
        </span>
        {senses && (
          <span className="tchip">
            <span className="tchip-label">Senses</span>
            {senses}
          </span>
        )}
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

      {/* 'While playing' (#935) — transient row while a Composition performance
          is sustained. Normally lapses on the turn-boundary sweep / encounter
          end; Stop is the manual override for table rulings. */}
      {playing && (
        <div className="aura-row">
          <span className="aura-label">Playing</span>
          <span className="aura-pill aura-pill--active">♪ Playing</span>
          <button
            type="button"
            className="aura-dismiss-btn"
            onClick={stopPlaying}
            aria-label="Stop playing"
          >
            Stop
          </button>
        </div>
      )}

      {/* Ability Dial — six ability nodes ringing the AC core. Tapping a
          node loads that ability's save + skills into the panel below;
          tapping the core steps out of the ring (nodes dim) and opens the
          character-wide Proficiencies / Feats panel. Replaces the old
          Abilities / Proficiencies / Feats / Skills segmented control. */}
      <div className="dialwrap">
        <div className="dial">
          <div className="dial-ring" aria-hidden="true" />
          {ABILITIES.map((a) => (
            <button
              key={a.key}
              type="button"
              className={`node node--${a.abbr.toLowerCase()}${selected === a.key ? ' sel' : ''}${selected === 'core' ? ' dim' : ''}`}
              aria-pressed={selected === a.key}
              aria-label={`${a.name} ${formatModifier(abilityModifiers[a.key])}`}
              onClick={() => setSelected(a.key)}
            >
              <span className="node-abbr">{a.abbr}</span>
              <span className="node-mod">{formatModifier(abilityModifiers[a.key])}</span>
            </button>
          ))}
          <button
            type="button"
            className={`dial-center${selected === 'core' ? ' sel' : ''}`}
            aria-pressed={selected === 'core'}
            aria-label="Character proficiencies and feats"
            title={acSourceLabel}
            onClick={() => setSelected('core')}
          >
            <span className="core-label">AC</span>
            <span className="core-value">
              <PenaltyDisplay base={acBase} penalty={mod('ac')} />
            </span>
          </button>
        </div>
      </div>

      {/* Dial panel — swaps with the selection. Skill rows reuse
          EnhancedSkillsList narrowed to the node's ability; the core hosts
          the Proficiencies / Feats toggle. */}
      <div className="dial-panel">
        {selected === 'core' ? (
          <>
            <div className="panel-h">
              <div className="ptoggle" role="group" aria-label="Core view">
                <button
                  type="button"
                  className={`ptoggle-btn${coreView === 'profs' ? ' active' : ''}`}
                  onClick={() => setCoreView('profs')}
                >
                  Proficiencies
                </button>
                <button
                  type="button"
                  className={`ptoggle-btn${coreView === 'feats' ? ' active' : ''}`}
                  onClick={() => setCoreView('feats')}
                >
                  Feats
                </button>
              </div>
            </div>
            {coreView === 'profs'
              ? renderProficiencies()
              : <FeatsList character={character} characterColor={themeColor} />}
          </>
        ) : (
          <>
            <div className="panel-h">
              <span className="panel-title">
                {selectedAbility.abbr} · {formatModifier(abilityModifiers[selected])}
              </span>
              {selectedSave && (
                <span className="panel-save">
                  {selectedSave.label}{' '}
                  <PenaltyDisplay
                    base={saves[selectedSave.saveKey]}
                    penalty={mod(selectedSave.stat)}
                    format="modifier"
                  />
                </span>
              )}
              <span className="panel-count">
                {selectedSkillCount} skill{selectedSkillCount === 1 ? '' : 's'}
              </span>
            </div>
            {selectedSave && renderConditionalHint(selectedSave.stat)}
            <EnhancedSkillsList
              key={selected}
              character={character}
              characterColor={themeColor}
              activeConditions={hydratedConditions}
              effectBonuses={bonuses}
              filterAbility={selected}
            />
          </>
        )}
      </div>

      <ConditionModal
        isOpen={isConditionModalOpen}
        onClose={() => setIsConditionModalOpen(false)}
        themeColor={themeColor}
        activeConditions={hydratedConditions}
        onAdd={handleAddCondition}
        onRemove={handleRemoveCondition}
        onChangeValue={handleChangeValue}
        encumbrance={charData.encumbrance}
        totalBulk={charData.totalBulk}
        encumberedThreshold={charData.bulkStats?.encumberedThreshold}
      />
    </div>
  );
};

export default StatsBlock;
