import React, { useState } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { useLocationSupport } from '../../hooks/useLocationSupport';
import { computeSaveDegree } from '../../utils/saveDegree';
import { taskDc, payoutCp, cpToGp } from '../../utils/earnIncome';
import { earnIncomeSkillOptions } from '../../utils/earnIncomeSkills';
import { pendingRollSlots, buildEarnIncomeResult } from '../../utils/earnIncomeResults';
import { getRollsForActivity, periodState } from '../../utils/downtimeUtils';
import {
  FREELANCE,
  FREELANCE_ID,
  EARN_INCOME_EMPLOYERS,
  employerById,
} from '../../data/earnIncomeEmployers';
import { DEGREE_LABELS } from '../../utils/degreeDisplay';
import './EarnIncomeResolver.css';
import { APP, syncKey, globalKey } from '../../sync/keys';

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
// player has committed at least one Earn Income day this period. The player
// picks *where* they worked — Freelance around town (always available) or a
// Sandpoint employer the party currently supports (#1152). The job sets the
// task level (its own level, or 4 for freelance) and unlocks that location's
// skills; a GM-assigned task level (cnmh_earnincometask_global) overrides the
// job's level when present. They then enter their raw d20 + total and submit a
// pending result for the GM to confirm — no gold is credited here.
const EarnIncomeResolver = ({ character }) => {
  const charId = character?.id || 'unknown';
  const charData = useCharacter(character);
  const { supported } = useLocationSupport();

  const [block] = useSyncedState(globalKey(APP.DOWNTIMEBLOCK), null);
  const [downtime] = useSyncedState(syncKey(APP.DOWNTIME, charId), null);
  const [taskMap] = useSyncedState(globalKey(APP.EARNINCOMETASK), null);
  const [results, setResults] = useSyncedState(globalKey(APP.DOWNTIMERESULTS), null);

  const [jobId, setJobId] = useState(FREELANCE_ID);
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

  // Employers the party currently supports, in data order, plus the always-on
  // freelance option at the top.
  const supportedEmployers = EARN_INCOME_EMPLOYERS.filter((e) => supported?.[e.id]);
  const job = employerById(jobId) || FREELANCE;

  // Task level: a GM override for this PC wins; otherwise the job's level.
  const gmOverride = taskMap?.[charId];
  const hasOverride = gmOverride != null;
  const taskLevel = hasOverride ? gmOverride : job.level;
  const dc = taskDc(taskLevel);

  const options = earnIncomeSkillOptions(charData, job);
  const selected = options.find((o) => o.key === skillKey) || null;

  // A location circumstance/item bonus covering the selected skill (reminder
  // only — the player still enters their own total).
  const bonus =
    job.bonus && selected && job.bonus.skills.includes(selected.key) ? job.bonus : null;

  // Risk note: always shown for an employer that carries one; for freelance the
  // note is about Thievery, so only surface it when Thievery is the pick.
  const riskNote =
    job.risk && (job.id !== FREELANCE_ID || selected?.key === 'thievery') ? job.risk : null;

  const d20Num = parseInt(d20, 10);
  const totalNum = parseInt(total, 10);
  const d20Valid = d20Num >= 1 && d20Num <= 20;
  const totalValid = Number.isFinite(totalNum);
  const canResolve = selected && d20Valid && totalValid;

  const degree = canResolve ? computeSaveDegree({ d20: d20Num, total: totalNum, dc }) : null;
  const cp = canResolve
    ? payoutCp({ taskLevel, rank: selected.rank, degree })
    : null;

  const changeJob = (nextId) => {
    setJobId(nextId);
    setSkillKey(''); // the skill list depends on the job
  };

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
      locationId: job.id === FREELANCE_ID ? null : job.id,
      locationName: job.id === FREELANCE_ID ? null : job.name,
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
        <span className="eir-task">
          Level {taskLevel} · DC {dc}
          {hasOverride && <span className="eir-override"> · GM-set</span>}
        </span>
      </div>
      <p className="eir-sub">
        {pending} unresolved roll{pending === 1 ? '' : 's'} — resolve each day you worked.
      </p>

      <label className="eir-field">
        Working at
        <select
          className="eir-select"
          value={jobId}
          onChange={(e) => changeJob(e.target.value)}
          aria-label="Earn Income location"
        >
          <option value={FREELANCE_ID}>Freelance around Sandpoint (L4)</option>
          {supportedEmployers.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} (L{e.level})
            </option>
          ))}
        </select>
      </label>
      {supportedEmployers.length === 0 && (
        <p className="eir-hint">
          No employers support the party yet — freelancing around town. The GM grants
          location support in GM Tools.
        </p>
      )}

      {options.length === 0 ? (
        <p className="eir-hint">
          No skill you&rsquo;re trained in qualifies for this job.
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

          {bonus && (
            <p className="eir-bonus" role="note">
              +{bonus.value} {bonus.type} bonus here — remember to include it in your total.
              {bonus.note ? ` (${bonus.note})` : ''}
            </p>
          )}
          {riskNote && (
            <p className="eir-risk" role="note">{riskNote}</p>
          )}

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
              <span className="eir-degree">{DEGREE_LABELS[degree]}</span>
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
