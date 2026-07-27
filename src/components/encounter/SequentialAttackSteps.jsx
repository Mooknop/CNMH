// SequentialAttackSteps — the sequential per-step roll driver for multi-ray
// and chained attack casts (#1691, Roll Resolution redesign workstream J).
//
// LOCKED DESIGN: sequential, one step at a time. Each "step" (a ray, a chained
// strike, a Flurry's second attack) gets its own RollEntry tap pad; committing
// one step freezes its face + degrees and advances to the next. Once every
// step is committed, the damage step comes ONCE, grouped: one DamageEntry row
// per step that landed a hit, all shown together, sharing the rider toggles
// and the Crit x2 checkbox (the same "un-doubled" convention DamagePanel used).
//
// This is the shared engine behind three call sites:
//   - MultiRayResolver (direct multi-ray abilities AND chained per-action
//     multi-ray spells, #581) — one step per ray, each scoped to its own
//     chosen target.
//   - ChainedStrikeSection (#222/#511) — one step (Strike) or two (Flurry of
//     Blows), each with its own MAP-adjusted bonus, both against the same
//     enemyTargets.
//   - ChainedSpellSection's single-target attack-mode chain (#571) — one step.
//
// getResults() is PULL-based, mirroring TargetRollResolver's computeResults():
// callable at any time, reflecting whatever has been committed so far. A step
// that has not been rolled yet is simply absent — the "drops rays with no d20
// entered" contract from the pre-redesign MultiRayResolver carries over.
//
// Damage is resolved INLINE, before any outer confirm — there is no separate
// RollSheet amount phase here. Once every step is committed, one DamageEntry
// row appears per step that needs an amount (HIT_DEGREES), grouped together;
// filling them in is what "the amount step, once, after the last ray" means
// in this widget (see the PR body for why this reads as one grouped screen
// rather than a second RollSheet phase).

import React, { useImperativeHandle, useState, forwardRef } from 'react';
import RollEntry from '../shared/RollEntry';
import DamageEntry from '../shared/DamageEntry';
import { buildAttackResults, rangeNoteFor } from '../../utils/attackResults';
import {
  damageEntryParts, damageRollFormulas, riderEnabled, computeTargetDamage,
} from '../../utils/damage';
import { DEFENSE_LABELS } from '../../utils/defense';
import { DEGREE_LABELS, degreeLabel } from '../../utils/degreeDisplay';
import './SequentialAttackSteps.css';

const parseTotal = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

/**
 * @param {Array}   steps - [{ key?, label, enemyTargets, rollBonus, toggles,
 *   rangeByEntry, rollFlavor, extra }], one per sequential step. `extra` is an
 *   optional ReactNode rendered above that step's die pad (MultiRayResolver's
 *   per-ray target select).
 * @param {string}  defense
 * @param {Object}  [damage]  - shared buildDamageProfile() output, or null
 * @param {Object}  [degrees] - authored degree-of-success text (ability.degrees)
 * @param {string}  [charId]
 * @param {Function} [onProgress] - (completedCount, total) => void, so a host
 *   mounted OUTSIDE this widget (UseAbilityModal's direct multi-ray branch)
 *   can track completion for its own blockLine/summary.
 */
const SequentialAttackSteps = forwardRef(({
  steps = [],
  defense,
  damage = null,
  degrees = null,
  charId = null,
  onProgress,
}, ref) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [committed, setCommitted] = useState([]); // [{ stepIndex, face, results, adjust, adjustSources }]
  const [face, setFace] = useState(null);
  const [toggledByStep, setToggledByStep] = useState({});
  const [circumstanceByStep, setCircumstanceByStep] = useState({});
  const [riderState, setRiderState] = useState({});
  const [critDouble, setCritDouble] = useState(true);
  const [amounts, setAmounts] = useState({});

  const stepCount = steps.length;
  const allCommitted = stepCount > 0 && committed.length === stepCount;

  const activeToggledIds = toggledByStep[stepIndex] || [];
  const activeCircumstance = circumstanceByStep[stepIndex] ?? '';

  const stepAdjust = (i, step) => {
    const toggledIds = toggledByStep[i] || [];
    const activeToggles = (step.toggles || []).filter((t) => toggledIds.includes(t.id));
    const freeform = parseInt(circumstanceByStep[i] ?? '', 10);
    const adjust = activeToggles.reduce((s, t) => s + (t.bonus || 0), 0)
      + (Number.isNaN(freeform) ? 0 : freeform);
    const adjustSources = [
      ...activeToggles.map((t) => t.label),
      ...(Number.isNaN(freeform) || freeform === 0
        ? [] : [`${freeform > 0 ? '+' : ''}${freeform} circumstance`]),
    ];
    return { adjust, adjustSources };
  };

  const commitStep = (f) => {
    if (f == null || stepIndex >= stepCount) return;
    const step = steps[stepIndex];
    const { adjust, adjustSources } = stepAdjust(stepIndex, step);
    const results = buildAttackResults({
      enemyTargets: step.enemyTargets || [],
      defense,
      face: f,
      rollBonus: step.rollBonus,
      adjust,
      adjustSources,
      rangeByEntry: step.rangeByEntry || null,
      damage: null, // degree only — damage is resolved from the grouped entry below
    });
    const next = [...committed, { stepIndex, face: f, results, adjust, adjustSources }];
    setCommitted(next);
    setFace(null);
    setStepIndex((i) => i + 1);
    onProgress?.(next.length, stepCount);
  };

  const entryParts = damage ? damageEntryParts(damage, riderState) : [];
  const formulas = damage ? damageRollFormulas(damage, riderState) : {};

  const hitSteps = committed.filter((c) =>
    (c.results || []).some((r) => r.degree === 'success' || r.degree === 'criticalSuccess'));

  const groupedParts = (damage && hitSteps.length > 0 && entryParts.length > 0)
    ? hitSteps.flatMap((c) => entryParts.map((p) => ({
        ...p,
        key: `step${c.stepIndex}-${p.key}`,
        formula: formulas[p.key] ?? p.dice,
        label: [
          stepCount > 1 ? (steps[c.stepIndex]?.label || null) : null,
          c.results[0]?.name,
        ].filter(Boolean).join(' · '),
      })))
    : [];

  /** Resolve a committed step's damage from the grouped `amounts` entry. */
  const resolveStepDamage = (c, step) => c.results.map((r) => {
    if (!damage) return r;
    const partsForStep = entryParts.map((p) => ({ ...p, key: `step${c.stepIndex}-${p.key}` }));
    const multiPart = partsForStep.length > 1;
    const entered = multiPart ? null : parseTotal(amounts[partsForStep[0]?.key]);
    const instances = multiPart
      ? partsForStep.map((p) => ({ amount: parseTotal(amounts[p.key]), type: p.type || '' }))
      : null;
    const target = (step.enemyTargets || []).find((e) => e.entryId === r.entryId);
    return {
      ...r,
      damage: computeTargetDamage({
        entered,
        instances,
        degree: r.degree,
        riders: damage.riders,
        riderState,
        entryId: r.entryId,
        critDouble,
        typeLabel: damage.typeLabel,
        defenses: target?.defenses,
        iwrTags: damage.iwrTags,
      }),
    };
  });

  useImperativeHandle(ref, () => ({
    /** [{ rayIndex, results }] — only steps that have been rolled. */
    getResults: () => committed.map((c) => ({
      rayIndex: c.stepIndex,
      results: resolveStepDamage(c, steps[c.stepIndex]),
    })),
    isComplete: () => allCommitted,
  }));

  if (stepCount === 0) return null;

  const current = stepIndex < stepCount ? steps[stepIndex] : null;

  return (
    <div className="sas-section">
      {committed.map((c) => {
        const step = steps[c.stepIndex];
        return (
          <div className="sas-receipt" key={c.stepIndex}>
            <span className="sas-receipt-label">{step.label || 'Roll'}</span>
            <span className="sas-receipt-face">d20 {c.face}</span>
            {c.results.map((r) => (
              <span key={r.entryId} className={`sas-receipt-chip sas-tone--${r.degree || 'none'}`}>
                {r.name} · {degreeLabel(r.degree, { attack: defense === 'ac' })}
              </span>
            ))}
          </div>
        );
      })}

      {current && (
        <div className="sas-step">
          <div className="sas-step-head">
            <span className="sas-step-label">{current.label || 'Roll'}</span>
          </div>
          {current.extra}

          {(current.toggles || []).length > 0 && (
            <div className="sas-toggle-row" role="group" aria-label="situational bonuses">
              {current.toggles.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`trr-toggle${activeToggledIds.includes(t.id) ? ' trr-toggle--active' : ''}`}
                  aria-pressed={activeToggledIds.includes(t.id)}
                  onClick={() => setToggledByStep((cur) => {
                    const ids = cur[stepIndex] || [];
                    return {
                      ...cur,
                      [stepIndex]: ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id],
                    };
                  })}
                >
                  {t.label} {t.bonus >= 0 ? `+${t.bonus}` : t.bonus}
                </button>
              ))}
            </div>
          )}

          <input
            type="number"
            className="trr-circ-input"
            placeholder="± circ"
            aria-label="other circumstance"
            value={activeCircumstance}
            onChange={(e) => setCircumstanceByStep((cur) => ({ ...cur, [stepIndex]: e.target.value }))}
          />

          <RollEntry
            face={face}
            onFaceChange={setFace}
            onCommit={commitStep}
            bonus={current.rollBonus != null
              ? current.rollBonus + stepAdjust(stepIndex, current).adjust
              : null}
            bonusLabel={defense === 'ac' ? 'attack' : (DEFENSE_LABELS[defense] || 'check')}
            dcLine={(current.enemyTargets || [])
              .map((e) => `${e.name} ${DEFENSE_LABELS[defense] || defense}`).join(' · ')}
            charId={charId}
            flavor={current.rollFlavor || ''}
          />
          <button
            type="button"
            className="sas-pill"
            disabled={face == null}
            onClick={() => commitStep(face)}
          >
            {current.commitLabel || `Confirm ${current.label || 'roll'}`}
          </button>
        </div>
      )}

      {allCommitted && groupedParts.length > 0 && (
        <div className="sas-amount">
          <p className="sas-amount-heading">Damage · un-doubled</p>
          <div className="sas-parts">
            {groupedParts.map((part) => (
              <div className="sas-part-row" key={part.key}>
                {part.label && <span className="sas-part-label">{part.label}</span>}
                <DamageEntry
                  part={part}
                  value={amounts[part.key] ?? ''}
                  onChange={(v) => setAmounts((cur) => ({ ...cur, [part.key]: v }))}
                  charId={charId}
                  flavor={current?.rollFlavor || steps[0]?.rollFlavor || ''}
                />
              </div>
            ))}
          </div>
          {(committed.some((c) => c.results.some((r) => r.degree === 'criticalSuccess'))) && (
            <label className="dmg-rider-toggle">
              <input
                type="checkbox"
                checked={critDouble}
                onChange={(e) => setCritDouble(e.target.checked)}
              />
              <span>Crit ×2</span>
            </label>
          )}
          {(damage.riders || []).length > 0 && (
            <div className="dmg-riders" role="group" aria-label="damage riders">
              {damage.riders.map((rider) => (
                <label key={rider.id} className="dmg-rider-toggle">
                  <input
                    type="checkbox"
                    checked={riderEnabled(rider, riderState)}
                    onChange={(e) => setRiderState((cur) => ({ ...cur, [rider.id]: e.target.checked }))}
                  />
                  <span>
                    {rider.label}
                    {rider.dice && <span className="dmg-rider-persistent"> {rider.dice} {rider.type || ''}</span>}
                    {rider.persistent?.dice && (
                      <span className="dmg-rider-persistent">
                        {' '}{rider.persistent.dice} persistent {rider.persistent.type || ''}
                      </span>
                    )}
                  </span>
                  {rider.note && <span className="dmg-rider-note">{rider.note}</span>}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {allCommitted && committed.length > 0 && (
        <div className="sas-notes">
          {committed.flatMap((c) => c.results.map((r) => {
            const note = [
              r.outOfRange ? 'Out of range' : null,
              rangeNoteFor(r.range, r.outOfRange),
              (r.degree && !r.outOfRange) ? (degrees?.[DEGREE_LABELS[r.degree]] || null) : null,
            ].filter(Boolean).join(' · ');
            return note ? <p className="sas-note" key={r.entryId + c.stepIndex}>{note}</p> : null;
          }))}
        </div>
      )}
    </div>
  );
});

SequentialAttackSteps.displayName = 'SequentialAttackSteps';

export default SequentialAttackSteps;
