import React, { useState, useMemo } from 'react';
import './StatsBlock.css';
import EnhancedSkillsList from '../character-sheet/EnhancedSkillsList';
import FeatsList from '../character-sheet/FeatsList';
import ConditionModal from './ConditionModal';
import PenaltyDisplay from '../shared/PenaltyDisplay';
import RankRing from '../shared/RankRing';
import GameGlyph from '../shared/GameGlyph';
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

// Proficiency-group sigils flanking the dial — split by roll type: Defense
// (saves + Class DC) and Offense (weapon categories + Spell Attack) sit to the
// left; Armor sits alone to the right. Each carries a game-glyph sigil.
const PROF_GROUPS = [
  { key: 'defense', label: 'Defense', glyph: 'profDefense', side: 'left' },
  { key: 'offense', label: 'Offense', glyph: 'profOffense', side: 'left' },
  { key: 'armor', label: 'Armor', glyph: 'profArmor', side: 'right' },
];

// Saves ship as precomputed modifiers (no rank field), so the ring rank is
// derived by inverting getProficiencyBonus: modifier = ability + level + 2×rank
// for trained+. Any positive proficiency contribution reads at least Trained;
// odd hand-authored data rounds to the nearest rank. Display-only (the ring's
// rim color) — never fed back into roll math.
const deriveSaveRank = (saveMod, abilityMod, level) => {
  const profBonus = saveMod - abilityMod;
  if (profBonus <= 0) return 0;
  return Math.min(4, Math.max(1, Math.round((profBonus - level) / 2)));
};

const StatsBlock = ({ character, characterColor }) => {
  // Ability Dial: the active node — an ability key ('strength'…'charisma'),
  // 'core' (character-wide feats/conditions), or a proficiency-group bubble
  // ('defense' | 'offense' | 'armor'). Defaults to the character's key
  // ability so the panel opens populated.
  const [selected, setSelected] = useState(
    ABILITY_KEYS.includes(character?.keyAbility) ? character.keyAbility : 'strength'
  );
  const [coreView, setCoreView] = useState('feats');
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
    armorProficiencies,
    size,
    speed,
    senses,
    hp,
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

  // Proficiency-group panels behind the Defense / Offense / Armor bubbles
  // (attribute panels are skills-only): Defense = the three saves (rank
  // derived from the modifier, vs-X hints ride the rings) + Class DC;
  // Offense = weapon categories (melee value, ranged caption) + Spell
  // Attack for casters; Armor = the four categories (ring value is the
  // proficiency bonus contributed to AC).
  const renderGroupPanel = (groupKey) => {
    const rankOf = (group, key) => group?.[key]?.proficiency || 0;

    if (groupKey === 'defense') {
      // Class DC's rank ships at character.proficiencies.class; default Trained,
      // matching calculateClassDC's derivation.
      const classRank = rawProficiencies?.class ?? 1;
      return (
        <div className="snode-wrap">
          {Object.entries(SAVES_BY_ABILITY).map(([abilityKey, save]) => {
            const rank = deriveSaveRank(saves[save.saveKey], abilityModifiers[abilityKey], level);
            return (
              <RankRing
                key={save.saveKey}
                rank={rank}
                name={save.label}
                caption={getProficiencyLabel(rank)}
                value={
                  <PenaltyDisplay
                    base={saves[save.saveKey]}
                    penalty={mod(save.stat)}
                    format="modifier"
                  />
                }
                hint={renderConditionalHint(save.stat)}
              />
            );
          })}
          <RankRing
            rank={classRank}
            name="Class DC"
            caption={getProficiencyLabel(classRank)}
            value={<PenaltyDisplay base={classDC} penalty={mod('classDC')} />}
          />
        </div>
      );
    }

    if (groupKey === 'offense') {
      const weaponCats = [
        { key: 'unarmed', name: 'Unarmed' },
        { key: 'simple', name: 'Simple' },
        { key: 'martial', name: 'Martial' },
        { key: 'advanced', name: 'Advanced' },
        ...(proficiencies.weapons.class ? [{ key: 'class', name: 'Class Weapons' }] : []),
        ...(proficiencies.weapons.finesse ? [{ key: 'finesse', name: 'Finesse', finesse: true }] : []),
      ];
      const spellRank = character?.spellcasting?.proficiency || 0;
      return (
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
          {flags?.hasSpellcasting && (
            <RankRing
              rank={spellRank}
              name="Spell Attack"
              caption={getProficiencyLabel(spellRank)}
              value={<PenaltyDisplay base={spellStats?.spellAttackMod ?? 0} penalty={mod('spellAttack')} format="modifier" />}
            />
          )}
        </div>
      );
    }

    // armor
    const armorCats = [
      { key: 'unarmored', name: 'Unarmored' },
      { key: 'light', name: 'Light' },
      { key: 'medium', name: 'Medium' },
      { key: 'heavy', name: 'Heavy' },
    ];
    return (
      <>
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
        {/* Conditional AC bonuses (#1411) — e.g. Shield Harness's "+1 vs attacks
            while flanked (worn on your back)". AC lives in the compact dial core
            with no room for a hint, so its conditional modifiers surface here in
            the Armor panel, the same #338 path the save rings use. */}
        {renderConditionalHint('ac')}
      </>
    );
  };

  // Core panel conditions view — the condition tracker folded into the
  // dial (the status-strip chip is gone). Active conditions render inline
  // with their controls; the browse/add surface stays in ConditionModal.
  const renderConditions = () => (
    <div className="cond-panel">
      {hydratedConditions.length === 0 ? (
        <p className="cond-empty">No active conditions.</p>
      ) : (
        <ul className="cond-list">
          {hydratedConditions.map((cond) => (
            <li key={cond.id} className="cond-row">
              <div className="cond-row-head">
                <span className="cond-name">
                  {cond.name}
                  {cond.valued && <span className="cond-value-badge">{cond.value}</span>}
                </span>
                {/* Bulk-derived rows (SP3, #1222) are auto-managed — no
                    adjust/remove controls; suppress them via the modal's
                    footer toggle instead. */}
                {cond.derived ? (
                  <span className="cond-auto" title="Derived from carried Bulk">auto</span>
                ) : (
                  <span className="cond-controls">
                    {cond.valued && (
                      <>
                        <button
                          type="button"
                          className="cond-ctrl"
                          onClick={() => handleChangeValue(cond.id, -1)}
                          aria-label={`Decrease ${cond.name}`}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          className="cond-ctrl"
                          onClick={() => handleChangeValue(cond.id, 1)}
                          disabled={cond.value >= cond.maxValue}
                          aria-label={`Increase ${cond.name}`}
                        >
                          +
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="cond-ctrl cond-ctrl--remove"
                      onClick={() => handleRemoveCondition(cond.id)}
                      aria-label={`Remove ${cond.name}`}
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
              <p className="cond-effect">{cond.effect(cond.value)}</p>
              {cond.decrements && (
                <span className="cond-decrement">Decrements each round</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="cond-add-btn"
        onClick={() => setIsConditionModalOpen(true)}
      >
        + Add Condition
      </button>
    </div>
  );

  // Ability Dial panel context — the selected node's identity and how many
  // catalog skills its cluster holds, or the selected proficiency-group
  // bubble. `offRing` = the selection stepped out of the six-node ring
  // (core or a bubble), which dims the nodes.
  const selectedAbility = ABILITIES.find((a) => a.key === selected);
  const selectedGroup = PROF_GROUPS.find((g) => g.key === selected);
  const selectedSkillCount = selectedAbility ? skillsForAbility(selected).length : 0;
  const offRing = selected === 'core' || !!selectedGroup;

  // AC core rim = the worn armor category's proficiency rank, riding the same
  // --color-rank-* ramp as every other ring in the tab (rank rim consistency).
  const acRank = armorProficiencies?.[armorClass?.category || 'unarmored']?.rank ?? 0;

  return (
    <div className="stats-block" style={{ '--color-theme': themeColor }}>
      {/* Status strip — passive traits in the dial's chip idiom. The
          condition tracker lives in the dial core's Conditions view;
          HP/AC/hero points live in the pinned masthead. */}
      <div className="status-strip">
        {/* Dying / Wounded — surfaced here as the player's visible HP-status
            signal (they were previously only in a display:none slab). The
            GM/bridge drives the values via cnmh_hp_<id>; HP itself lives in
            the masthead. */}
        {hp?.dying > 0 && (
          <span className="hp-status-chip hp-status-chip--dying hp-dying">
            Dying {hp.dying}
          </span>
        )}
        {hp?.wounded > 0 && (
          <span className="hp-status-chip hp-status-chip--wounded hp-wounded">
            Wounded {hp.wounded}
          </span>
        )}
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

      {/* Ability Dial — six ability nodes ringing the AC core, flanked by the
          proficiency-group sigils: Defense + Offense to the left, Armor alone
          to the right. Tapping a node loads that ability's skills into the
          panel below; tapping the core or a sigil steps out of the ring (nodes
          dim) and opens the character-wide panel. Replaces the old Abilities /
          Proficiencies / Feats / Skills segmented control. */}
      <div className="dialwrap">
        <div className="prof-flank prof-flank--left" role="group" aria-label="Defense and Offense proficiencies">
          {PROF_GROUPS.filter((g) => g.side === 'left').map((g) => (
            <button
              key={g.key}
              type="button"
              className={`prof-sigil${selected === g.key ? ' sel' : ''}`}
              aria-pressed={selected === g.key}
              aria-label={g.label}
              onClick={() => setSelected(g.key)}
            >
              <GameGlyph name={g.glyph} className="prof-sigil-icon" />
            </button>
          ))}
        </div>

        <div className="dial">
          <div className="dial-ring" aria-hidden="true" />
          {ABILITIES.map((a) => (
            <button
              key={a.key}
              type="button"
              className={`node node--${a.abbr.toLowerCase()}${selected === a.key ? ' sel' : ''}${offRing ? ' dim' : ''}`}
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
            className={`dial-center rank-${acRank}${selected === 'core' ? ' sel' : ''}`}
            aria-pressed={selected === 'core'}
            aria-label="Character feats and conditions"
            title={acSourceLabel}
            onClick={() => setSelected('core')}
          >
            <span className="core-label">AC</span>
            <span className="core-value">
              <PenaltyDisplay base={acBase} penalty={mod('ac')} />
            </span>
          </button>
        </div>

        <div className="prof-flank prof-flank--right" role="group" aria-label="Armor proficiencies">
          {PROF_GROUPS.filter((g) => g.side === 'right').map((g) => (
            <button
              key={g.key}
              type="button"
              className={`prof-sigil${selected === g.key ? ' sel' : ''}`}
              aria-pressed={selected === g.key}
              aria-label={g.label}
              onClick={() => setSelected(g.key)}
            >
              <GameGlyph name={g.glyph} className="prof-sigil-icon" />
            </button>
          ))}
        </div>
      </div>

      {/* Dial panel — swaps with the selection. Ability nodes show their
          skill cluster (EnhancedSkillsList narrowed to the ability); the
          bubbles show their proficiency-ring group; the core hosts the
          Feats / Conditions toggle. */}
      <div className="dial-panel">
        {selected === 'core' ? (
          <>
            <div className="panel-h">
              <div className="ptoggle" role="group" aria-label="Core view">
                <button
                  type="button"
                  className={`ptoggle-btn${coreView === 'feats' ? ' active' : ''}`}
                  onClick={() => setCoreView('feats')}
                >
                  Feats
                </button>
                <button
                  type="button"
                  className={`ptoggle-btn${coreView === 'conditions' ? ' active' : ''}`}
                  onClick={() => setCoreView('conditions')}
                >
                  Conditions
                  {hydratedConditions.length > 0 && (
                    <span className="ptoggle-count">{hydratedConditions.length}</span>
                  )}
                </button>
              </div>
            </div>
            {coreView === 'feats'
              ? <FeatsList character={character} characterColor={themeColor} />
              : renderConditions()}
          </>
        ) : selectedGroup ? (
          <>
            <div className="panel-h">
              <span className="panel-title">{selectedGroup.label}</span>
            </div>
            {renderGroupPanel(selectedGroup.key)}
          </>
        ) : (
          <>
            <div className="panel-h">
              <span className="panel-title">
                {selectedAbility.abbr} · {formatModifier(abilityModifiers[selected])}
              </span>
              <span className="panel-count">
                {selectedSkillCount} skill{selectedSkillCount === 1 ? '' : 's'}
              </span>
            </div>
            <EnhancedSkillsList
              key={selected}
              character={character}
              characterColor={themeColor}
              activeConditions={hydratedConditions}
              effectBonuses={bonuses}
              conditionalEffects={effectsList}
              conditionalCatalog={catalogList}
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
