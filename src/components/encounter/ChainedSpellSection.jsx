// ChainedSpellSection — renders the sub-action picker for Spellshape abilities
// (e.g. Reach Spell, Harrow Casting) that chain into "Cast a Spell" with an
// additive action cost. Shows the spell picker, modifier note, total cost, and
// the inline roll/save section for the chosen spell.
//
// Exposes getResults() and getTotalCost() via ref so UseAbilityModal can read
// the chosen spell, roll results, and total cost at confirm time.

import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef, useMemo } from 'react';
import TargetRollResolver from './TargetRollResolver';
import MultiRayResolver from './MultiRayResolver';
import DamagePanel from './DamagePanel';
import HeightenedNotes from './HeightenedNotes';
import { resolveActionRoll } from '../../utils/rollResolution';
import { useContent } from '../../contexts/ContentContext';
import { useOmen } from '../../hooks/useOmen';
import { DEFENSE_LABELS } from '../../utils/defense';
import { isAttackAbility } from '../../utils/map';
import { getVariableActionRange, variantFor } from '../../utils/actionIconUtils';
import { buildDamageProfile, serializeRidersForSave } from '../../utils/damage';
import { HARROW_SUITS, HARROW_CAST_DC, harrowCastEffect } from '../../utils/harrow';
import { applyChainTransform, chainTransformCostNote, effectiveNumericRank, chainRankNote } from '../../utils/spellshapeTransform';

// Same parser as UseAbilityModal — avoids a circular import.
const parseSpellCost = (actionsText) => {
  if (!actionsText) return 1;
  const t = String(actionsText).toLowerCase();
  if (t.includes('free')) return 0;
  if (t.includes('reaction')) return 'reaction';
  if (t.includes('three') || t === '3') return 3;
  if (t.includes('two') || t === '2') return 2;
  if (t.includes('one') || t === '1') return 1;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? 1 : n;
};

const costLabel = (cost) => {
  if (cost === 'reaction') return 'R';
  if (cost === 0) return 'Free';
  return String(cost);
};

const ChainedSpellSection = forwardRef(({
  character,
  chain,
  parentCost,
  enemyTargets,
  conditions,
  effects,
  onTotalCostChange,
  // Live selected-spell callback (#227) — the parent's blood magic picker
  // needs to know whether the chained spell carries the bloodline flag.
  onSpellChange,
  mapStep = 0,
  // The parent's useCastingResources instance (#235). Optional: without it the
  // section has no rank picker and the parent falls back to native-rank spend.
  resources = null,
  // The actor's active exploit weakness + full encounter order (#281) — needed
  // to scope a chained save spell's damage profile the same way the direct path
  // does. Mirrors the props ChainedStrikeSection already receives.
  exploit = null,
  order = [],
}, ref) => {
  const { effects: effectCatalog } = useContent();
  const filteredSpells = useMemo(() => {
    const spells = character?.spellcasting?.spells || [];
    if (chain.spellFilter === 'has-range') {
      return spells.filter(
        (s) => s.range && s.range.trim() !== '' && s.range.toLowerCase() !== 'touch'
      );
    }
    // Split Shot (#227): ranged single-target attack spells without a duration.
    if (chain.spellFilter === 'single-target-attack') {
      return spells.filter(
        (s) => isAttackAbility(s)
          && s.range && s.range.trim() !== '' && s.range.toLowerCase() !== 'touch'
          && (s.targets || '').trim().toLowerCase() === '1 creature'
          && !s.duration
      );
    }
    return spells;
  }, [character, chain.spellFilter]);

  const [selectedSpellId, setSelectedSpellId] = useState(
    filteredSpells.length > 0 ? filteredSpells[0].id : ''
  );

  const resolverRef = useRef(null);

  const selectedSpell = filteredSpells.find((s) => s.id === selectedSpellId) ?? filteredSpells[0] ?? null;

  // Cast-cost options for the chained spell (#235) — signature spells offer
  // one slot option per rank ≥ native, so a chained cast can heighten too.
  // null = default (first enabled option), mirroring the parent's picker.
  const [chainCastIdx, setChainCastIdx] = useState(null);
  const castOptions = resources && selectedSpell ? resources.optionsFor(selectedSpell, 'slot') : [];
  const defaultCastIdx = Math.max(0, castOptions.findIndex((o) => o.enabled));
  const selectedCastOption = castOptions[chainCastIdx ?? defaultCastIdx] || null;
  const castRank = selectedCastOption?.rank ?? (selectedSpell?.level ?? 0);
  // Heighten (#1001 S3): numeric effects (damage/healing/area) treat the spell
  // as `rankDelta` higher, while the rank actually cast — slot spent, counteract,
  // incapacitation — stays `castRank`. Only the damage profiles use this.
  const numericRank = effectiveNumericRank(castRank, chain.transform);
  const rankNote = chainRankNote(castRank, chain.transform);

  // Variable-action chained spells (#572): a Spellshape can chain into a spell
  // that costs a range of actions (Blazing Bolt, Force Barrage — "One to Three
  // Actions"). The picker pins the count so both the added cost and the
  // action-count-dependent damage tier (variantFor, #268) are right; without it
  // the spell was locked to its minimum. null = fixed-cost spell.
  const [chainActionOverride, setChainActionOverride] = useState(null);
  const variableRange = getVariableActionRange(selectedSpell);
  const chosenActions = variableRange
    ? Math.min(Math.max(chainActionOverride ?? variableRange.min, variableRange.min), variableRange.max)
    : null;
  const variant = variableRange ? variantFor(selectedSpell, chosenActions) : null;

  // `spellCost` feeds the damage/effect tier (chosenActions) and must stay the
  // real cast cost. `castActionCost` is what the caster actually pays after a
  // spellshape transform (Quickened Casting −1) — cost only, damage unchanged.
  const spellCost = selectedSpell
    ? (chosenActions ?? parseSpellCost(selectedSpell.actions))
    : 0;
  const castActionCost = applyChainTransform(spellCost, chain.transform);
  const transformNote = chainTransformCostNote(spellCost, chain.transform);
  const parentNum = typeof parentCost === 'number' ? parentCost : 1;
  const totalCost = typeof castActionCost === 'number' ? parentNum + castActionCost : parentCost;

  // Spellshape self-effect (#1001 S2): a chained spellshape may grant the caster
  // a buff whose descriptor the player picks (Energy Ablation — resistance vs a
  // chosen energy type). The chosen option flows through getResults; the parent
  // applies the parametrized effect on confirm.
  const selfEffect = chain.selfEffect || null;
  const selfEffectOptions = selfEffect?.choose?.options || [];
  const [selfEffectChoice, setSelfEffectChoice] = useState(selfEffectOptions[0] ?? null);

  // Harrow Casting (#227): the card drawn from the physical deck, the DC 11
  // flat check, and the suit's effect (enhanced when it matches the omen).
  const isHarrow = chain.harrow === true;
  const { suit: omenSuit } = useOmen(character?.id);
  const [drawnSuit, setDrawnSuit] = useState(null);
  const [flatD20, setFlatD20] = useState('');
  const [healEntered, setHealEntered] = useState('');
  const omenMatch = !!drawnSuit && drawnSuit === omenSuit;
  const harrowEffect = isHarrow && drawnSuit
    ? harrowCastEffect(drawnSuit, { spellRank: castRank, match: omenMatch })
    : null;
  const flatNum = parseInt(flatD20, 10);
  const flatPassed = Number.isNaN(flatNum) ? null : flatNum >= HARROW_CAST_DC;
  const healNum = parseInt(healEntered, 10);

  // Split Shot (#227): one roll vs both ACs (the resolver already compares a
  // single roll to every target); the player designates the second target,
  // which takes half damage and no other effects.
  const isSplitShot = chain.splitShot === true;
  const [secondaryOverride, setSecondaryOverride] = useState(null);

  const rollProfile = useMemo(() => selectedSpell
    ? resolveActionRoll(selectedSpell, character, { conditions, effects, effectCatalog, mapStep })
    : { mode: 'none', bonus: null, dc: null, defense: null },
  [selectedSpell, character, conditions, effects, effectCatalog, mapStep]);

  const resolverTargets = rollProfile.mode === 'actor-roll'
    ? enemyTargets.filter((e) => e.defenses)
    : [];

  const saveTargets = rollProfile.mode === 'target-save' ? enemyTargets : [];

  // Per-action multi-ray spells (Blazing Bolt — "one spell-attack roll per ray,
  // one ray per action") render one resolver row per ray (#581). rayCount is the
  // chosen action count; each ray shares the same damage profile (the variant
  // dice for the chosen tier) and its own d20/target, mirroring the direct path.
  const isMultiRayCast = selectedSpell?.rolls === 'per-action'
    && rollProfile.mode === 'actor-roll'
    && resolverTargets.length > 0;
  const rayCount = isMultiRayCast ? (chosenActions ?? 1) : 1;

  // Damage step (#281) — a basic-save spell chained through a Spellshape carries
  // the caster's entered total + rider snapshot, same as a direct cast, so the
  // GM's RequestedSaves derives per-degree totals. Built at the section's own
  // cast rank, with the actor's exploit weakness scoped against the targets. The
  // chosen action-count variant (#572) overrides the dice via damageOverride.
  const saveDamageProfile = saveTargets.length > 0
    ? buildDamageProfile(selectedSpell, character, {
        chosenActions: typeof spellCost === 'number' ? spellCost : null,
        castRank: numericRank,
        exploit,
        enemyEntries: saveTargets,
        order,
        damageOverride: variant?.damage ?? null,
      })
    : null;
  const [saveDmgInput, setSaveDmgInput] = useState('');
  const [saveRiderState, setSaveRiderState] = useState({});

  // Damage step (#571 single-roll, #581 multi-ray) — a spell-attack spell chained
  // through a Spellshape gets the same damage panel a direct cast does: the
  // resolver owns the panel + per-target computeTargetDamage once a `damage`
  // profile is passed. Built at the section's cast rank with the actor's exploit
  // weakness scoped against the resolver targets; the chosen variant (#572)
  // overrides the dice (per-ray for Blazing Bolt).
  const attackDamageProfile = (resolverTargets.length > 0 && rollProfile.defense === 'ac')
    ? buildDamageProfile(selectedSpell, character, {
        chosenActions: typeof spellCost === 'number' ? spellCost : null,
        castRank: numericRank,
        exploit,
        enemyEntries: resolverTargets,
        order,
        damageOverride: variant?.damage ?? null,
      })
    : null;

  // Split Shot second target: default to the second selected enemy.
  const secondaryEntry = isSplitShot && resolverTargets.length >= 2
    ? (resolverTargets.find((e) => e.entryId === secondaryOverride) || resolverTargets[1])
    : null;

  // Notify parent whenever totalCost changes so the confirm button can reflect it.
  useEffect(() => {
    onTotalCostChange?.(totalCost);
  }, [totalCost, onTotalCostChange]);

  // Surface the live spell selection (#227 — blood magic trigger detection).
  useEffect(() => {
    onSpellChange?.(selectedSpell);
  }, [selectedSpell, onSpellChange]);

  useImperativeHandle(ref, () => ({
    getResults: () => {
      if (!selectedSpell) return null;
      // Damage payload for a chained basic-save spell (#281) — the entered total
      // plus the baked rider snapshot, attached only when the caster supplied a
      // number or an enabled rider survives. Mirrors the direct path's shape.
      let damage;
      if (saveDamageProfile) {
        const enteredNum = parseInt(saveDmgInput, 10);
        const savedRiders = serializeRidersForSave(saveDamageProfile.riders, saveRiderState);
        if (!Number.isNaN(enteredNum) || savedRiders.length > 0) {
          damage = {
            entered: Number.isNaN(enteredNum) ? null : enteredNum,
            expression: saveDamageProfile.expression ?? null,
            typeLabel: saveDamageProfile.typeLabel ?? null,
            riders: savedRiders,
          };
        }
      }
      return {
        spellId:     selectedSpell.id,
        spellName:   selectedSpell.name,
        spellCost,
        chosenActions,
        totalCost,
        spellRank:     selectedSpell.level ?? 0,
        castOption:    selectedCastOption,
        castRank,
        isAttackSpell: isAttackAbility(selectedSpell),
        rollResults: resolverRef.current?.getResults() ?? null,
        // Multi-ray casts (#581) return grouped results [{rayIndex, results}];
        // the flag tells the parent to normalise + ray-prefix the log.
        multiRay: isMultiRayCast,
        saveTargets: saveTargets.length > 0 ? saveTargets : null,
        rollProfile,
        spellBasic: selectedSpell.basic === true,
        damage: damage ?? null,
        harrow: isHarrow ? {
          drawnSuit,
          omenSuit,
          match: omenMatch,
          flatD20: Number.isNaN(flatNum) ? null : flatNum,
          flatPassed,
          effect: harrowEffect,
          healEntered: Number.isNaN(healNum) ? null : healNum,
        } : null,
        spellBloodline: selectedSpell.bloodline === true,
        splitShot: isSplitShot ? {
          secondaryEntryId: secondaryEntry?.entryId ?? null,
          secondaryName: secondaryEntry?.name ?? null,
        } : null,
        selfEffectChoice: selfEffect ? selfEffectChoice : null,
      };
    },
    getTotalCost: () => totalCost,
  }));

  if (filteredSpells.length === 0) {
    return (
      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
        No qualifying spells{chain.spellFilter === 'has-range' ? ' with a range' : ''} available.
      </div>
    );
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <select
        aria-label="spell picker"
        value={selectedSpellId}
        onChange={(e) => { setSelectedSpellId(e.target.value); setChainCastIdx(null); setChainActionOverride(null); }}
        style={{ width: '100%', fontSize: '0.85rem', marginBottom: '0.4rem' }}
      >
        {filteredSpells.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.actions || '?'})
          </option>
        ))}
      </select>

      {chain.modifier && selectedSpell && (
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem', fontStyle: 'italic' }}>
          {chain.modifier}
        </div>
      )}

      {selfEffect?.choose && selfEffectOptions.length > 0 && (
        <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
          {selfEffect.choose.label || 'Choose'}:{' '}
          <select
            aria-label={selfEffect.choose.label || 'Self-effect choice'}
            value={selfEffectChoice ?? ''}
            onChange={(e) => setSelfEffectChoice(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          >
            {selfEffectOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
      )}

      {isHarrow && (
        <div
          role="group"
          aria-label="Harrow Cast"
          style={{ margin: '0.4rem 0', padding: '0.5rem', border: '1px dashed var(--shell-border-strong)', borderRadius: '6px' }}
        >
          <div style={{ fontSize: '0.85rem', marginBottom: '0.35rem' }}>
            Active omen: <strong>{omenSuit || 'none'}</strong>
          </div>
          <div role="radiogroup" aria-label="Card drawn" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '0.4rem' }}>
            {HARROW_SUITS.map((s) => (
              <label key={s.id} style={{ fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input
                  type="radio"
                  name="harrow-drawn-suit"
                  checked={drawnSuit === s.id}
                  onChange={() => setDrawnSuit(s.id)}
                  aria-label={`drawn-${s.id}`}
                  style={{ marginRight: '4px' }}
                />
                {s.id}{omenSuit === s.id ? ' ★' : ''}
              </label>
            ))}
          </div>
          <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
            Flat check (DC {HARROW_CAST_DC}) — d20:{' '}
            <input
              type="number"
              className="trr-roll-input"
              aria-label="harrow flat check d20"
              value={flatD20}
              onChange={(e) => setFlatD20(e.target.value)}
            />
            {flatPassed != null && (
              <strong style={{ marginLeft: '6px', color: flatPassed ? 'var(--color-success, #6abf69)' : 'var(--color-danger)' }}>
                {flatPassed ? 'passed' : 'failed — omen lost at end of turn'}
              </strong>
            )}
          </label>
          {harrowEffect && (
            <div className="uam-variant-note">
              {drawnSuit}{omenMatch ? ' (omen match)' : ''}: {harrowEffect.note}
            </div>
          )}
          {(harrowEffect?.kind === 'self-heal' || harrowEffect?.kind === 'target-heal') && (
            <label style={{ fontSize: '0.85rem', display: 'block', marginTop: '0.35rem' }}>
              Healing rolled ({harrowEffect.dice}):{' '}
              <input
                type="number"
                className="trr-roll-input"
                aria-label="harrow healing rolled"
                value={healEntered}
                onChange={(e) => setHealEntered(e.target.value)}
              />
            </label>
          )}
        </div>
      )}

      {isSplitShot && (
        <div
          role="group"
          aria-label="Split Shot"
          style={{ margin: '0.4rem 0', padding: '0.5rem', border: '1px dashed var(--shell-border-strong)', borderRadius: '6px' }}
        >
          {resolverTargets.length < 2 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Select two enemy targets — one attack roll is compared to both ACs (one attack for MAP).
            </div>
          )}
          {resolverTargets.length > 2 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--color-danger)' }}>
              Split Shot allows exactly two targets — deselect {resolverTargets.length - 2}.
            </div>
          )}
          {secondaryEntry && (
            <>
              <div role="radiogroup" aria-label="Second target" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem' }}>Second target:</span>
                {resolverTargets.map((e) => (
                  <label key={e.entryId} style={{ fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input
                      type="radio"
                      name="split-shot-secondary"
                      checked={secondaryEntry.entryId === e.entryId}
                      onChange={() => setSecondaryOverride(e.entryId)}
                      aria-label={`second-target-${e.name}`}
                      style={{ marginRight: '4px' }}
                    />
                    {e.name}
                  </label>
                ))}
              </div>
              <div className="uam-variant-note">
                {secondaryEntry.name} takes half damage and suffers no effects beyond the spell's initial damage.
              </div>
            </>
          )}
        </div>
      )}

      {variableRange && variableRange.max > variableRange.min && (
        <>
          <div className="uam-actions-row" role="radiogroup" aria-label="Chained spell actions">
            <span className="uam-actions-label">Actions</span>
            {Array.from(
              { length: variableRange.max - variableRange.min + 1 },
              (_, k) => variableRange.min + k
            ).map((n) => (
              <button
                key={n}
                type="button"
                className={`uam-actions-btn${chosenActions === n ? ' uam-actions-btn--active' : ''}`}
                aria-pressed={chosenActions === n}
                title={variantFor(selectedSpell, n)?.note || undefined}
                onClick={() => setChainActionOverride(n)}
              >
                {n}
              </button>
            ))}
          </div>
          {variant?.note && <div className="uam-variant-note">{variant.note}</div>}
        </>
      )}

      {castOptions.length > 1 && (
        <div className="uam-cost-options" role="radiogroup" aria-label="Chained casting source">
          {castOptions.map((opt, idx) => (
            <label
              key={`${opt.type}-${opt.rank ?? opt.key ?? idx}`}
              className={`uam-cost-option${!opt.enabled ? ' uam-cost-option--disabled' : ''}`}
            >
              <input
                type="radio"
                name="chain-cast-source"
                checked={(chainCastIdx ?? defaultCastIdx) === idx}
                onChange={() => setChainCastIdx(idx)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
      {castOptions.length === 1 && (
        <div className="uam-cost-single">{castOptions[0].label}</div>
      )}
      {selectedSpell && (
        <HeightenedNotes spell={selectedSpell} castRank={castRank} />
      )}

      {transformNote && (
        <div className="uam-variant-note" data-testid="chain-transform-note">{transformNote}</div>
      )}
      {rankNote && (
        <div className="uam-variant-note" data-testid="chain-rank-note">{rankNote}</div>
      )}

      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
        Total: {costLabel(totalCost)} action{typeof totalCost === 'number' && totalCost !== 1 ? 's' : ''}
        <span style={{ fontWeight: 'normal', marginLeft: '6px', color: 'var(--color-text-muted)' }}>
          ({costLabel(parentCost)} + {costLabel(castActionCost)})
        </span>
      </div>

      {resolverTargets.length > 0 && (
        isMultiRayCast ? (
          <MultiRayResolver
            ref={resolverRef}
            rayCount={rayCount}
            enemyTargets={resolverTargets}
            targetDefense={rollProfile.defense || 'ac'}
            rollBonus={rollProfile.bonus}
            damage={attackDamageProfile}
            degrees={selectedSpell?.degrees}
          />
        ) : (
          <TargetRollResolver
            ref={resolverRef}
            enemyTargets={resolverTargets}
            targetDefense={rollProfile.defense || 'ac'}
            rollBonus={rollProfile.bonus}
            damage={attackDamageProfile}
            degrees={selectedSpell?.degrees}
          />
        )
      )}

      {saveTargets.length > 0 && (
        <div className="ct-save-request-preview" style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          <strong>Save request → GM:</strong> {DEFENSE_LABELS[rollProfile.defense] || rollProfile.defense} DC {rollProfile.dc}
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {saveTargets.map((e) => <li key={e.entryId}>{e.name}</li>)}
          </ul>
        </div>
      )}

      {saveDamageProfile && (
        <DamagePanel
          mode="save"
          profile={saveDamageProfile}
          entered={saveDmgInput}
          onEntered={setSaveDmgInput}
          riderState={saveRiderState}
          onToggleRider={(id, on) => setSaveRiderState((cur) => ({ ...cur, [id]: on }))}
        />
      )}
    </div>
  );
});

ChainedSpellSection.displayName = 'ChainedSpellSection';

export default ChainedSpellSection;
