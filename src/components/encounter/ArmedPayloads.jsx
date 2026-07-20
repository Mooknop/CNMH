import React, { useState } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { buildDamageProfile, doubleDice } from '../../utils/damage';
import { buildTargetSaveRequest } from '../../utils/saveRequest';
import { mapSpellDefense } from '../../utils/rollResolution';
import { DEFENSE_LABELS } from '../../utils/defense';
import { PERSISTENT_KEY, addPersistent, makeInstances } from '../../utils/persistentDamage';

/**
 * Armed payloads (#987) — GM panel for damage/saves a cast STORED for a later
 * trigger, rather than resolving at cast.
 *
 * Some spells deal their damage only when something else happens afterwards:
 * Targeting Beacon explodes on the next attack that HITS the beaconed creature;
 * Gruesome Marionettist's bleed fires only if the target takes the prohibited
 * action on a later turn. Authoring those as cast-time `damageData` would
 * resolve them at the wrong moment — the spell would detonate the instant it
 * was cast. So the cast parks them here with their trigger text, and the GM
 * fires one when the trigger actually happens.
 *
 * Firing builds a normal save request (same builders as every other save), so
 * the resolution, per-degree damage, riders and IWR all behave identically —
 * this panel only controls WHEN and against WHOM.
 *
 * `repeatable` payloads stay armed after firing (an area that damages everyone
 * ending a turn inside it); one-shot ones are consumed.
 */
const ArmedPayloads = () => {
  const { encounter, appendLog, addSaveRequest, removeArmedPayload } = useEncounter();
  const payloads = encounter?.armedPayloads || [];
  const order = encounter?.order || [];
  const enemies = order.filter((e) => e.kind === 'enemy');

  const [, setPersistentMap] = useSyncedState(PERSISTENT_KEY, {});

  const [picked, setPicked] = useState({});     // { [payloadId]: entryId[] }
  const [entered, setEntered] = useState({});   // { [payloadId]: string }
  const [severity, setSeverity] = useState({}); // { [payloadId]: 'half'|'full'|'double' }

  // A payload with NO defense applies its damage directly rather than calling
  // for a save — the bleed simply lands when the trigger happens (Gruesome
  // Marionettist). Its severity was fixed by the CAST-time save, so the GM picks
  // that here rather than rolling anything new. Such a payload authors its dice
  // as persistent riders on damageData, so buildDamageProfile heightens them.
  const isPersistent = (p) => !p.defense;

  const persistentRidersFor = (p) =>
    (profileFor(p)?.riders || [])
      .filter((r) => r.persistent?.dice)
      .map((r) => ({ dice: r.persistent.dice, type: r.persistent.type || '' }));

  const toggle = (pid, entryId) =>
    setPicked((cur) => {
      const list = cur[pid] || [];
      return {
        ...cur,
        [pid]: list.includes(entryId) ? list.filter((id) => id !== entryId) : [...list, entryId],
      };
    });

  // Synthetic single-save ability, exactly as the secondary-zone rail does, so
  // the payload resolves through the same builders as any other save.
  const syntheticFor = (p) => ({
    name: `${p.abilityName} — ${p.label}`,
    // `level` drives heightenedEntriesFor's baseline: the payload heightens from
    // the spell's native rank up to the rank it was ARMED at, so a beacon cast
    // at rank 6 explodes for 10d6 rather than its base 6d6.
    level: p.spellLevel ?? undefined,
    defense: p.defense,
    damageData: p.damageData,
  });

  const profileFor = (p, targets = []) =>
    buildDamageProfile(syntheticFor(p), { id: p.casterId }, {
      castRank: p.rank ?? undefined,
      order,
      enemyEntries: targets,
    });

  // Persistent payload: scale the authored dice by the severity the cast-time
  // save already established, then record the instances on each target.
  const firePersistent = (p, targets) => {
    const sev = severity[p.id] || 'full';
    const scaled = persistentRidersFor(p).map((inst) => ({
      ...inst,
      ...(sev === 'double' ? { dice: doubleDice(inst.dice) } : {}),
      ...(sev === 'half' ? { half: true } : {}),
    }));
    if (!scaled.length) return;
    setPersistentMap((m) => targets.reduce(
      (acc, t) => addPersistent(acc, t.entryId, makeInstances(scaled, p.abilityName)),
      m || {}
    ));
    appendLog({
      type: 'system',
      text: `${p.abilityName}: ${p.label} (${sev}) applied to ${targets.map((t) => t.name).join(', ')}`,
    });
  };

  const fire = (p) => {
    const targets = enemies.filter((e) => (picked[p.id] || []).includes(e.entryId));
    if (!targets.length) return;

    if (isPersistent(p)) {
      firePersistent(p, targets);
      setPicked((cur) => ({ ...cur, [p.id]: [] }));
      if (!p.repeatable) removeArmedPayload(p.id);
      return;
    }

    const defense = mapSpellDefense(p.defense);
    if (!defense) return;

    const synthetic = syntheticFor(p);
    const req = buildTargetSaveRequest({
      rollProfile: { mode: 'target-save', defense, dc: p.dc },
      saveTargets: targets,
      damageProfile: profileFor(p, targets),
      saveDmgInput: entered[p.id] ?? '',
      saveRiderState: {},
      ability: synthetic,
      character: { id: p.casterId, name: p.casterName },
      casterEntryId: null,
      order,
      saveDc: p.dc,
      directCastRank: p.rank ?? undefined,
    });
    if (!req) return;

    addSaveRequest(req);
    appendLog({
      type: 'system',
      text: `${p.abilityName}: ${p.label} fired at ${targets.map((t) => t.name).join(', ')}`,
    });
    setPicked((cur) => ({ ...cur, [p.id]: [] }));
    setEntered((cur) => ({ ...cur, [p.id]: '' }));
    // One-shot payloads are spent; repeatable ones stay armed for the next turn.
    if (!p.repeatable) removeArmedPayload(p.id);
  };

  if (payloads.length === 0) return null;

  return (
    <div className="gm-requested-saves">
      <h3>Armed Effects</h3>
      {payloads.map((p) => {
        const persistent = isPersistent(p);
        // Show the expression the payload will ACTUALLY deal (heightened at the
        // rank it was armed with), not the un-scaled authored base.
        const hint = persistent
          ? persistentRidersFor(p).map((i) => `${i.dice} persistent ${i.type}`).join(', ')
          : (profileFor(p)?.expression || p.damageData?.base);
        const saveLabel = persistent ? null : (DEFENSE_LABELS[mapSpellDefense(p.defense)] || p.defense);
        const targets = picked[p.id] || [];
        return (
          <div key={p.id} className="gm-save-req-card">
            <div className="gm-save-req-header">
              <strong>{p.casterName}</strong>
              {' — '}
              {p.abilityName}
              {p.rank ? ` (rank ${p.rank})` : ''}
              {': '}
              {p.label}
              {p.repeatable && <span className="gm-save-req-basic"> (repeatable)</span>}
            </div>
            <div className="gm-save-req-dmg-hint">
              <strong>Trigger:</strong> {p.trigger}
            </div>
            {p.note && <div className="gm-save-req-dmg-hint">{p.note}</div>}
            <div className="gm-save-req-dmg-hint">
              {[hint, saveLabel ? `${saveLabel} DC ${p.dc}` : null].filter(Boolean).join(' — ')}
            </div>
            <div role="group" aria-label={`${p.label} targets`}>
              {enemies.length === 0 && <div className="gm-save-req-dmg-hint">No enemies in the encounter.</div>}
              {enemies.map((e) => (
                <label key={e.entryId} className="gm-save-req-target">
                  <input
                    type="checkbox"
                    checked={targets.includes(e.entryId)}
                    onChange={() => toggle(p.id, e.entryId)}
                  />
                  {e.name}
                </label>
              ))}
            </div>
            {persistent ? (
              // No save on firing — the cast-time save already set how bad it is.
              <label className="gm-save-req-target">
                Severity (from the cast save)
                <select
                  aria-label={`${p.label} severity`}
                  value={severity[p.id] || 'full'}
                  onChange={(ev) => setSeverity((cur) => ({ ...cur, [p.id]: ev.target.value }))}
                >
                  <option value="half">Success — half</option>
                  <option value="full">Failure — full</option>
                  <option value="double">Critical failure — double</option>
                </select>
              </label>
            ) : (
              <label className="gm-save-req-target">
                {hint ? `${hint} rolled total` : 'Rolled total'}
                <input
                  type="number"
                  aria-label={`${p.label} damage`}
                  value={entered[p.id] ?? ''}
                  onChange={(ev) => setEntered((cur) => ({ ...cur, [p.id]: ev.target.value }))}
                />
              </label>
            )}
            <div>
              <button type="button" onClick={() => fire(p)} disabled={targets.length === 0}>
                Fire
              </button>
              <button type="button" onClick={() => removeArmedPayload(p.id)}>
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ArmedPayloads;
