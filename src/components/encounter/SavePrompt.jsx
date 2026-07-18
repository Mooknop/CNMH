import React, { useState, useEffect } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { useCharacter } from '../../hooks/useCharacter';
import { computeSaveDegree } from '../../utils/saveDegree';
import { degreeLabel, degreeClass } from '../../utils/degreeDisplay';
import { flattenInventory } from '../../utils/InventoryUtils';
import { affixedKey, affixedTalismanItems, deactivateTalisman } from '../../utils/affix';
import { saveBonusTalisman } from '../../utils/talismanActivation';
import FoundryDiceInput from '../shared/FoundryDiceInput';
import './SavePrompt.css';
import { APP, syncKey } from '../../sync/keys';

const SAVE_LABELS = {
  fortitude: 'Fortitude',
  reflex:    'Reflex',
  will:      'Will',
};

/**
 * Appears on a player's device when the GM pushes a save prompt.
 * The player enters the raw d20 result; the component adds the character's
 * known save modifier, computes degree (inc. natural 1/20 shift), logs the
 * result to the encounter log, and shows it briefly before dismissing.
 *
 * @param {string} charId
 * @param {string} characterName
 * @param {object} saves - { fortitude, reflex, will } total modifiers from charData
 * @param {object} [character] - raw character (resolves an affixed save-bonus talisman, #254)
 */
const SavePrompt = ({ charId, characterName, saves = {}, character = null }) => {
  const [prompt] = useSyncedState(syncKey(APP.SAVEPROMPT, charId), null);
  const { appendLog } = useEncounter();
  const charData = useCharacter(character);
  const [affixed, setAffixed] = useSyncedState(affixedKey(charId), {});
  const [, setConsumed] = useSyncedState(syncKey(APP.CONSUMED, charId), {});

  const [d20Input, setD20Input] = useState('');
  const [pinOn,    setPinOn]    = useState(false); // Sanitizing Pin toggle
  const [result,   setResult]   = useState(null); // { degree, total, d20 }

  // Clear local state whenever the prompt reqId changes (new prompt from GM).
  useEffect(() => {
    setD20Input('');
    setPinOn(false);
    setResult(null);
  }, [prompt?.reqId]);

  if (!prompt) return null;

  const saveName = SAVE_LABELS[prompt.save] || prompt.save;
  const modifier  = saves[prompt.save] ?? 0;

  // A save-bonus talisman (e.g. Sanitizing Pin) affixed to this PC, matching the
  // prompted save. The player opts it in (it only applies vs the affliction).
  const affixedTalismans = affixedTalismanItems(affixed, flattenInventory(charData?.inventory));
  const pin = saveBonusTalisman(affixedTalismans, prompt.save);
  const pinBonus = pinOn && pin ? (pin.talisman.activation.effect.bonus || 0) : 0;
  const pinCritFailToFail = !!(pinOn && pin && pin.talisman.activation.effect.critFailToFail);

  const handleSubmit = () => {
    const d20 = parseInt(d20Input, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) return;
    const total  = d20 + modifier + pinBonus;
    let degree = computeSaveDegree({ d20, total, dc: prompt.dc });
    // Sanitizing Pin also upgrades a critical failure to a failure.
    if (pinCritFailToFail && degree === 'criticalFailure') degree = 'failure';
    const res = { degree, total, d20 };
    setResult(res);
    const label = degreeLabel(degree);
    const pinTag = pinOn && pin ? ` (${pin.name})` : '';
    appendLog({
      type:   'action',
      charId,
      text:   `${characterName} ${saveName} save (DC ${prompt.dc}${prompt.effectName ? ` — ${prompt.effectName}` : ''}): ${total}${pinTag} → ${label}`,
    });
    // Consume the talisman only when it was actually used.
    if (pinOn && pin) deactivateTalisman({ talisman: pin, setConsumed, setAffixed });
  };

  const handleDismiss = () => setResult(null);

  const degreeInfo = result
    ? { label: degreeLabel(result.degree), cls: degreeClass(result.degree) }
    : null;
  const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

  return (
    <div className="save-prompt" role="region" aria-label={`${saveName} save prompt`}>
      <div className="save-prompt-header">
        <span className="save-prompt-icon" aria-hidden="true">🎲</span>
        <span className="save-prompt-title">
          {prompt.effectName || `${saveName} Save`}
        </span>
      </div>

      <div className="save-prompt-details">
        <span className="save-prompt-type">{saveName}</span>
        <span className="save-prompt-dc">DC {prompt.dc}</span>
        {prompt.basic && <span className="save-prompt-basic">(basic)</span>}
        <span className="save-prompt-mod">Your modifier: {modStr}</span>
      </div>

      {!result && pin && (
        <label className="save-prompt-talisman">
          <input
            type="checkbox"
            checked={pinOn}
            onChange={(e) => setPinOn(e.target.checked)}
            aria-label={`${pin.name} (+${pin.talisman.activation.effect.bonus})`}
          />
          {pin.name} (+{pin.talisman.activation.effect.bonus} vs affliction)
        </label>
      )}

      {!result && (
        <div className="save-prompt-entry">
          <FoundryDiceInput
            min="1"
            max="20"
            inputClassName="save-prompt-input"
            placeholder="d20"
            ariaLabel="d20 roll"
            value={d20Input}
            onValue={setD20Input}
            charId={charId}
            flavor={`${saveName} Save${prompt.effectName ? ` — ${prompt.effectName}` : ''}`}
          />
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={d20Input === '' || parseInt(d20Input, 10) < 1 || parseInt(d20Input, 10) > 20}
            aria-label={`Submit ${saveName} save`}
          >
            Submit
          </button>
        </div>
      )}

      {result && degreeInfo && (
        <div className={`save-result ${degreeInfo.cls}`} role="status" aria-label="Save result">
          <span className="save-result-total">{result.total}</span>
          <span className="save-result-degree">{degreeInfo.label}</span>
          <button
            className="btn-text save-result-dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss save result"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default SavePrompt;
