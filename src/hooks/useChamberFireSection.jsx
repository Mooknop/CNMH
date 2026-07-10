import { useState } from 'react';
import { useChambers } from './useChambers';
import { ammoSaveDc } from '../utils/ammunition';
import { DEFENSE_LABELS } from '../utils/defense';
import { buildDamageApply } from '../utils/damageRelay';
import { RELAY } from '../sync/keys';

/**
 * Chambered ranged fire (#676 S4, #1271 AA2 — extracted #1317 D2): a capacity
 * Strike carrying its inventory uid (resolveItemStrikes). Reads the live
 * chambers, lists the loaded ones, and defaults the selection to the
 * auto-advance pointer (else the first loaded).
 *
 * Section-hook shape (adapted from the D1 gate pattern): { isChamberedFire,
 * fireExtra, commit, section }. `fireExtra` is the chosen ammo's Activate cost
 * (folds into the cost glyph + action spend); `commit(hitEntryIds)` is the
 * discharge bookkeeping the orchestrator calls from BOTH the failed-flat-check
 * early return (with []) and the happy path (with the hit entry ids).
 * `consumed` stays in the orchestrator (shared with the catalyst cluster);
 * only its setter is needed here.
 */
export const useChamberFireSection = ({
  ability,
  character,
  setConsumed,
  order,
  appendLog,
  addSaveRequest,
  sendUpdate,
  applyEnemyCondition,
}) => {
  // Chambered-weapon fire (#676, S4) — the live chamber overlay + the discharge
  // writer. Special-ammo depletion reuses the consumed overlay (like consumables).
  const { stateFor: chamberStateFor, fire: fireChamber } = useChambers(character?.id || 'nobody');
  const [fireChamberIdx, setFireChamberIdx] = useState(null);
  // Rolled total for the loaded ammo's on-hit damage payload (#1271, AA2 —
  // Storm Arrow's 3d12): entered by the player like every other damage roll.
  const [ammoDmgInput, setAmmoDmgInput] = useState('');

  const isChamberedFire = ability?.capacity != null && ability?.weaponUid != null;
  const liveChamberState = isChamberedFire
    ? chamberStateFor(ability.weaponUid, ability.capacity)
    : null;
  const loadedChambers = liveChamberState
    ? liveChamberState.chambers
        .map((ref, index) => (ref ? { index, ref } : null))
        .filter(Boolean)
    : [];
  const pointerLoaded = liveChamberState && liveChamberState.chambers[liveChamberState.pointer]
    ? liveChamberState.pointer
    : (loadedChambers[0]?.index ?? -1);
  const selectedFireIdx = (fireChamberIdx != null && loadedChambers.some((c) => c.index === fireChamberIdx))
    ? fireChamberIdx
    : pointerLoaded;
  const selectedChamberRef = (isChamberedFire && selectedFireIdx >= 0)
    ? liveChamberState.chambers[selectedFireIdx]
    : null;
  // Extra actions the chosen ammo costs to fire (Activate) — folded into the cost
  // glyph + the action spend, mirroring the consumable 1 + drawCost model.
  const fireExtra = (selectedChamberRef?.activate || 0);

  // Chambered fire bookkeeping (#676, S4): empty the fired chamber + advance the
  // pointer, decrement special ammo from inventory (plain bolts are infinite),
  // and on a hit apply the ammo's on-hit payload to the struck enemies. Runs on
  // every fire path — including a lost concealment flat check (the bolt is
  // still spent), where `hitEntryIds` is empty so no on-hit payload lands.
  //
  // On-hit payload v2 (#1271, AA2): beyond the effectId condition, the ammo may
  // force a save (per-degree conditions ride the GM rail, damage resolves per
  // degree GM-side) and/or deal extra typed damage (no save → straight to the
  // dmgapply relay, Foundry nets IWR). The damage total is player-entered
  // (ammoDmgInput) like every other rolled damage in the app.
  const commit = (hitEntryIds) => {
    if (!isChamberedFire || selectedFireIdx < 0) return;
    const ref = selectedChamberRef;
    fireChamber(ability.weaponUid, selectedFireIdx, ability.capacity);
    if (ref && !ref.default && ref.item) {
      setConsumed((cur) => ({ ...(cur || {}), [ref.item]: ((cur || {})[ref.item] || 0) + 1 }));
    }
    const appliedOnHit = !!(ref && ref.onHit && ref.effectId && hitEntryIds.length > 0);
    if (appliedOnHit) {
      hitEntryIds.forEach((eid) => applyEnemyCondition(eid, { id: ref.effectId, source: ref.name }));
    }
    appendLog({
      type:   'action',
      charId: character.id,
      text:   `${character.name} fires the ${ability.source || ability.name} — ${ref?.name || 'bolt'}`
        + ` (${ability.nock ? 'nocked' : `chamber ${selectedFireIdx + 1}`})${appliedOnHit ? ` · ${ref.name} effect applied` : ''}`,
    });

    // Damage/save payloads apply to struck ENEMIES only — PC damage flows
    // through cnmh_hp and enemy saves need the bestiary save mods.
    const hitEnemies = hitEntryIds
      .map((eid) => (order || []).find((e) => e.entryId === eid))
      .filter((e) => e && e.kind === 'enemy');
    if (!ref || !ref.onHit || hitEnemies.length === 0) return;
    const enteredRaw = parseInt(ammoDmgInput, 10);
    const entered = Number.isNaN(enteredRaw) ? null : enteredRaw;

    if (ref.save) {
      const save = ref.save.stat || 'reflex';
      const dc = ammoSaveDc(ref.save, ability);
      addSaveRequest({
        casterId: character.id,
        casterName: character.name,
        abilityName: ref.name,
        save,
        dc,
        basic: !!ref.save.basic,
        ...(ref.save.rank != null ? { rank: ref.save.rank } : {}),
        targets: hitEnemies.map((e) => ({
          entryId: e.entryId,
          name: e.name,
          saveMod: e.defenses?.saves?.[save] ?? null,
        })),
        ...(ref.damage ? {
          damage: {
            entered,
            expression: ref.damage.dice ?? null,
            typeLabel: ref.damage.type ?? null,
            riders: [],
            ...(ref.save.degrees ? { degrees: ref.save.degrees } : {}),
          },
        } : {}),
        ...(ref.save.conditions ? { conditions: ref.save.conditions } : {}),
      });
      appendLog({
        type: 'system',
        text: `${ref.name}: ${DEFENSE_LABELS[save] || save} save DC ${dc} pushed to the GM`
          + (ref.damage ? ` — ${ref.damage.dice} ${ref.damage.type}${entered == null ? ' (roll not entered)' : ''}` : ''),
      });
    } else if (ref.damage) {
      if (entered != null) {
        sendUpdate('global', RELAY.DMGAPPLY, buildDamageApply({
          hits: hitEnemies.map((e) => ({
            entryId: e.entryId,
            name: e.name,
            amount: entered,
            type: ref.damage.type || '',
          })),
          sourceName: ref.name,
        }));
        appendLog({
          type: 'action',
          charId: character.id,
          text: `${ref.name}: ${entered} ${ref.damage.type || ''} damage → ${hitEnemies.map((e) => e.name).join(', ')}`,
        });
      } else {
        appendLog({
          type: 'system',
          text: `${ref.name}: roll not entered — apply ${ref.damage.dice} ${ref.damage.type || ''} to ${hitEnemies.map((e) => e.name).join(', ')} manually`,
        });
      }
    }
    if (ref.note) {
      appendLog({ type: 'action', charId: character.id, text: `${ref.name}: ${ref.note}` });
    }
  };

  // Chamber selection (#676) — which loaded chamber to fire. Defaults to the
  // auto-advance pointer; firing special ammo adds its Activate cost. A nock
  // weapon (#1270) has a single slot, so this reads "Nocked: <ammo>".
  const section = (isChamberedFire && loadedChambers.length > 0) ? (
    <>
      <hr className="ct-divider" />
      <section className="ct-section">
        <h3 className="ct-section-title">{ability.nock ? 'Ammunition' : 'Chamber'}</h3>
        <div className="uam-cost-options" role="radiogroup" aria-label="Chamber to fire">
          {loadedChambers.map(({ index, ref }) => (
            <label key={index} className="uam-cost-option">
              <input
                type="radio"
                name="fire-chamber"
                checked={selectedFireIdx === index}
                onChange={() => setFireChamberIdx(index)}
              />
              {ability.nock ? 'Nocked' : `Chamber ${index + 1}`}: {ref.name}
              {ref.activate > 0 ? ` (+${ref.activate} to fire)` : ''}
            </label>
          ))}
        </div>
        {/* On-hit damage payload (#1271, AA2) — the player rolls the ammo's
            dice and enters the total; it rides the save request (basic save
            resolves per degree GM-side) or goes straight to dmgapply. */}
        {selectedChamberRef?.damage && (
          <label className="uam-ammo-dmg">
            {selectedChamberRef.name} on-hit damage ({selectedChamberRef.damage.dice} {selectedChamberRef.damage.type})
            {selectedChamberRef.save ? ` — ${selectedChamberRef.save.basic ? 'basic ' : ''}${DEFENSE_LABELS[selectedChamberRef.save.stat] || selectedChamberRef.save.stat} DC ${ammoSaveDc(selectedChamberRef.save, ability)}` : ''}
            <input
              type="number"
              inputMode="numeric"
              value={ammoDmgInput}
              onChange={(e) => setAmmoDmgInput(e.target.value)}
              placeholder="rolled total"
              aria-label="ammo damage roll"
            />
          </label>
        )}
        {selectedChamberRef?.save && !selectedChamberRef.damage && (
          <p className="uam-ammo-save-hint">
            On hit: {DEFENSE_LABELS[selectedChamberRef.save.stat] || selectedChamberRef.save.stat} save
            {' '}DC {ammoSaveDc(selectedChamberRef.save, ability)} → GM
          </p>
        )}
      </section>
    </>
  ) : null;

  return { isChamberedFire, fireExtra, commit, section };
};

export default useChamberFireSection;
