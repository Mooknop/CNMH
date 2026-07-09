import React, { useState, useEffect, useCallback } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useSession } from '../../contexts/SessionContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSessionLog } from '../../hooks/useSessionLog';
import { aggregateVp, skillLabel } from '../../utils/victoryPoints';
import './SkillChallengePanel.css';
import { APP, syncKey, globalKey } from '../../sync/keys';

const DEGREE_LABELS = {
  criticalSuccess: 'Critical Success',
  success:         'Success',
  failure:         'Failure',
  criticalFailure: 'Critical Failure',
};

// Hooks must be called at component top level — one ChallengeRow per
// target so each can subscribe to its own cnmh_vpresult key (same
// pattern as PartyMemberRow).
const ChallengeRow = ({ character, challengeId, onResult }) => {
  const [result] = useSyncedState(syncKey(APP.VPRESULT, character.id), null);

  useEffect(() => {
    onResult(character.id, result);
  }, [character.id, result, onResult]);

  const submitted = result && result.challengeId === challengeId;

  return (
    <li className="gm-vp-row" data-testid={`vp-row-${character.id}`}>
      <span className="gm-vp-name">{character.name}</span>
      {submitted ? (
        <>
          <span className="gm-vp-skill">{skillLabel(result.skill)}</span>
          <span className="gm-vp-roll">{result.total}</span>
          <span className="gm-vp-degree" data-degree={result.degree}>
            {DEGREE_LABELS[result.degree] ?? result.degree}
          </span>
          <span className="gm-vp-delta" aria-label={`vp-${character.id}`}>
            {result.vp >= 0 ? '+' : ''}{result.vp} VP
          </span>
        </>
      ) : (
        <span className="gm-vp-waiting">Waiting…</span>
      )}
    </li>
  );
};

/**
 * Live Victory Point challenge panel on the GM dashboard. Renders only
 * while cnmh_vpchallenge_global is set; aggregates per-character
 * cnmh_vpresult keys into the party VP pool.
 */
const SkillChallengePanel = () => {
  const { characters } = useContent();
  const { sendUpdate } = useSession();
  const { appendEvent } = useSessionLog();
  const [challenge, setChallenge] = useSyncedState(globalKey(APP.VPCHALLENGE), null);

  const [results, setResults] = useState({});
  const onResult = useCallback((charId, res) => {
    setResults((prev) => (prev[charId] === res ? prev : { ...prev, [charId]: res }));
  }, []);

  const challengeId = challenge?.id;
  useEffect(() => {
    setResults({});
  }, [challengeId]);

  if (!challenge) return null;

  const roster = Array.isArray(characters) ? characters : [];
  const targets = (challenge.targetIds || [])
    .map((id) => roster.find((c) => c.id === id))
    .filter(Boolean);

  const total = aggregateVp(Object.values(results), challenge.id);
  const pct = challenge.threshold > 0
    ? Math.max(0, Math.min(100, (total / challenge.threshold) * 100))
    : 0;
  const submittedCount = Object.values(results)
    .filter((r) => r && r.challengeId === challenge.id).length;

  const handleEnd = () => {
    appendEvent({
      type: 'challenge',
      text: `"${challenge.name}" ended — ${total}/${challenge.threshold} VP (${total >= challenge.threshold ? 'success' : 'incomplete'})`,
    });
    for (const id of challenge.targetIds || []) {
      sendUpdate(id, APP.SKILLPROMPT, null);
      sendUpdate(id, APP.VPRESULT, null);
    }
    setChallenge(null);
  };

  return (
    <section
      className="gm-dash-panel gm-vp-panel"
      aria-label="Skill Challenge"
      style={{ '--vp-pct': `${pct}%` }}
    >
      <div className="gm-vp-header">
        <h2>{challenge.name}</h2>
        <span className="gm-vp-total" data-met={total >= challenge.threshold}>
          {total} / {challenge.threshold} VP
        </span>
      </div>

      <div className="gm-vp-bar" aria-hidden="true">
        <div className="gm-vp-fill" />
      </div>

      <ul className="gm-vp-list" aria-label="challenge-submissions">
        {targets.map((c) => (
          <ChallengeRow
            key={c.id}
            character={c}
            challengeId={challenge.id}
            onResult={onResult}
          />
        ))}
      </ul>

      <div className="gm-vp-footer">
        <span className="gm-vp-count">{submittedCount}/{targets.length} submitted</span>
        <button
          type="button"
          className="gm-vp-end-btn"
          onClick={handleEnd}
          aria-label="End skill challenge"
        >
          End Challenge
        </button>
      </div>
    </section>
  );
};

export default SkillChallengePanel;
