import React, { useState, useEffect } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { computeSaveDegree } from '../../utils/saveDegree';
import { vpForDegree, skillLabel } from '../../utils/victoryPoints';
import './SavePrompt.css';

const DEGREE_LABELS = {
  criticalSuccess: { label: 'Critical Success', cls: 'save-crit-success' },
  success:         { label: 'Success',           cls: 'save-success'      },
  failure:         { label: 'Failure',           cls: 'save-failure'      },
  criticalFailure: { label: 'Critical Failure',  cls: 'save-crit-failure' },
};

/**
 * Appears on a player's device when the GM pushes a skill check prompt
 * via cnmh_skillprompt_<charId>. Two payload variants:
 *
 *  - Recall Knowledge (single skill): { reqId, skill, dc, label? }
 *  - VP skill challenge:              { reqId, challengeId, skills: [{skill, dc}], label }
 *
 * Single skill: player enters raw d20, modifier is added, degree is
 * computed and logged (mirrors SavePrompt).
 * Challenge: player first picks one of the allowed skills, then rolls;
 * the result is locked (no dismiss, no re-roll) and reported to the GM
 * panel via cnmh_vpresult_<charId> with its VP contribution.
 *
 * @param {string} charId
 * @param {string} characterName
 * @param {object} skillModifiers - full skill map { arcana, intimidation, ... }
 */
const SkillPrompt = ({ charId, characterName, skillModifiers = {} }) => {
  const [prompt] = useSyncedState(`cnmh_skillprompt_${charId}`, null);
  const [vpResult, setVpResult] = useSyncedState(`cnmh_vpresult_${charId}`, null);
  const { appendLog } = useEncounter();

  const [d20Input,    setD20Input]    = useState('');
  const [result,      setResult]      = useState(null);
  const [chosenSkill, setChosenSkill] = useState(null);

  useEffect(() => {
    setD20Input('');
    setResult(null);
    setChosenSkill(null);
  }, [prompt?.reqId]);

  if (!prompt) return null;

  const isChallenge = !!prompt.challengeId;
  const options = Array.isArray(prompt.skills) && prompt.skills.length
    ? prompt.skills
    : [{ skill: prompt.skill, dc: prompt.dc }];

  // Challenge results are final per reqId: a refreshed device rehydrates the
  // synced vpresult, so derive the displayed result from it rather than
  // local state alone — the player cannot re-roll.
  const submittedVp = isChallenge && vpResult?.reqId === prompt.reqId ? vpResult : null;
  const effectiveResult = submittedVp
    ? { degree: submittedVp.degree, total: submittedVp.total, d20: submittedVp.d20, vp: submittedVp.vp }
    : result;

  const selected = options.length === 1
    ? options[0]
    : options.find((o) => o.skill === (submittedVp?.skill ?? chosenSkill)) || null;

  const titleFallback = isChallenge ? 'Skill Challenge' : 'Recall Knowledge';

  const handleSubmit = () => {
    if (!selected) return;
    const d20 = parseInt(d20Input, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) return;
    const modifier = skillModifiers[selected.skill] ?? 0;
    const total  = d20 + modifier;
    const degree = computeSaveDegree({ d20, total, dc: selected.dc });
    const label  = DEGREE_LABELS[degree]?.label ?? degree;

    if (isChallenge) {
      const vp = vpForDegree(degree);
      setResult({ degree, total, d20, vp });
      setVpResult({
        challengeId: prompt.challengeId,
        reqId:       prompt.reqId,
        skill:       selected.skill,
        d20,
        total,
        degree,
        vp,
        at: Date.now(),
      });
      appendLog({
        type:   'action',
        charId,
        text:   `${characterName} — ${prompt.label || titleFallback}: ${skillLabel(selected.skill)} (DC ${selected.dc}): ${total} → ${label} (${vp >= 0 ? '+' : ''}${vp} VP)`,
      });
    } else {
      setResult({ degree, total, d20 });
      appendLog({
        type:   'action',
        charId,
        text:   `${characterName} Recall Knowledge — ${prompt.label || skillLabel(selected.skill)} (DC ${selected.dc}): ${total} → ${label}`,
      });
    }
  };

  const handleDismiss = () => setResult(null);

  const degreeInfo = effectiveResult ? DEGREE_LABELS[effectiveResult.degree] : null;
  const showChooser = options.length > 1 && !effectiveResult;
  const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);

  return (
    <div className="save-prompt" role="region" aria-label={`${selected ? skillLabel(selected.skill) : titleFallback} skill prompt`}>
      <div className="save-prompt-header">
        <span className="save-prompt-icon" aria-hidden="true">🔍</span>
        <span className="save-prompt-title">
          {prompt.label || titleFallback}
        </span>
      </div>

      {showChooser && (
        <div className="skill-choices" role="radiogroup" aria-label="Choose a skill">
          {options.map((o) => (
            <button
              key={o.skill}
              type="button"
              role="radio"
              aria-checked={chosenSkill === o.skill}
              className={`skill-choice${chosenSkill === o.skill ? ' skill-choice--selected' : ''}`}
              onClick={() => setChosenSkill(o.skill)}
            >
              <span className="skill-choice-name">{skillLabel(o.skill)}</span>
              <span className="skill-choice-dc">DC {o.dc}</span>
              <span className="skill-choice-mod">{fmtMod(skillModifiers[o.skill] ?? 0)}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="save-prompt-details">
          <span className="save-prompt-type">{skillLabel(selected.skill)}</span>
          <span className="save-prompt-dc">DC {selected.dc}</span>
          <span className="save-prompt-mod">Your modifier: {fmtMod(skillModifiers[selected.skill] ?? 0)}</span>
        </div>
      )}

      {!effectiveResult && (
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
            disabled={!selected || d20Input === '' || parseInt(d20Input, 10) < 1 || parseInt(d20Input, 10) > 20}
            aria-label={selected ? `Submit ${skillLabel(selected.skill)} check` : 'Submit check'}
          >
            Submit
          </button>
        </div>
      )}

      {effectiveResult && degreeInfo && (
        <div className={`save-result ${degreeInfo.cls}`} role="status" aria-label="Skill check result">
          <span className="save-result-total">{effectiveResult.total}</span>
          <span className="save-result-degree">{degreeInfo.label}</span>
          {isChallenge && (
            <span className="save-result-vp">
              {effectiveResult.vp >= 0 ? '+' : ''}{effectiveResult.vp} VP
            </span>
          )}
          {!isChallenge && (
            <button
              className="btn-text save-result-dismiss"
              onClick={handleDismiss}
              aria-label="Dismiss skill result"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SkillPrompt;
