import React, { useState, useEffect, useRef } from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useSession } from '../../contexts/SessionContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { computeSaveDegree } from '../../utils/saveDegree';
import { DEGREE_LABELS, DEGREE_CLASS } from '../../utils/degreeDisplay';
import { formatDamageBreakdown, hintTypeLabel } from '../../utils/damage';
import { DEFENSE_NAMES } from '../../utils/defense';
import { PERSISTENT_KEY } from '../../utils/persistentDamage';
import { saveDamageFor, applySaveDamageOutcome } from '../../utils/saveDamage';
import { emitSaveFxPlay } from '../../utils/fxPlay';
import { SAVEDONE_KEY, SAVEDONE_FRESH_MS, buildSaveRoll } from '../../utils/saveRelay';
import { buildEffectEntry } from '../../utils/applyAbility';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useIwrReveal } from '../../hooks/useIwrReveal';
import { useEnemyEffects } from '../../hooks/useEnemyEffects';
import { RELAY, APP } from '../../sync/keys';
// The GM save cards' roll input + degree label speak the shared trr-* vocabulary.
import './rollResolution.css';

/**
 * GM panel that lists pending save requests from players.
 *
 * For each request the GM enters a raw d20 per enemy target; the component
 * adds each enemy's save modifier, compares to the caster's DC, resolves the
 * degree of success with the PF2e nat-20/nat-1 rules, and logs the result.
 * The request is removed once every target has been resolved.
 *
 * Requests carrying a `damage` payload (#270 — the caster's entered total and
 * rider snapshot) derive per-target damage from each degree as the d20s are
 * typed (none/half/full/double) and append it to the log lines.
 *
 * Degrees write-back (#1683): both resolution paths finish through
 * `resolveSaveRequest`, which records the resolved degrees on
 * `encounter.saveResolutions` and removes the request in one write, so the
 * caster's client can read its own outcome.
 *
 * Damage inversion (#1689 — G2). The caster now rolls damage AFTER seeing the
 * degrees, so a NEW-style request arrives with no entered total and this panel
 * must NOT apply damage for it: the caster's own sheet runs the persistent
 * rail (#272), the typed relay (#1016) and the IWR reveal (#1014) once the
 * total exists. Applying in both places would double-apply (G1 risk 1).
 *
 * The split is deliberately backward compatible and reads off the payload
 * itself — `req.damage?.entered == null` means "the caster owns this":
 *
 *   entered is a number → OLD-style (a client still on the pre-#1689 build, or
 *                         an ArmedPayloads / secondaryProfiles request, which
 *                         both still enter their total up front) → unchanged.
 *   entered is null     → NEW-style → conditions, fx, the caster effect and
 *                         every log line still resolve here; only the
 *                         HP-affecting appliers move to the caster.
 */
const casterRollsDamage = (req) => req?.damage?.entered == null;

const RequestedSaves = () => {
  const { encounter, appendLog, resolveSaveRequest } = useEncounter();
  const { getState, sendUpdate } = useSession();
  const { appendEvent } = useSessionLog();
  const { revealFiredIwr } = useIwrReveal();
  // Per-degree target conditions (#1216 — whetstone save riders) land on the
  // app-tracked enemy-conditions rail.
  const { applyCondition } = useEnemyEffects();
  const [d20Inputs, setD20Inputs] = useState({});
  // Persistent-damage tracking (#272) — failed saves record their entries here.
  const [, setPersistentMap] = useSyncedState(PERSISTENT_KEY, {});
  // Foundry-rolled saves (#1275): the bridge's ack for a "Roll in Foundry" push.
  const [saveDone] = useSyncedState(SAVEDONE_KEY, null);
  const processedAckRef = useRef(null);

  const requests = (encounter?.saveRequests || []).filter((r) => r.status === 'pending');

  // Monster IWR (#1014): save-request targets carry only {entryId,name,saveMod};
  // the defenses live on the encounter order entries.
  const defensesFor = (entryId) =>
    (encounter?.order || []).find((e) => e.entryId === entryId)?.defenses ?? null;

  // Degrees write-back (#1683): the request itself carries no top-level
  // casterEntryId (only the #274 casterEffect rider and the #1414 fx recipe's
  // `source` do). Prefer the live order entry — it's the authority and survives
  // requests built without either rider — then fall back to the riders, then
  // null (a manual/off-order caster; G2 keys off casterId, entryId is only for
  // token-level rendering).
  const casterEntryIdFor = (req) =>
    (encounter?.order || []).find((e) => e.kind === 'pc' && e.charId === req.casterId)?.entryId
      ?? req.casterEffect?.casterEntryId
      ?? req.fx?.source
      ?? null;

  const setD20 = (reqId, entryId, val) =>
    setD20Inputs((prev) => ({
      ...prev,
      [`${reqId}:${entryId}`]: val,
    }));

  const getD20 = (reqId, entryId) => d20Inputs[`${reqId}:${entryId}`] ?? '';

  // Shared resolution tail — everything downstream of a full result set (log
  // lines, persistent tracking, dmgapply relay, IWR reveal, condition ladders,
  // caster effects, request removal). Results come from GM-typed d20s
  // (resolveRequest) or Foundry-rolled saves (#1275 — the savedone effect).
  const finishResolve = (req, results) => {
    // Bare name (#1610): every line below writes its own "DC ${req.dc}".
    const saveLabel = DEFENSE_NAMES[req.save] || req.save;
    // #1689: a request with no entered total is one the CASTER will roll for.
    const casterOwnsDamage = casterRollsDamage(req);
    results.forEach((r) => {
      const degreeLabel = DEGREE_LABELS[r.degree] || r.degree;
      const d = casterOwnsDamage
        ? null
        : saveDamageFor(req.damage, r.degree, r.entryId, defensesFor(r.entryId));
      const dmgSuffix = d
        ? (d.none ? ' · no damage' : ` · damage ${formatDamageBreakdown(d.dmg)}`)
        : '';
      appendLog({
        type:   'action',
        charId: req.casterId,
        text:   `${r.name} rolls ${saveLabel} vs DC ${req.dc} (${req.abilityName}): ${r.total} → ${degreeLabel}${dmgSuffix}`,
      });
    });

    // Persistent tracking (#272) + the typed relay (#1016) + reveal-on-trigger
    // (#1014) — the three HP-affecting appliers, now shared with the caster's
    // sheet (utils/saveDamage). Skipped wholesale for a new-style request:
    // the caster runs this exact function once the total is rolled (#1689).
    if (!casterOwnsDamage) {
      applySaveDamageOutcome({
        damage:      req.damage,
        results,
        order:       encounter?.order || [],
        abilityName: req.abilityName,
        setPersistentMap,
        sendUpdate,
        revealFiredIwr,
        appendLog,
      });
    }

    // Canvas animation (#1414 A4): the recipe resolved on the caster's client
    // rode the request — fire it now that the saves are in. Every resolved
    // target animates (the fireball engulfs the square either way).
    if (req.fx) emitSaveFxPlay({ sendUpdate, fx: req.fx, results });

    // Per-degree target conditions (#1216 — Chroma Kaleidoscope's dazzle/blind
    // ladder, Reactive Flash's off-guard). Applied to the enemy-conditions rail;
    // durations ride as log notes (round-timed enemy-condition expiry is GM
    // bookkeeping — the #1246 enemy-automation bucket). A `scopedToCaster`
    // condition (off-guard vs this attack) scopes to the requesting attacker.
    if (req.conditions) {
      results.forEach((r) => {
        const list = req.conditions[r.degree];
        if (!Array.isArray(list) || !list.length) return;
        list.forEach((c) => {
          if (!c?.id) return;
          applyCondition(r.entryId, {
            id: c.id,
            ...(c.value != null ? { value: c.value } : {}),
            source: req.abilityName,
            ...(c.scopedToCaster
              ? { scopedTo: req.casterId, scopedToName: req.casterName }
              : {}),
          });
          appendLog({
            type: 'system',
            text: `${r.name} is ${c.id}${c.value != null ? ` ${c.value}` : ''}${c.note ? ` (${c.note})` : ''} — ${req.abilityName}`,
          });
        });
      });
    }

    // Save-outcome-gated caster-side buff (#274 — Shining Guidance's Limned bonus):
    // when the resolved degree is one this effect triggers on, write it to the
    // pre-resolved ally targets. Single-target ability → keyed off the worst
    // (most-affected) degree among the targets.
    const ce = req.casterEffect;
    if (ce && ce.def?.onDegrees?.length) {
      const triggered = results.some((r) => ce.def.onDegrees.includes(r.degree));
      if (triggered) {
        const caster = { id: ce.casterId, name: ce.casterName };
        (ce.targets || []).forEach(({ charId, entryId }) => {
          const current  = getState(charId, APP.EFFECTS) || [];
          const newEntry = buildEffectEntry({
            eff: { effectId: ce.def.effectId, duration: ce.def.duration || null },
            caster,
            abilityName: req.abilityName,
            encounter,
            casterEntryId: ce.casterEntryId || null,
            targetEntryId: entryId,
          });
          sendUpdate(charId, APP.EFFECTS, [...current, newEntry]);
        });
        appendLog({
          type:   'action',
          charId: ce.casterId,
          text:   `${ce.casterName}'s ${req.abilityName} buffs the party vs ${req.targets.map((t) => t.name).join(', ')}`,
        });
      }
    }

    const names = results.map((r) => r.name).join(', ');
    appendEvent({ type: 'save', text: `${saveLabel} DC ${req.dc} (${req.abilityName}) resolved — ${names}` });
    // Degrees write-back (#1683): record the outcome on the encounter so the
    // CASTER's client can read it, and drop the request — one atomic write.
    // Nothing consumes it yet; G2 (#1689) builds the caster-side result card.
    resolveSaveRequest(req.id, {
      casterId:      req.casterId ?? null,
      casterEntryId: casterEntryIdFor(req),
      casterName:    req.casterName ?? null,
      abilityName:   req.abilityName ?? null,
      rank:          req.rank ?? null,
      save:          req.save ?? null,
      dc:            req.dc ?? null,
      basic:         !!req.basic,
      results:       results.map(({ entryId, name, d20, total, degree }) => ({
        entryId, name, d20, total, degree,
      })),
      damage:        req.damage ?? null,
    });
    // Clean up local input state.
    setD20Inputs((prev) => {
      const next = { ...prev };
      req.targets.forEach((t) => { delete next[`${req.id}:${t.entryId}`]; });
      return next;
    });
  };

  const resolveRequest = (req) => {
    const results = req.targets.map((t) => {
      const raw = getD20(req.id, t.entryId);
      const d20 = parseInt(raw, 10);
      if (isNaN(d20)) return null;
      const saveMod = t.saveMod ?? 0;
      const total = d20 + saveMod;
      const degree = computeSaveDegree({ d20, total, dc: req.dc });
      return { entryId: t.entryId, name: t.name, d20, total, degree };
    });

    if (results.some((r) => r === null)) return; // not all filled
    finishResolve(req, results);
  };

  // Latest-callback ref (#1275): the savedone effect calls the current
  // finishResolve without making its per-render identity an effect dependency
  // (wrapping it in useCallback would cascade through every hook it closes over).
  const finishResolveRef = useRef(null);
  finishResolveRef.current = finishResolve;

  // Foundry-rolled saves (#1275): a fresh savedone ack matching a pending
  // request resolves it through the same tail as typed d20s. The bridge's
  // `total` is authoritative (live modifiers); degrees are recomputed here so
  // computeSaveDegree stays the one source of truth for nat-20/nat-1. Targets
  // the bridge could not roll keep their manual inputs (their d20s stay empty);
  // a stale ack (persisted-key hydration on mount) is ignored.
  useEffect(() => {
    if (!saveDone?.id) return;
    const ackKey = `${saveDone.id}:${saveDone.ts}`;
    if (processedAckRef.current === ackKey) return;
    const req = requests.find((r) => r.id === saveDone.id);
    if (!req) return;
    processedAckRef.current = ackKey;
    if (typeof saveDone.ts !== 'number' || Date.now() - saveDone.ts > SAVEDONE_FRESH_MS) return;

    const byEntry = new Map((saveDone.results || []).map((r) => [r.entryId, r]));
    const results = req.targets.map((t) => {
      const r = byEntry.get(t.entryId);
      if (!r || typeof r.d20 !== 'number' || typeof r.total !== 'number') return null;
      return {
        entryId: t.entryId,
        name: t.name || r.name,
        d20: r.d20,
        total: r.total,
        degree: computeSaveDegree({ d20: r.d20, total: r.total, dc: req.dc }),
      };
    });

    if (results.every(Boolean)) {
      appendLog({ type: 'system', text: `Foundry rolled the ${DEFENSE_NAMES[req.save] || req.save} saves for ${req.abilityName}` });
      finishResolveRef.current(req, results);
      return;
    }
    // Partial: surface what did roll for GM review; the rest stays manual.
    setD20Inputs((prev) => {
      const next = { ...prev };
      results.forEach((r) => { if (r) next[`${req.id}:${r.entryId}`] = String(r.d20); });
      return next;
    });
    const failedNames = (saveDone.failed || []).map((f) => f.name || f.entryId).join(', ');
    if (failedNames) {
      appendLog({
        type: 'system',
        text: `Foundry: could not roll for ${failedNames} — enter those d20s by hand (${req.abilityName})`,
      });
    }
  }, [saveDone, requests, appendLog]);

  if (requests.length === 0) return null;

  return (
    <div className="gm-requested-saves">
      <h3>Requested Saves</h3>
      {requests.map((req) => {
        // Bare name (#1610): the header appends its own "DC {req.dc}".
        const saveLabel = DEFENSE_NAMES[req.save] || req.save;
        const allFilled = req.targets.every((t) => {
          const raw = getD20(req.id, t.entryId);
          return raw !== '' && !isNaN(parseInt(raw, 10));
        });
        return (
          <div key={req.id} className="gm-save-req-card">
            <div className="gm-save-req-header">
              <strong>{req.casterName}</strong>
              {' — '}
              {req.abilityName}
              {req.rank ? ` (rank ${req.rank})` : ''}
              {': '}
              {saveLabel} DC {req.dc}
              {req.basic && <span className="gm-save-req-basic"> (basic)</span>}
            </div>
            {req.damage && (
              <div className="gm-save-req-dmg-hint">
                {[
                  [req.damage.expression, hintTypeLabel(req.damage.expression, req.damage.typeLabel)]
                    .filter(Boolean).join(' '),
                  req.damage.entered != null ? `rolled ${req.damage.entered}` : null,
                  // #1689: say WHY there is no total to preview against — the
                  // caster rolls it once these degrees reach their sheet.
                  casterRollsDamage(req) ? 'the caster rolls damage after these degrees' : null,
                ].filter(Boolean).join(' — ')}
              </div>
            )}
            {req.targets.map((t) => {
              const raw   = getD20(req.id, t.entryId);
              const d20   = parseInt(raw, 10);
              const valid = !isNaN(d20);
              const saveMod = t.saveMod ?? 0;
              const total   = valid ? d20 + saveMod : null;
              const degree  = valid ? computeSaveDegree({ d20, total, dc: req.dc }) : null;
              return (
                <div key={t.entryId} className="gm-save-req-row">
                  <span className="gm-save-req-name">{t.name}</span>
                  {t.saveMod != null && (
                    <span className="gm-save-req-mod">
                      mod {t.saveMod >= 0 ? `+${t.saveMod}` : t.saveMod}
                    </span>
                  )}
                  <input
                    type="number"
                    className="trr-roll-input"
                    placeholder="d20"
                    aria-label={`${t.name} d20`}
                    value={raw}
                    onChange={(e) => setD20(req.id, t.entryId, e.target.value)}
                  />
                  {total !== null && (
                    <span className="gm-save-req-total">= {total}</span>
                  )}
                  {degree && (
                    <span className={`trr-result-degree ${DEGREE_CLASS[degree]}`}>
                      {DEGREE_LABELS[degree]}
                    </span>
                  )}
                  {(() => {
                    // No preview for a caster-rolled payload (#1689): there is
                    // no total yet, and the persistent riders it WOULD show are
                    // not this panel's to apply any more.
                    if (casterRollsDamage(req)) return null;
                    const d = saveDamageFor(req.damage, degree, t.entryId, defensesFor(t.entryId));
                    if (!d) return null;
                    return (
                      <span className="gm-save-req-dmg">
                        {d.none ? 'no damage' : formatDamageBreakdown(d.dmg)}
                      </span>
                    );
                  })()}
                </div>
              );
            })}
            <button
              className="btn-secondary gm-save-req-btn gm-save-req-btn--roll"
              onClick={() => sendUpdate('global', RELAY.SAVEROLL, buildSaveRoll(req))}
            >
              Roll in Foundry
            </button>
            <button
              className="btn-primary gm-save-req-btn"
              onClick={() => resolveRequest(req)}
              disabled={!allFilled}
            >
              Log Results
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default RequestedSaves;
