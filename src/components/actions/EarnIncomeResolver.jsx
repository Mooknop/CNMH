import React, { useState } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { computeSaveDegree } from '../../utils/saveDegree';
import { taskDc, payoutCp, cpToGp } from '../../utils/earnIncome';
import { earnIncomeSkillOptions } from '../../utils/earnIncomeSkills';
import { pendingRollSlots, buildEarnIncomeResult } from '../../utils/earnIncomeResults';
import { getRollsForActivity, periodState } from '../../utils/downtimeUtils';
import './EarnIncomeResolver.css';

const DEGREE_LABEL = {
  criticalSuccess: 'Critical Success',
  success: 'Success',
  failure: 'Failure',
  criticalFailure: 'Critical Failure',
};

const RANK_LABEL = { 0: 'Untrained', 1: 'Trained', 2: 'Expert', 3: 'Master', 4: 'Legendary' };

// Formats a copper amount as the largest sensible coin string (e.g. 300 → "3 gp",
// 250 → "2 gp 5 sp", 5 → "5 cp"). Display only — credit math uses cpToGp.
const formatCp = (cp) => {
  if (!cp) return '0 cp';
  const gp = Math.floor(cp / 100);
  const sp = Math.floor((cp % 100) / 10);
  const c = cp % 10;
  return [gp && `${gp} gp`, sp && `${sp} sp`, c && `${c} cp`].filter(Boolean).join(' ');
};

// Player-facing Earn Income resolution. Appears in the Downtime tab once the
// player has committed at least one Earn Income day this period and the GM has
// assigned them a task level. The player picks the skill (which selects the
// payout column), enters their raw d20 + total, and submits a pending result
// for the GM to confirm — no gold is credited here (Slice 3 does that).
const EarnIncomeResolver = ({ character }) => {
  const charId = character?.id || 'unknown';
  const charData = useCharacter(character);

  const [block] = useSyncedState('cnmh_downtimeblock_global', null);
  const [downtime] = useSyncedState(`cnmh_downtime_${charId}`, null);
  const [taskMap] = useSyncedState('cnmh_earnincometask_global', null);
  const [results, setResults] = useSyncedState('cnmh_downtimeresults_global', null);

  const [skillKey, setSkillKey] = useState('');
  const [d20, setD20] = useState('');
  const [total, setTotal] = useState('');

  const startedAt = block?.startedAt;
  const { ledger } = periodState(downtime, startedAt);
  const committedRolls = getRollsForActivity(ledger, 'Earn Income');

  if (!block?.active || committedRolls === 0) return null;

  const pending = pendingRollSlots({
    results: results?.entries,
    charId,
    startedAt,
    committedRolls,
  });
  if (pending === 0) return null;

  const taskLevel = taskMap?.[charId];
  if (taskLevel == null) {
    return (
      <div className="eir-wrap">
        <span className="eir-title">Earn Income</span>
        <p className="eir-hint">
          Waiting on the GM to assign you a task level for this job.
        </p>
      </div>
    );
  }

  const dc = taskDc(taskLevel);
  const options = earnIncomeSkillOptions(charData);
  const selected = options.find((o) => o.key === skillKey) || null;

  const d20Num = parseInt(d20, 10);
  const totalNum = parseInt(total, 10);
  const d20Valid = d20Num >= 1 && d20Num <= 20;
  const totalValid = Number.isFinite(totalNum);
  const canResolve = selected && d20Valid && totalValid;

  const degree = canResolve ? computeSaveDegree({ d20: d20Num, total: totalNum, dc }) : null;
  const cp = canResolve
    ? payoutCp({ taskLevel, rank: selected.rank, degree })
    : null;

  const submit = () => {
    if (!canResolve) return;
    const entry = buildEarnIncomeResult({
      charId,
      charName: character?.name,
      taskLevel,
      dc,
      skillKey: selected.key,
      skillLabel: selected.label,
      rank: selected.rank,
      d20: d20Num,
      total: totalNum,
      degree,
      payoutCp: cp,
      startedAt,
    });
    setResults((prev) => ({ entries: [...(prev?.entries || []), entry] }));
    setSkillKey('');
    setD20('');
    setTotal('');
  };

  return (
    <div className="eir-wrap">
      <div className="eir-header">
        <span className="eir-title">Earn Income</span>
        <span className="eir-task">Level {taskLevel} · DC {dc}</span>
      </div>
      <p className="eir-sub">
        {pending} unresolved roll{pending === 1 ? '' : 's'} — resolve each day you worked.
      </p>

      {options.length === 0 ? (
        <p className="eir-hint">
          No skill you&rsquo;re trained in qualifies for Earn Income.
        </p>
      ) : (
        <>
          <label className="eir-field">
            Skill
            <select
              className="eir-select"
              value={skillKey}
              onChange={(e) => setSkillKey(e.target.value)}
              aria-label="Earn Income skill"
            >
              <option value="">— select skill —</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} ({RANK_LABEL[o.rank]}{o.viaFeat ? ` · ${o.viaFeat}` : ''})
                </option>
              ))}
            </select>
          </label>

          <div className="eir-roll-row">
            <label className="eir-field eir-field--narrow">
              d20
              <input
                type="number"
                className="eir-input"
                min={1}
                max={20}
                value={d20}
                onChange={(e) => setD20(e.target.value)}
                placeholder="—"
                aria-label="Raw d20 die"
              />
            </label>
            <label className="eir-field eir-field--narrow">
              Total
              <input
                type="number"
                className="eir-input"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="—"
                aria-label="Check total"
              />
            </label>
          </div>

          {canResolve && (
            <div className={`eir-preview eir-preview--${degree}`} role="status">
              <span className="eir-degree">{DEGREE_LABEL[degree]}</span>
              <span className="eir-payout">
                {degree === 'criticalFailure'
                  ? 'No income'
                  : `${formatCp(cp)} (${cpToGp(cp)} gp)`}
              </span>
              {selected.rank === 0 && degree !== 'failure' && degree !== 'criticalFailure' && (
                <span className="eir-note">Untrained — earns the failed amount.</span>
              )}
            </div>
          )}

          <button
            className="eir-submit-btn"
            onClick={submit}
            disabled={!canResolve}
          >
            Submit for GM
          </button>
        </>
      )}
    </div>
  );
};

export default EarnIncomeResolver;
