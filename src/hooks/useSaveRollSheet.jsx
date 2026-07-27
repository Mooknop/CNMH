import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  SAVE_DAMAGE_DEGREES,
  damageHintParts,
  damageRollFormulas,
  formatDamageBreakdown,
  riderEnabled,
} from '../utils/damage';
import { DEFENSE_LABELS } from '../utils/defense';
import { DEGREE_LABELS } from '../utils/degreeDisplay';
import { saveDamageFor, applySaveDamageOutcome } from '../utils/saveDamage';

// UseAbilityModal's target-save path on RollSheet (#1689, Roll Resolution
// redesign workstream G2) — the caster half of the save round trip:
//
//   commit ──▶ waiting (pulsing GM ring) ──▶ the GM's degrees land on
//   encounter.saveResolutions (#1683) ──▶ result card ──▶ the caster rolls
//   damage ──▶ apply + relay ──▶ settled.
//
// Damage no longer rides the save request: `buildTargetSaveRequest` ships
// `entered: null`, RequestedSaves skips its HP-affecting appliers for such a
// request, and they run HERE instead (utils/saveDamage — one module, so the two
// legs can never disagree or double-apply). Rider CHOICES still ride the
// request, because they are cast-time decisions and the GM's conditions/fx
// resolution reads them.
//
// Like useAttackRollSheet this is called ABOVE UseAbilityModal's
// `if (!ability || !character)` guard, so it takes only what exists that high
// (the encounter and the caster's id) and returns a `derive()` the orchestrator
// calls below the guard with the live roll profile.

// Escape hatches for G1 risks 5 + 6 — a `waiting` sheet that can never be
// answered has to say so rather than pulse forever.
const DISMISSED_NOTICE =
  'No degrees came back — the GM dismissed this save. Nothing was applied on your side.';
const ENDED_NOTICE =
  'The encounter ended before the saves came back. Nothing left to apply.';
const FIZZLED_NOTICE =
  'The spell fizzled before it reached the GM — no saves were requested.';
// What a refused Close says (RollSheet renders it after the first attempt).
const WAITING_GUARD =
  'The GM has not sent the degrees back yet — tap Close again to abandon this cast.';
const AMOUNT_GUARD =
  'Damage has not been applied yet — tap Close again to leave it unapplied.';

const parseTotal = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

/**
 * @param {Object}   ctx
 * @param {Object}   ctx.encounter            - the live encounter (both rails ride it)
 * @param {string}   ctx.casterId
 * @param {Function} [ctx.clearSaveResolution] - useEncounter's consume-and-drop
 * @returns {Function} derive(...) → the RollSheet configuration bag
 */
export function useSaveRollSheet({ encounter, casterId, clearSaveResolution }) {
  // The request we are waiting on. `committedAt` is the separate "we have
  // committed" signal: the id can legitimately be null (a mocked/absent
  // addSaveRequest), and the fallback match below keys off the timestamp.
  const [committedAt, setCommittedAt] = useState(0);
  const [requestId, setRequestId] = useState(null);
  const [record, setRecord] = useState(null);
  const [bail, setBail] = useState(null);
  const [applied, setApplied] = useState(false);
  const abilityNameRef = useRef(null);
  const sawRequestRef = useRef(false);
  const consumedRef = useRef(false);
  const appliedRef = useRef(false);
  // Latest-callback refs (the RequestedSaves idiom): the watcher effect below
  // has to run the appliers for a resolution with NO amount step — a
  // persistent-only profile (Polarize) never reaches RollSheet's amount phase,
  // so `onFinish` would never fire and its bleed would be lost.
  const applyRef = useRef(null);
  const needsAmountRef = useRef(null);

  /** Called from the commit: which request this sheet is now waiting on. */
  const noteRequest = useCallback((id, abilityName) => {
    abilityNameRef.current = abilityName || null;
    setRequestId(id ?? null);
    setCommittedAt(Date.now());
  }, []);

  /** Called from the commit when the sequence never reached a save request. */
  const noteFizzle = useCallback(() => setBail(FIZZLED_NOTICE), []);

  const resolutions = encounter?.saveResolutions;
  const requests = encounter?.saveRequests;
  const encounterActive = encounter?.active;

  useEffect(() => {
    if (!committedAt || consumedRef.current || bail) return;

    // The happy path — join on the request id (G1's stable key); fall back to
    // caster + ability + "after we committed" if the id never made it back to
    // us, so the round trip degrades rather than hanging.
    const rec = (resolutions || []).find((r) => (
      requestId
        ? r.id === requestId
        : (r.casterId === casterId
          && r.abilityName === abilityNameRef.current
          && (r.ts ?? 0) >= committedAt)
    ));
    if (rec) {
      consumedRef.current = true;
      setRecord(rec);
      // Consume and drop (G1 risk 4): the degrees are frozen into local state
      // from here, so leaving the record on the bounded rail only risks
      // evicting somebody else's.
      clearSaveResolution?.(rec.id);
      if (!needsAmountRef.current?.(rec)) applyRef.current?.(rec, {});
      return;
    }

    // (b) The encounter ended under us — saveResolutions died with it (G1 risk 5).
    if (encounterActive === false) {
      setBail(ENDED_NOTICE);
      return;
    }

    // (a) The request vanished with no resolution: the GM dismissed it, or a
    // partial Foundry ack left it abandoned (G1 risk 6). Only trust the absence
    // once we have actually SEEN it pending — right after the commit the write
    // has not necessarily round-tripped yet.
    const stillPending = (requests || []).some((r) => (
      requestId
        ? r.id === requestId
        : (r.casterId === casterId && r.abilityName === abilityNameRef.current)
    ));
    if (stillPending) {
      sawRequestRef.current = true;
      return;
    }
    if (sawRequestRef.current) setBail(DISMISSED_NOTICE);
  }, [committedAt, requestId, resolutions, requests, encounterActive, casterId, bail, clearSaveResolution]);

  /**
   * @param {Object} cfg - { ability, character, order, damageProfile, riderState,
   *   onToggleRider, defense, saveDc, appendLog, sendUpdate, setPersistentMap,
   *   revealFiredIwr }
   */
  return function derive({
    ability,
    character,
    order = [],
    damageProfile = null,
    riderState = {},
    onToggleRider,
    defense,
    saveDc = null,
    appendLog,
    sendUpdate,
    setPersistentMap,
    revealFiredIwr,
  }) {
    const abilityName = record?.abilityName || ability?.name || '';
    // DEFENSE_LABELS already ends in "DC" (#1610 — never write "Reflex DC DC").
    const saveLabel = DEFENSE_LABELS[record?.save || defense] || record?.save || defense || '';
    const dcShown = record?.dc ?? saveDc;

    // The dice the caster physically rolls — damageHintParts, exactly what
    // DamagePanel's save mode showed before the commit. The save ladder takes
    // ONE total (computeSaveDamage has no `instances` model), so this is one
    // DamageEntry row no matter how many typed parts the profile carries.
    const hintParts = damageProfile ? damageHintParts(damageProfile, riderState) : [];
    const hintText = hintParts
      .map((p) => `${p.dice}${p.typeLabel ? ` ${p.typeLabel}` : ''}`)
      .join(' + ');
    const damageParts = damageProfile?.expression
      ? [{
        key: 'base',
        dice: hintText,
        type: '',
        formula: damageRollFormulas(damageProfile, riderState).base ?? damageProfile.expression,
      }]
      : null;

    const affected = (rec) =>
      (rec?.results || []).filter((r) => SAVE_DAMAGE_DEGREES.includes(r.degree));
    const needsAmount = (rec) => !!damageParts && !!rec?.damage && affected(rec).length > 0;
    needsAmountRef.current = needsAmount;

    const defensesFor = (entryId) =>
      (order || []).find((e) => e.entryId === entryId)?.defenses ?? null;

    /**
     * Per-target damage for a candidate total. The record's own `damage.entered`
     * is stale GM-time data and is ALWAYS overwritten (G1 risk 2); the riders,
     * typeLabel and per-degree overrides are the cast-time snapshot and are
     * exactly what we want. Defenses come from the LIVE order (G1 risk 3): a
     * target that left degrades to raw damage rather than a stale netting.
     */
    const damageAt = (rec, entered) => affected(rec).map((r) => ({
      result: r,
      damage: saveDamageFor(
        { ...(rec.damage || {}), entered },
        r.degree,
        r.entryId,
        defensesFor(r.entryId),
      ),
    }));

    /** The finish: apply + relay + log. Exactly-once, from either call site. */
    const apply = (rec, amounts) => {
      if (appliedRef.current) return;
      appliedRef.current = true;
      setApplied(true);
      if (!rec?.damage) return;
      const damage = { ...rec.damage, entered: parseTotal(amounts?.base) };
      const perTarget = applySaveDamageOutcome({
        damage,
        results: rec.results || [],
        order,
        abilityName,
        setPersistentMap,
        sendUpdate,
        revealFiredIwr,
      });
      // The GM's degree lines carry no damage suffix any more, so the totals
      // get their own lines here — one per target that took something.
      perTarget.forEach((p) => {
        if (!p.damage?.dmg) return;
        appendLog?.({
          type: 'action',
          charId: character?.id,
          text: `${p.result.name} takes ${formatDamageBreakdown(p.damage.dmg)} from ${abilityName}`,
        });
      });
    };
    applyRef.current = apply;

    // Which obligation, if any, is outstanding right now. A damage-free save
    // spell has none — closing mid-wait costs nothing but the result card.
    const hasDamageObligation = !!damageProfile;
    const waitingOnGm = committedAt > 0 && !record && !bail;
    const owesDamage = !!record && needsAmount(record) && !applied;

    /**
     * Leaving with an obligation outstanding. RollSheet already made the player
     * confirm it (closeGuard), so this only records what the table lost —
     * abandoning must never strand the targets silently.
     */
    const abandon = () => {
      if (appliedRef.current || !hasDamageObligation) return;
      if (!waitingOnGm && !owesDamage) return;
      appliedRef.current = true;
      appendLog?.({
        type: 'system',
        text: waitingOnGm
          ? `${abilityName}: ${character?.name} left before the saves came back — apply the damage by hand.`
          : `${abilityName}: ${character?.name} closed without applying damage — apply it by hand.`,
      });
    };

    return {
      /** The commit hands us the request id it just pushed. */
      noteRequest,
      noteFizzle,
      record,
      applied,

      /** RollSheet rows — the FIRST non-null value freezes the result card. */
      resolvedResults: record
        ? (record.results || []).map((r) => {
          const note = [
            r.total != null ? `rolled ${r.total}` : null,
            ability?.degrees?.[DEGREE_LABELS[r.degree]] || null,
          ].filter(Boolean).join(' · ');
          return {
            entryId: r.entryId,
            name: r.name,
            dcLabel: `${saveLabel} ${record.dc ?? ''}`.trim(),
            degree: r.degree,
            ...(note ? { note } : {}),
          };
        })
        : null,

      headlineMath: dcShown != null ? `${saveLabel} ${dcShown}` : saveLabel,
      damageParts,
      // A critical success takes nothing, so it never asks for an amount.
      amountDegrees: SAVE_DAMAGE_DEGREES,
      amountHeading: `Damage${hintText ? ` · ${hintText}` : ''} — each target halves or doubles by its save`,

      breakdownFor: (amounts) => {
        if (!record?.damage) return null;
        const lines = damageAt(record, parseTotal(amounts?.base))
          .filter((p) => p.damage?.dmg)
          .map((p) => `${p.result.name} ${formatDamageBreakdown(p.damage.dmg)}`);
        return lines.length ? lines.join(' · ') : null;
      },

      onFinish: (amounts) => apply(record, amounts),
      abandon,

      receiptFor: ({ amounts }) => {
        const head = dcShown != null ? `${saveLabel} ${dcShown}` : saveLabel;
        const byEntry = new Map(
          damageAt(record, parseTotal(amounts?.base)).map((p) => [p.result.entryId, p.damage]),
        );
        return [
          head,
          ...(record?.results || []).map((r) => {
            const d = byEntry.get(r.entryId);
            const tail = d?.dmg ? ` · ${formatDamageBreakdown(d.dmg)}` : ' · no damage';
            return `${r.name} — ${DEGREE_LABELS[r.degree] || r.degree}${tail}`;
          }),
        ];
      },

      closeGuard: {
        blocked: hasDamageObligation && (waitingOnGm || owesDamage),
        notice: bail,
        blockedNotice: owesDamage ? AMOUNT_GUARD : WAITING_GUARD,
      },

      /**
       * The rider checkboxes, kept PRE-commit: which riders are on is a
       * cast-time decision that rides the save request and that the GM's
       * condition ladder reads, so it cannot move to the amount step. Only the
       * total input left — DamagePanel's markup verbatim, minus the entry row.
       */
      ridersRow: damageProfile ? (
        <div className="dmg-panel">
          <div className="dmg-hint-row">
            <span className="dmg-hint-label">Damage</span>
            {hintText && <span className="dmg-expression">{hintText}</span>}
            <span className="dmg-hint-note">
              you roll this after the GM sends the degrees back
            </span>
          </div>
          {(damageProfile.riders || []).length > 0 && (
            <div className="dmg-riders" role="group" aria-label="damage riders">
              {damageProfile.riders.map((rider) => (
                <label key={rider.id} className="dmg-rider-toggle">
                  <input
                    type="checkbox"
                    checked={riderEnabled(rider, riderState)}
                    onChange={(e) => onToggleRider?.(rider.id, e.target.checked)}
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
        </div>
      ) : null,
    };
  };
}

export default useSaveRollSheet;
