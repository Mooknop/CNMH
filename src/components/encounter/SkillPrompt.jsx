import React, { useState, useEffect } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { computeSaveDegree } from '../../utils/saveDegree';
import './SavePrompt.css';

const DEGREE_LABELS = {
  criticalSuccess: { label: 'Critical Success', cls: 'save-crit-success' },
  success:         { label: 'Success',           cls: 'save-success'      },
  failure:         { label: 'Failure',           cls: 'save-failure'      },
  criticalFailure: { label: 'Critical Failure',  cls: 'save-crit-failure' },
};

const SKILL_LABELS = {
  arcana:      'Arcana',
  nature:      'Nature',
  occultism:   'Occultism',
  religion:    'Religion',
  society:     'Society',
};

/**
 * Appears on a player's device when the GM pushes a Recall Knowledge
 * (or other skill check) prompt via cnmh_skillprompt_<charId>.
 * Mirrors SavePrompt exactly: player enters raw d20, modifier is added,
 * degree is computed and logged.
 *
 * @param {string} charId
 * @param {string} characterName
 * @param {object} skillModifiers - { arcana, nature, occultism, religion, society, ... }
 */
const SkillPrompt = ({ charId, characterName, skillModifiers = {} }) => {
  const [prompt] = useSyncedState(`cnmh_skillprompt_${charId}`, null);
  const { appendLog } = useEncounter();

  const [d20Input, setD20Input] = useState('');
  const [result,   setResult]   = useState(null);

  useEffect(() => {
    setD20Input('');
    setResult(null);
  }, [prompt?.reqId]);

  if (!prompt) return null;

  const skillName = SKILL_LABELS[prompt.skill] || prompt.skill;
  const modifier  = skillModifiers[prompt.skill] ?? 0;

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
      text:   `${characterName} Recall Knowledge — ${prompt.label || skillName} (DC ${prompt.dc}): ${total} → ${label}`,
    });
  };

  const handleDismiss = () => setResult(null);

  const degreeInfo = result ? DEGREE_LABELS[result.degree] : null;
  const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

  return (
    <div className="save-prompt" role="region" aria-label={`${skillName} skill prompt`}>
      <div className="save-prompt-header">
        <span className="save-prompt-icon" aria-hidden="true">🔍</span>
        <span className="save-prompt-title">
          {prompt.label || `Recall Knowledge`}
        </span>
      </div>

      <div className="save-prompt-details">
        <span className="save-prompt-type">{skillName}</span>
        <span className="save-prompt-dc">DC {prompt.dc}</span>
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
            aria-label={`Submit ${skillName} check`}
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
