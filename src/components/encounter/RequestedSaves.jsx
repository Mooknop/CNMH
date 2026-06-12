import React, { useState } from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { computeSaveDegree } from '../../utils/saveDegree';
import { computeSaveDamage, formatDamageBreakdown } from '../../utils/damage';
import { DEFENSE_LABELS } from '../../utils/defense';
import { PERSISTENT_KEY, addPersistent, makeInstances } from '../../utils/persistentDamage';
import { useSessionLog } from '../../hooks/useSessionLog';

const DEGREE_LABELS = {
  criticalSuccess: 'Critical Success',
  success:         'Success',
  failure:         'Failure',
  criticalFailure: 'Critical Failure',
};

const DEGREE_CLASSES = {
  criticalSuccess: 'save-crit-success',
  success:         'save-success',
  failure:         'save-failure',
  criticalFailure: 'save-crit-failure',
};

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
 */
const damageFor = (req, degree, entryId) => {
  if (!req.damage || !degree) return null;
  if (degree === 'criticalSuccess') return { none: true };
  const dmg = computeSaveDamage({
    entered: req.damage.entered,
    degree,
    riders: req.damage.riders,
    entryId,
  });
  return dmg ? { dmg } : null;
};

const RequestedSaves = () => {
  const { encounter, appendLog, removeSaveRequest } = useEncounter();
  const { appendEvent } = useSessionLog();
  const [d20Inputs, setD20Inputs] = useState({});
  // Persistent-damage tracking (#272) — failed saves record their entries here.
  const [, setPersistentMap] = useSyncedState(PERSISTENT_KEY, {});

  const requests = (encounter?.saveRequests || []).filter((r) => r.status === 'pending');

  if (requests.length === 0) return null;

  const setD20 = (reqId, entryId, val) =>
    setD20Inputs((prev) => ({
      ...prev,
      [`${reqId}:${entryId}`]: val,
    }));

  const getD20 = (reqId, entryId) => d20Inputs[`${reqId}:${entryId}`] ?? '';

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

    const saveLabel = DEFENSE_LABELS[req.save] || req.save;
    results.forEach((r) => {
      const degreeLabel = DEGREE_LABELS[r.degree] || r.degree;
      const d = damageFor(req, r.degree, r.entryId);
      const dmgSuffix = d
        ? (d.none ? ' · no damage' : ` · damage ${formatDamageBreakdown(d.dmg)}`)
        : '';
      appendLog({
        type:   'action',
        charId: req.casterId,
        text:   `${r.name} rolls ${saveLabel} vs DC ${req.dc} (${req.abilityName}): ${r.total} → ${degreeLabel}${dmgSuffix}`,
      });
    });

    // Persistent-damage tracking (#272): computeSaveDamage already gated the
    // entries by degree (and doubled/halved their dice) — record what's left.
    const persistentHits = results
      .map((r) => {
        const d = damageFor(req, r.degree, r.entryId);
        return d?.dmg?.persistent?.length
          ? { entryId: r.entryId, persistent: d.dmg.persistent }
          : null;
      })
      .filter(Boolean);
    if (persistentHits.length) {
      setPersistentMap((m) => persistentHits.reduce(
        (acc, h) => addPersistent(acc, h.entryId, makeInstances(h.persistent, req.abilityName)),
        m || {}
      ));
    }

    const names = results.map((r) => r.name).join(', ');
    appendEvent({ type: 'save', text: `${saveLabel} DC ${req.dc} (${req.abilityName}) resolved — ${names}` });
    removeSaveRequest(req.id);
    // Clean up local input state.
    setD20Inputs((prev) => {
      const next = { ...prev };
      req.targets.forEach((t) => { delete next[`${req.id}:${t.entryId}`]; });
      return next;
    });
  };

  return (
    <div className="gm-requested-saves">
      <h3>Requested Saves</h3>
      {requests.map((req) => {
        const saveLabel = DEFENSE_LABELS[req.save] || req.save;
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
                  [req.damage.expression, req.damage.typeLabel].filter(Boolean).join(' '),
                  req.damage.entered != null ? `rolled ${req.damage.entered}` : null,
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
                    <span className={`trr-result-degree ${DEGREE_CLASSES[degree]}`}>
                      {DEGREE_LABELS[degree]}
                    </span>
                  )}
                  {(() => {
                    const d = damageFor(req, degree, t.entryId);
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
              className="btn-primary"
              onClick={() => resolveRequest(req)}
              disabled={!allFilled}
              style={{ marginTop: '0.5rem' }}
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
