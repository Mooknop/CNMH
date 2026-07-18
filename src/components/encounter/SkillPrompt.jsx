import React, { useState, useEffect } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { computeSaveDegree } from '../../utils/saveDegree';
import { degreeLabel, degreeClass } from '../../utils/degreeDisplay';
import { skillLabel } from '../../utils/victoryPoints';
import FoundryDiceInput from '../shared/FoundryDiceInput';
import './SavePrompt.css';
import { APP, syncKey } from '../../sync/keys';

/**
 * Appears on a player's device when the GM pushes a single-skill check
 * prompt (Recall Knowledge) via cnmh_skillprompt_<charId>:
 * { reqId, skill, dc, label? }.
 *
 * Player enters raw d20, modifier is added, degree is computed and logged
 * (mirrors SavePrompt).
 *
 * VP challenge prompts no longer ride this channel — they derive from
 * cnmh_vpchallenge_global in ChallengePrompts (#1470). Stale challenge
 * payloads (with a challengeId) from an older session are ignored.
 *
 * @param {string} charId
 * @param {string} characterName
 * @param {object} skillModifiers - full skill map { arcana, intimidation, ... }
 */
const SkillPrompt = ({ charId, characterName, skillModifiers = {} }) => {
  const [prompt] = useSyncedState(syncKey(APP.SKILLPROMPT, charId), null);
  const { appendLog } = useEncounter();

  const [d20Input, setD20Input] = useState('');
  const [result,   setResult]   = useState(null);

  useEffect(() => {
    setD20Input('');
    setResult(null);
  }, [prompt?.reqId]);

  if (!prompt || prompt.challengeId) return null;

  const { skill, dc } = prompt;

  const handleSubmit = () => {
    const d20 = parseInt(d20Input, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) return;
    const modifier = skillModifiers[skill] ?? 0;
    const total  = d20 + modifier;
    const degree = computeSaveDegree({ d20, total, dc });
    setResult({ degree, total, d20 });
    appendLog({
      type:   'action',
      charId,
      text:   `${characterName} Recall Knowledge — ${prompt.label || skillLabel(skill)} (DC ${dc}): ${total} → ${degreeLabel(degree)}`,
    });
  };

  const handleDismiss = () => setResult(null);

  const degreeInfo = result
    ? { label: degreeLabel(result.degree), cls: degreeClass(result.degree) }
    : null;
  const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);

  return (
    <div className="save-prompt" role="region" aria-label={`${skillLabel(skill)} skill prompt`}>
      <div className="save-prompt-header">
        <span className="save-prompt-icon" aria-hidden="true">🔍</span>
        <span className="save-prompt-title">
          {prompt.label || 'Recall Knowledge'}
        </span>
      </div>

      <div className="save-prompt-details">
        <span className="save-prompt-type">{skillLabel(skill)}</span>
        <span className="save-prompt-dc">DC {dc}</span>
        <span className="save-prompt-mod">Your modifier: {fmtMod(skillModifiers[skill] ?? 0)}</span>
      </div>

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
            flavor={`${prompt.label || 'Recall Knowledge'}: ${skillLabel(skill)} (DC ${dc})`}
          />
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={d20Input === '' || parseInt(d20Input, 10) < 1 || parseInt(d20Input, 10) > 20}
            aria-label={`Submit ${skillLabel(skill)} check`}
          >
            Submit
          </button>
        </div>
      )}

      {result && degreeInfo && (
        <div className={`save-result ${degreeInfo.cls}`} role="status" aria-label="Skill check result">
          <span className="save-result-total">{result.total}</span>
          <span className="save-result-degree">{degreeInfo.label}</span>
          <button
            className="btn-text save-result-dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss skill result"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default SkillPrompt;
