import { useRef, useState } from 'react';
import {
  damageEntryParts,
  damageRollFormulas,
  formatDamageBreakdown,
  riderEnabled,
} from '../utils/damage';
import { DEFENSE_LABELS } from '../utils/defense';
import { DEGREE_LABELS } from '../utils/degreeDisplay';
import { buildAttackResults, rangeNoteFor } from '../utils/attackResults';

// UseAbilityModal's attack path on RollSheet (#1687, Roll Resolution redesign
// workstream E). RollSheet owns `phase` / `face` / `amounts`; everything the
// old `TargetRollResolver` + `DamagePanel` pair owned LOCALLY moves here, per
// the handoff's State Management table ("damage riders and crit-double,
// currently in TargetRollResolver, move alongside `amounts`"):
//
//   - the situational toggles (#274) and the free-form circumstance entry
//   - the damage rider toggles and the built-in Crit ×2
//   - the one frozen commit ({ face, results }) the finish step re-resolves from
//
// The hook is called ABOVE UseAbilityModal's `if (!ability || !character)`
// guard, so it takes no derived inputs at all: it returns a `derive()` function
// the orchestrator calls below the guard with the live roll profile. Everything
// `derive` returns is either a plain value or a render slot, mirroring the
// `use*Gate` / `use*Section` shape from #1317.

const parseTotal = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

/**
 * @returns {Function} derive({ rollBonus, toggles, enemyTargets, defense,
 *   rangeByEntry, damageProfile, degrees }) → the RollSheet configuration bag
 */
export function useAttackRollSheet() {
  // Situational bonus toggles (#274) — declared conditional-effect toggles the
  // player flips on, plus a free-form "+N (reason)" for ad-hoc rulings (Aid).
  const [toggledIds, setToggledIds] = useState([]);
  const [circumstance, setCircumstance] = useState('');
  // Damage step state (#222 / #1019): rider overrides and the crit doubling.
  const [riderState, setRiderState] = useState({});
  const [critDouble, setCritDouble] = useState(true);
  // The one frozen commit. The ref is what the same-tick finish reads; the
  // state copy only exists so the amount screen can show `Crit ×2` when a
  // critical hit actually landed.
  const committedRef = useRef(null);
  const [committed, setCommitted] = useState(null);

  return function derive({
    rollBonus = null,
    toggles = [],
    enemyTargets = [],
    defense,
    rangeByEntry = null,
    damageProfile = null,
    degrees = null,
  }) {
    const activeToggles = toggles.filter((t) => toggledIds.includes(t.id));
    const freeform = parseInt(circumstance, 10);
    const adjust = activeToggles.reduce((s, t) => s + (t.bonus || 0), 0)
      + (Number.isNaN(freeform) ? 0 : freeform);
    const adjustSources = [
      ...activeToggles.map((t) => t.label),
      ...(Number.isNaN(freeform) || freeform === 0
        ? []
        : [`${freeform > 0 ? '+' : ''}${freeform} circumstance`]),
    ];

    // PR #1697 leftover 3: RollSheet's `bonus` is ONE number, so the active
    // toggles fold in before it goes down — otherwise the frozen headline and
    // the committed degrees would disagree.
    const bonus = rollBonus == null ? null : rollBonus + adjust;

    // Damage entry parts (#1019) — one row per typed part; a single part keeps
    // the one-total entry. An empty list means there is nothing to roll, and
    // RollSheet skips the amount phase entirely.
    const entryParts = damageProfile ? damageEntryParts(damageProfile, riderState) : [];
    const formulas = damageProfile ? damageRollFormulas(damageProfile, riderState) : {};
    const multiPart = entryParts.length > 1;
    const damageParts = entryParts.length
      ? entryParts.map((p) => ({ ...p, formula: formulas[p.key] ?? p.dice }))
      : null;

    const resolve = (face, amounts) => {
      const entered = multiPart ? null : parseTotal(amounts?.[entryParts[0]?.key]);
      const instances = multiPart
        ? entryParts.map((p) => ({ amount: parseInt(amounts?.[p.key], 10), type: p.type || '' }))
        : null;
      return buildAttackResults({
        enemyTargets,
        defense,
        face,
        rollBonus,
        adjust,
        adjustSources,
        rangeByEntry,
        damage: damageProfile,
        riderState,
        critDouble,
        entered,
        instances,
      });
    };

    // RollSheet row shape: the resolver row plus a rendered DC label and the
    // out-of-range / range-increment / authored-degree notes on their own line.
    const toRows = (results) => results.map((r) => {
      const note = [
        r.outOfRange ? 'Out of range' : null,
        r.dc == null ? 'no DC available' : null,
        rangeNoteFor(r.range, r.outOfRange),
        (r.degree && !r.outOfRange) ? (degrees?.[DEGREE_LABELS[r.degree]] || null) : null,
      ].filter(Boolean).join(' · ');
      return {
        entryId: r.entryId,
        name: r.name,
        dcLabel: r.dc != null ? `${DEFENSE_LABELS[defense] || defense} ${r.dc}` : '',
        degree: r.degree,
        ...(note ? { note } : {}),
      };
    });

    return {
      bonus,
      adjust,
      adjustSources,
      damageParts,

      /** Freeze the face + degrees. Returns the RESOLVER-shaped rows so the
       *  orchestrator's existing appliers can consume them unchanged. */
      commit: (face) => {
        const results = resolve(face, {});
        committedRef.current = { face, results };
        setCommitted({ face, results });
        return results;
      },

      /** Re-resolve the SAME frozen face with the entered totals (the finish
       *  transition). Degrees cannot move — only `damage` is filled in. */
      resolveWithAmounts: (amounts) => {
        const face = committedRef.current?.face ?? null;
        return face == null ? [] : resolve(face, amounts);
      },

      /** RollSheet result rows for the frozen commit. */
      rowsFor: toRows,

      /** The `.dmg-result-line` breakdowns, one string for the amount screen. */
      breakdownFor: (amounts) => {
        const lines = resolve(committedRef.current?.face ?? null, amounts)
          .filter((r) => r.damage)
          .map((r) => `${r.name} ${formatDamageBreakdown(r.damage)}`);
        return lines.length ? lines.join(' · ') : null;
      },

      /** Situational toggles + the free-form circumstance — the `trr-toggle`
       *  row, rendered in RollSheet's edit panel exactly where it sat before. */
      togglesRow: (
        <div className="trr-section">
          {toggles.length > 0 && (
            <div className="trr-toggle-row" role="group" aria-label="situational bonuses">
              {toggles.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`trr-toggle${toggledIds.includes(t.id) ? ' trr-toggle--active' : ''}`}
                  aria-pressed={toggledIds.includes(t.id)}
                  onClick={() => setToggledIds((cur) => (
                    cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]
                  ))}
                >
                  {t.label} {t.bonus >= 0 ? `+${t.bonus}` : t.bonus}
                </button>
              ))}
            </div>
          )}
          <div className="trr-entry-row">
            <input
              type="number"
              className="trr-circ-input"
              placeholder="± circ"
              aria-label="other circumstance"
              value={circumstance}
              onChange={(e) => setCircumstance(e.target.value)}
            />
            {adjust !== 0 && (
              <span className="trr-adjust-note" aria-label="applied circumstance">
                incl. {adjust > 0 ? '+' : ''}{adjust} ({adjustSources.join(', ')})
              </span>
            )}
          </div>
        </div>
      ),

      /** The rider checkboxes + `Crit ×2` — DamagePanel's markup verbatim,
       *  mounted through RollSheet's `amountExtras` slot. */
      amountExtras: damageProfile ? (
        <>
          {(committed?.results || []).some((r) => r.degree === 'criticalSuccess') && (
            <label className="dmg-rider-toggle">
              <input
                type="checkbox"
                checked={critDouble}
                onChange={(e) => setCritDouble(e.target.checked)}
              />
              <span>Crit ×2</span>
            </label>
          )}
          {(damageProfile.riders || []).length > 0 && (
            <div className="dmg-riders" role="group" aria-label="damage riders">
              {damageProfile.riders.map((rider) => (
                <label key={rider.id} className="dmg-rider-toggle">
                  <input
                    type="checkbox"
                    checked={riderEnabled(rider, riderState)}
                    onChange={(e) => setRiderState(
                      (cur) => ({ ...cur, [rider.id]: e.target.checked }),
                    )}
                  />
                  <span>
                    {rider.label}
                    {rider.dice && (
                      <span className="dmg-rider-persistent">
                        {' '}{rider.dice} {rider.type || ''}
                      </span>
                    )}
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
        </>
      ) : null,
    };
  };
}
