import React, { useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import { useEncounter } from '../../hooks/useEncounter';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useTurnState } from '../../hooks/useTurnState';
import { useTargeting } from '../../hooks/useTargeting';
import {
  dragonbreathMeta,
  dragonbreathBreath,
  dragonbreathDisplayName,
} from '../../utils/dragonbreath';
import './DragonbreathModal.css';

// The two once-per-minute breath activations (#1210 M4e): a cone whose length
// grows by tier, and a fixed 5-ft emanation. Mechanically identical (same dice,
// DC, and basic Reflex save) — the shape only frames the area the GM adjudicates.
const SHAPES = {
  cone: { key: 'cone', verb: 'Unleash Dragonbreath' },
  emanation: { key: 'emanation', verb: 'Eruption' },
};

const BREATH_ACTIONS = 2;

/**
 * Unleash a dragonbreath weapon's breath (Magic+ arsenal M4e, epic #1206 /
 * #1210). A 2-action, once-per-minute AoE: every creature in the area attempts a
 * basic Reflex save vs the tier's DC and takes the tier's dice of the dragon's
 * damage type. Resolved GM-side through the shared save-request rail
 * (addSaveRequest → RequestedSaves → the outgoing-damage relay #1016), exactly
 * like a basic-save spell — the caster rolls the damage once and each target's
 * save halves / doubles it.
 *
 * @param {Object} item      - the dragonbreath-templated weapon (entry.dragonbreath)
 * @param {Object} character - the wielder
 */
const DragonbreathModal = ({ isOpen, onClose, item, character, themeColor }) => {
  const { encounter, appendLog, addSaveRequest } = useEncounter();
  const { appendEvent } = useSessionLog();
  const { spendActions } = useTurnState(character?.id || 'nobody');

  const order = useMemo(() => encounter?.order || [], [encounter]);
  const { selectable } = useTargeting(character?.id || '', order);
  const enemyTargets = useMemo(
    () => selectable.filter((e) => e.kind === 'enemy' && e.defenses),
    [selectable]
  );

  const meta = dragonbreathMeta(item);
  const breath = dragonbreathBreath(item);

  const [shape, setShape] = useState('cone');
  const [dmgType, setDmgType] = useState((breath && breath.damageTypes[0]) || '');
  const [picked, setPicked] = useState(() => new Set());
  const [dmg, setDmg] = useState('');
  const [fired, setFired] = useState(false);

  const encounterMode = !!(encounter?.active && encounter.phase === 'in-progress');
  const coneFt = breath ? breath.coneFt : 0;
  const areaLabel = shape === 'cone' ? `${coneFt}-ft cone` : `${breath?.emanationFt ?? 5}-ft emanation`;
  const expression = breath ? `${breath.dice}${dmgType ? ` ${dmgType}` : ''}` : '';

  const toggle = (entryId) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(entryId)) next.delete(entryId); else next.add(entryId);
      return next;
    });

  const log = encounter?.active ? appendLog : ({ type, text }) => appendEvent({ type, text });

  const handleConfirm = () => {
    if (!breath || picked.size === 0) return;
    const targets = enemyTargets
      .filter((e) => picked.has(e.entryId))
      .map((e) => ({ entryId: e.entryId, name: e.name, saveMod: e.defenses?.saves?.reflex ?? null }));

    const enteredNum = parseInt(dmg, 10);
    const damage = !Number.isNaN(enteredNum)
      ? { entered: enteredNum, expression: breath.dice, typeLabel: dmgType || null, riders: [] }
      : null;

    addSaveRequest({
      casterId: character.id,
      casterName: character.name,
      abilityName: `${dragonbreathDisplayName(item, item.name)} — ${SHAPES[shape].verb}`,
      save: 'reflex',
      dc: breath.dc,
      basic: true,
      targets,
      ...(damage && { damage }),
    });

    log({
      type: 'action',
      charId: character.id,
      text: `${character.name} breathes with ${dragonbreathDisplayName(item, item.name)} (${areaLabel}, ${expression}, basic Reflex DC ${breath.dc}) at ${targets.length} target${targets.length === 1 ? '' : 's'} — once per minute`,
    });

    if (encounterMode) spendActions(BREATH_ACTIONS, `${SHAPES[shape].verb} (${item.name})`);
    setFired(true);
  };

  const handleClose = () => {
    setShape('cone');
    setPicked(new Set());
    setDmg('');
    setFired(false);
    onClose();
  };

  if (!isOpen || !item || !character || !meta || !breath) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`${SHAPES[shape].verb}`}
      themeColor={themeColor}
      maxWidth="440px"
      placement="bottom"
      highZ
    >
      <div className="dbm-body">
        <div className="dbm-summary">
          <span className="dbm-area" aria-label="area">{areaLabel}</span>
          <span className="dbm-def">{breath.dice}{dmgType ? ` ${dmgType}` : ''} · basic Reflex DC {breath.dc}</span>
        </div>

        {/* Breath shape — cone (tier length) or 5-ft emanation */}
        <div className="dbm-field">
          <label className="dbm-label">Shape</label>
          <div className="dbm-picks" role="radiogroup" aria-label="Breath shape">
            <button
              type="button"
              className={`dbm-pick${shape === 'cone' ? ' dbm-pick--active' : ''}`}
              aria-pressed={shape === 'cone'}
              onClick={() => { setShape('cone'); setFired(false); }}
              disabled={fired}
            >
              {coneFt}-ft cone
            </button>
            <button
              type="button"
              className={`dbm-pick${shape === 'emanation' ? ' dbm-pick--active' : ''}`}
              aria-pressed={shape === 'emanation'}
              onClick={() => { setShape('emanation'); setFired(false); }}
              disabled={fired}
            >
              {breath.emanationFt}-ft emanation
            </button>
          </div>
        </div>

        {/* Damage type — a multi-option dragon kind lets the wielder choose */}
        {breath.damageTypes.length > 1 && (
          <div className="dbm-field">
            <label className="dbm-label">Damage type</label>
            <div className="dbm-picks" role="radiogroup" aria-label="Damage type">
              {breath.damageTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`dbm-pick${dmgType === t ? ' dbm-pick--active' : ''}`}
                  aria-pressed={dmgType === t}
                  onClick={() => { setDmgType(t); setFired(false); }}
                  disabled={fired}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
        {breath.damageTypes.length === 0 && (
          <p className="dbm-note">This dragon kind has no authored damage type — the GM sets it.</p>
        )}

        {/* Targets caught in the area */}
        <div className="dbm-field">
          <label className="dbm-label">Targets in the area</label>
          <div className="dbm-picks">
            {enemyTargets.length === 0 ? (
              <span className="dbm-empty">No enemies in the encounter.</span>
            ) : (
              enemyTargets.map((e) => (
                <button
                  key={e.entryId}
                  type="button"
                  className={`dbm-pick${picked.has(e.entryId) ? ' dbm-pick--active' : ''}`}
                  aria-pressed={picked.has(e.entryId)}
                  onClick={() => { toggle(e.entryId); setFired(false); }}
                  disabled={fired}
                >
                  {e.name}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Rolled damage — the caster rolls the breath once; saves scale it */}
        <div className="dbm-field">
          <label className="dbm-label" htmlFor="dbm-dmg">Rolled damage ({expression})</label>
          <input
            id="dbm-dmg"
            type="number"
            className="dbm-dmg"
            inputMode="numeric"
            value={dmg}
            onChange={(e) => { setDmg(e.target.value); setFired(false); }}
            placeholder={`roll ${breath.dice}`}
            disabled={fired}
          />
          <p className="dbm-hint">Optional — leave blank to request saves only and apply damage by hand.</p>
        </div>

        <div className="dbm-actions">
          <button
            type="button"
            className="btn-primary dbm-confirm"
            data-testid="dbm-breathe"
            onClick={handleConfirm}
            disabled={picked.size === 0 || fired}
          >
            {fired ? 'Breathed' : `${SHAPES[shape].verb}${encounterMode ? ` (${BREATH_ACTIONS} act)` : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default DragonbreathModal;
