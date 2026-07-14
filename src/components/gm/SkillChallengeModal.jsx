import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSessionLog } from '../../hooks/useSessionLog';
import { SKILL_ABILITY_MAP } from '../../utils/CharacterUtils';
import { skillLabel, normalizeChallenges, CHALLENGE_MODES } from '../../utils/victoryPoints';
import './SkillChallengeModal.css';
import { APP, globalKey } from '../../sync/keys';

const SKILL_KEYS = Object.keys(SKILL_ABILITY_MAP);

const emptyRow = () => ({ skill: 'arcana', dc: '' });

/**
 * GM quick action: define and launch a Victory Point skill challenge
 * (PF2e VP subsystem). Adds a track to the cnmh_vpchallenge_global
 * collection (#1470) — multiple tracks run concurrently; players derive
 * their prompt cards from the collection (ChallengePrompts), so no per-PC
 * prompt push is needed.
 */
const SkillChallengeModal = ({ isOpen, onClose }) => {
  const { characters } = useContent();
  const { appendEvent } = useSessionLog();
  const [challenges, setChallenges] = useSyncedState(globalKey(APP.VPCHALLENGE), null);

  const [name,       setName]       = useState('');
  const [rows,       setRows]       = useState([emptyRow()]);
  const [threshold,  setThreshold]  = useState('');
  const [target,     setTarget]     = useState('all');
  const [mode,       setMode]       = useState(CHALLENGE_MODES.ONCE);
  const [actionCost, setActionCost] = useState('0');
  const [startValue, setStartValue] = useState('');
  const [minVal,     setMinVal]     = useState('');
  const [maxVal,     setMaxVal]     = useState('');
  const [failAt,     setFailAt]     = useState('');
  const [drain,      setDrain]      = useState('');

  const updateRow = (idx, patch) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (idx) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const numOrNull = (s) => {
    const n = parseInt(s, 10);
    return s === '' || isNaN(n) ? null : n;
  };

  const thresholdNum = parseInt(threshold, 10);
  const startNum = numOrNull(startValue);
  // A survival meter (start value set) needs no success threshold — it lives
  // and dies by failAt/nudges; anything else must have a success line.
  const canSend =
    name.trim() !== '' &&
    rows.length > 0 &&
    rows.every((r) => parseInt(r.dc, 10) > 0) &&
    (thresholdNum >= 1 || startNum !== null) &&
    (characters || []).length > 0;

  const activeCount = Object.keys(normalizeChallenges(challenges)).length;

  const handleSend = () => {
    if (!canSend) return;
    const skills = rows.map((r) => ({ skill: r.skill, dc: parseInt(r.dc, 10) }));
    const targets = target === 'all'
      ? (characters || [])
      : (characters || []).filter((c) => c.id === target);
    const id = `vpc-${Date.now()}`;
    const costNum = parseInt(actionCost, 10) || 0;

    const minNum = numOrNull(minVal);
    const maxNum = numOrNull(maxVal);
    const failNum = numOrNull(failAt);
    const drainNum = Math.max(0, numOrNull(drain) ?? 0);

    const doc = {
      id,
      name: name.trim(),
      skills,
      threshold: thresholdNum >= 1 ? thresholdNum : null,
      target,
      targetIds: targets.map((c) => c.id),
      mode,
      actionCost: costNum,
      createdAt: Date.now(),
      // Meter semantics (#1471) — only stamped when configured.
      ...(startNum !== null ? { startValue: startNum } : {}),
      ...(minNum !== null ? { min: minNum } : {}),
      ...(maxNum !== null ? { max: maxNum } : {}),
      ...(failNum !== null ? { failAt: failNum } : {}),
      drainPerRound: drainNum,
      adjust: 0,
      lastDrainRound: null,
    };
    setChallenges((cur) => ({ ...normalizeChallenges(cur), [id]: doc }));

    const targetLabel = target === 'all' ? 'all characters' : (targets[0]?.name ?? target);
    const thresholdStr = thresholdNum >= 1 ? `, threshold ${thresholdNum} VP` : '';
    const meterStr = startNum !== null
      ? `, meter starts at ${startNum}${drainNum > 0 ? ` (drains ${drainNum}/round)` : ''}`
      : '';
    const cadenceStr = mode === CHALLENGE_MODES.PER_ROUND ? ', repeats each round' : '';
    const costStr = costNum > 0 ? `, costs ${costNum} action${costNum === 1 ? '' : 's'}` : '';
    appendEvent({
      type: 'challenge',
      text: `Skill challenge "${name.trim()}" — ${skills.map((s) => skillLabel(s.skill)).join(', ')}${thresholdStr}${meterStr}${cadenceStr}${costStr} → ${targetLabel}`,
    });
    handleClose();
  };

  const handleClose = () => {
    setName('');
    setRows([emptyRow()]);
    setThreshold('');
    setTarget('all');
    setMode(CHALLENGE_MODES.ONCE);
    setActionCost('0');
    setStartValue('');
    setMinVal('');
    setMaxVal('');
    setFailAt('');
    setDrain('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Skill Challenge" maxWidth="480px">
      <div className="sc-body">

        <div className="sc-row">
          <label htmlFor="sc-name">Challenge Name</label>
          <input
            id="sc-name"
            type="text"
            placeholder="e.g. Bolster the Ritual"
            aria-label="challenge name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="sc-skills-section">
          <span className="sc-skills-heading">Allowed Skills</span>
          {rows.map((row, idx) => (
            <div className="sc-skill-row" key={idx}>
              <select
                value={row.skill}
                onChange={(e) => updateRow(idx, { skill: e.target.value })}
                aria-label={`skill ${idx + 1}`}
              >
                {SKILL_KEYS.map((s) => (
                  <option key={s} value={s}>{skillLabel(s)}</option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                placeholder="DC"
                aria-label={`skill ${idx + 1} DC`}
                value={row.dc}
                onChange={(e) => updateRow(idx, { dc: e.target.value })}
              />
              <button
                type="button"
                className="sc-remove-btn"
                onClick={() => removeRow(idx)}
                disabled={rows.length === 1}
                aria-label={`Remove skill ${idx + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="sc-add-btn"
            onClick={addRow}
            aria-label="Add skill"
          >
            + Add skill
          </button>
        </div>

        <div className="sc-inline">
          <div className="sc-row sc-row--inline">
            <label htmlFor="sc-threshold">VP Threshold</label>
            <input
              id="sc-threshold"
              type="number"
              min="1"
              placeholder="e.g. 3"
              aria-label="victory point threshold"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </div>
          <div className="sc-row sc-row--inline">
            <label htmlFor="sc-target">Send To</label>
            <select
              id="sc-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label="target characters"
            >
              <option value="all">All Characters</option>
              {(characters || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="sc-inline">
          <div className="sc-row sc-row--inline">
            <label htmlFor="sc-mode">Attempts</label>
            <select
              id="sc-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              aria-label="challenge cadence"
            >
              <option value={CHALLENGE_MODES.ONCE}>One attempt</option>
              <option value={CHALLENGE_MODES.PER_ROUND}>Repeat each round</option>
            </select>
          </div>
          <div className="sc-row sc-row--inline">
            <label htmlFor="sc-cost">Action Cost</label>
            <select
              id="sc-cost"
              value={actionCost}
              onChange={(e) => setActionCost(e.target.value)}
              aria-label="action cost"
            >
              <option value="0">Free</option>
              <option value="1">1 action</option>
              <option value="2">2 actions</option>
              <option value="3">3 actions</option>
            </select>
          </div>
        </div>

        <div className="sc-skills-section">
          <span className="sc-skills-heading">Meter (optional)</span>
          <div className="sc-inline">
            <div className="sc-row sc-row--inline">
              <label htmlFor="sc-start">Start Value</label>
              <input
                id="sc-start"
                type="number"
                placeholder="e.g. 6"
                aria-label="start value"
                value={startValue}
                onChange={(e) => setStartValue(e.target.value)}
              />
            </div>
            <div className="sc-row sc-row--inline">
              <label htmlFor="sc-min">Min</label>
              <input
                id="sc-min"
                type="number"
                placeholder="—"
                aria-label="minimum pool"
                value={minVal}
                onChange={(e) => setMinVal(e.target.value)}
              />
            </div>
            <div className="sc-row sc-row--inline">
              <label htmlFor="sc-max">Max</label>
              <input
                id="sc-max"
                type="number"
                placeholder="—"
                aria-label="maximum pool"
                value={maxVal}
                onChange={(e) => setMaxVal(e.target.value)}
              />
            </div>
          </div>
          <div className="sc-inline">
            <div className="sc-row sc-row--inline">
              <label htmlFor="sc-failat">Fails At</label>
              <input
                id="sc-failat"
                type="number"
                placeholder="e.g. 0"
                aria-label="fails at"
                value={failAt}
                onChange={(e) => setFailAt(e.target.value)}
              />
            </div>
            <div className="sc-row sc-row--inline">
              <label htmlFor="sc-drain">Drain / Round</label>
              <input
                id="sc-drain"
                type="number"
                min="0"
                placeholder="0"
                aria-label="drain per round"
                value={drain}
                onChange={(e) => setDrain(e.target.value)}
              />
            </div>
          </div>
        </div>

        {activeCount > 0 && (
          <p className="sc-active-warning" role="note">
            {activeCount} track{activeCount === 1 ? '' : 's'} already running — sending adds another.
          </p>
        )}

        <button
          type="button"
          className="btn-primary sc-send-btn"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Start skill challenge"
        >
          Start Challenge
        </button>
      </div>
    </Modal>
  );
};

export default SkillChallengeModal;
