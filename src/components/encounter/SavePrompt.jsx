import React, { useState, useEffect } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { computeSaveDegree } from '../../utils/saveDegree';
import './SavePrompt.css';

const DEGREE_LABELS = {
  criticalSuccess: { label: 'Critical Success', cls: 'save-crit-success' },
  success:         { label: 'Success',           cls: 'save-success' },
  failure:         { label: 'Failure',           cls: 'save-failure' },
  criticalFailure: { label: 'Critical Failure',  cls: 'save-crit-failure' },
};

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
 */
const SavePrompt = ({ charId, characterName, saves = {} }) => {
  const [prompt] = useSyncedState(`cnmh_saveprompt_${charId}`, null);
  const { appendLog } = useEncounter();

  const [d20Input, setD20Input] = useState('');
  const [result,   setResult]   = useState(null); // { degree, total, d20 }

  // Clear local state whenever the prompt reqId changes (new prompt from GM).
  useEffect(() => {
    setD20Input('');
    setResult(null);
  }, [prompt?.reqId]);

  if (!prompt) return null;

  const saveName = SAVE_LABELS[prompt.save] || prompt.save;
  const modifier  = saves[prompt.save] ?? 0;

  const handleSubmit = () => {
    const d20 = parseInt(d20Input, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) return;
    const total  = d20 + modifier;
    const degree = computeSaveDegree({ d20, total, dc: prompt.dc });
    const res = { degree, total, d20 };
    setResult(res);
    const label = DEGREE_LABELS[degree]?.label ?? degree;
    appendLog({
      type:   'action',
      charId,
      text:   `${characterName} ${saveName} save (DC ${prompt.dc}${prompt.effectName ? ` — ${prompt.effectName}` : ''}): ${total} → ${label}`,
    });
  };

  const handleDismiss = () => setResult(null);

  const degreeInfo = result ? DEGREE_LABELS[result.degree] : null;
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

      {!result && (
        <div className="save-prompt-entry">
          <input
            type="number"
            min="1"
            max="20"
            className="save-prompt-input"
            placeholder="d20"
            aria-label="d20 roll"
            value={d20Input}
            onChange={(e) => setD20Input(e.target.value)}
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
