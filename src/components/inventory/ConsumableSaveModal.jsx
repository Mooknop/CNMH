import React, { useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import { useEncounter } from '../../hooks/useEncounter';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useTurnState } from '../../hooks/useTurnState';
import { useTargeting } from '../../hooks/useTargeting';
import { useSyncedState } from '../../hooks/useSyncedState';
import { consumableSave, consumableVerb } from '../../utils/consumables';
import { DEFENSE_LABELS } from '../../utils/defense';
import { APP, syncKey } from '../../sync/keys';
import './UseConsumableModal.css';

// Save-forcing consumable resolution (#1085 — Devil's Breath Incense and future
// alchemical area consumables). A consumable whose `consumable` block is
// { kind:'save', save:{ defense, dc, basic?, conditions?, damage? } } imposes a
// target save on nearby creatures. It rides the shared save-request rail exactly
// like a basic-save spell / dragonbreath: pick the creatures in the area, the
// GM rolls each save through RequestedSaves, and per-degree `conditions` land on
// the enemy-conditions rail (#1216). Optional rolled damage is entered once and
// each save scales it. Consuming increments the player-writable consumed overlay
// (same mechanism as UseConsumableModal), never the GM-gated inventory.
// The same target-pick → GM-save-request flow also drives an item ACTIVATION
// (#1439 activated abilities — Caterwaul Sling / Sparkblade / Spoiling Buckler):
// pass `saveBlock` (the activation's save contract) + `verb: 'Activate'` + an
// `onFire` that records the once/day use (instead of consuming), and `available`
// (the frequency gate) in place of a stock quantity. Defaults preserve the
// consumable behavior exactly.
const ConsumableSaveModal = ({
  isOpen, onClose, item, character, themeColor, actionCost = 1,
  saveBlock = null, verb: verbProp = null, onFire = null, available = null,
}) => {
  const { encounter, appendLog, addSaveRequest } = useEncounter();
  const { appendEvent } = useSessionLog();
  const { spendActions } = useTurnState(character?.id || 'nobody');
  const [, setConsumed] = useSyncedState(syncKey(APP.CONSUMED, character?.id), {});

  const order = useMemo(() => encounter?.order || [], [encounter]);
  const { selectable } = useTargeting(character?.id || '', order);
  const save = saveBlock || consumableSave(item);
  const defense = save?.defense || 'fortitude';
  const enemyTargets = useMemo(
    () => selectable.filter((e) => e.kind === 'enemy' && e.defenses),
    [selectable]
  );

  const [picked, setPicked] = useState(() => new Set());
  const [dmg, setDmg] = useState('');
  const [fired, setFired] = useState(false);

  if (!isOpen || !item || !character || !save) return null;

  const verb = verbProp || consumableVerb(item);
  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');
  const remaining = available != null ? (available ? 1 : 0) : (item.quantity ?? 1);
  const saveLabel = DEFENSE_LABELS[defense] || defense;
  const hasDamage = !!save.damage?.dice;
  const log = encounter?.active ? appendLog : ({ type, text }) => appendEvent({ type, text });

  const toggle = (entryId) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(entryId)) next.delete(entryId); else next.add(entryId);
      return next;
    });

  const handleConfirm = () => {
    if (remaining <= 0 || picked.size === 0 || fired) return;
    const targets = enemyTargets
      .filter((e) => picked.has(e.entryId))
      .map((e) => ({ entryId: e.entryId, name: e.name, saveMod: e.defenses?.saves?.[defense] ?? null }));

    const enteredNum = parseInt(dmg, 10);
    const damage = hasDamage && !Number.isNaN(enteredNum)
      ? { entered: enteredNum, expression: save.damage.dice, typeLabel: save.damage.type || null, riders: [] }
      : null;

    addSaveRequest({
      casterId: character.id,
      casterName: character.name,
      abilityName: item.name,
      save: defense,
      dc: save.dc,
      basic: !!save.basic,
      targets,
      ...(damage && { damage }),
      ...(save.conditions && { conditions: save.conditions }),
    });

    // Record the use: an activation fires its once/day frequency ledger; a
    // consumable increments the player-writable consumed overlay (mirrors
    // UseConsumableModal), never the GM-gated inventory.
    if (onFire) {
      onFire();
    } else {
      setConsumed((cur) => ({
        ...(cur || {}),
        [item.name]: ((cur || {})[item.name] || 0) + 1,
      }));
    }

    log({
      type: 'action',
      charId: character.id,
      text: `${character.name} ${onFire ? 'activated' : 'used'} ${item.name} (${save.basic ? 'basic ' : ''}${saveLabel} ${save.dc}) on ${targets.length} target${targets.length === 1 ? '' : 's'}`,
    });

    if (encounterMode && actionCost > 0) spendActions(actionCost, `${verb} ${item.name}`);
    setFired(true);
  };

  const handleClose = () => {
    setPicked(new Set());
    setDmg('');
    setFired(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`${verb} ${item.name}`}
      themeColor={themeColor}
      maxWidth="440px"
      placement="bottom"
      highZ
    >
      <section className="ct-section">
        <div className="ucm-summary">
          <span className="ucm-remaining" aria-label="remaining count">×{remaining} remaining</span>
          <span className="ucm-note">
            {`${save.basic ? 'basic ' : ''}${saveLabel} ${save.dc}${hasDamage ? ` · ${save.damage.dice}${save.damage.type ? ` ${save.damage.type}` : ''}` : ''}`}
          </span>
        </div>
        {save.note && <p className="ucm-effect-description">{save.note}</p>}
      </section>

      <hr className="ct-divider" />
      <section className="ct-section">
        <h3 className="ct-section-title">Targets in the area</h3>
        <div className="ucm-item-picks">
          {enemyTargets.length === 0 ? (
            <p className="ucm-empty">No enemies in the encounter.</p>
          ) : (
            enemyTargets.map((e) => (
              <button
                key={e.entryId}
                type="button"
                className={`ucm-item-btn${picked.has(e.entryId) ? ' ucm-item-btn--active' : ''}`}
                aria-pressed={picked.has(e.entryId)}
                onClick={() => { toggle(e.entryId); setFired(false); }}
                disabled={fired}
              >
                {e.name}
              </button>
            ))
          )}
        </div>
      </section>

      {hasDamage && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Rolled damage ({save.damage.dice})</h3>
            <div className="trr-entry-row">
              <input
                type="number"
                className="trr-roll-input"
                inputMode="numeric"
                placeholder={`roll ${save.damage.dice}`}
                aria-label="rolled damage"
                value={dmg}
                onChange={(e) => { setDmg(e.target.value); setFired(false); }}
                disabled={fired}
              />
              <span className="ucm-roll-hint">optional — leave blank to request saves only</span>
            </div>
          </section>
        </>
      )}

      <div className="ucm-footer">
        <button className="btn-secondary" onClick={handleClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={handleConfirm}
          disabled={remaining <= 0 || picked.size === 0 || fired}
        >
          {fired ? 'Used' : `${verb}${encounterMode && actionCost > 0 ? ` (${actionCost} act)` : ''}`}
        </button>
      </div>
    </Modal>
  );
};

export default ConsumableSaveModal;
