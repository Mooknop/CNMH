import React, { useState, useEffect, useCallback } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSessionLog } from '../../hooks/useSessionLog';
import {
  aggregateVp,
  charVp,
  entriesFor,
  poolFor,
  isFailing,
  applyPoolDelta,
  skillLabel,
  normalizeChallenges,
  CHALLENGE_MODES,
} from '../../utils/victoryPoints';
import { DEGREE_LABELS } from '../../utils/degreeDisplay';
import ActionSymbol from '../shared/ActionSymbol';
import VpResultsCollector from '../shared/VpResultsCollector';
import './SkillChallengePanel.css';
import { APP, globalKey } from '../../sync/keys';

const TrackRow = ({ character, challenge, resultValue, round }) => {
  const entries = entriesFor(resultValue, challenge.id);
  const perRound = challenge.mode === CHALLENGE_MODES.PER_ROUND;
  const shown = perRound
    ? entries.find((e) => e.round === round)
    : entries[entries.length - 1];
  const total = charVp(resultValue, challenge.id);

  return (
    <li className="gm-vp-row" data-testid={`vp-row-${challenge.id}-${character.id}`}>
      <span className="gm-vp-name">{character.name}</span>
      {shown ? (
        <>
          <span className="gm-vp-skill">{skillLabel(shown.skill)}</span>
          <span className="gm-vp-roll">{shown.total}</span>
          <span className="gm-vp-degree" data-degree={shown.degree}>
            {DEGREE_LABELS[shown.degree] ?? shown.degree}
          </span>
          <span className="gm-vp-delta" aria-label={`vp-${challenge.id}-${character.id}`}>
            {shown.vp >= 0 ? '+' : ''}{shown.vp} VP
          </span>
        </>
      ) : (
        <span className="gm-vp-waiting">Waiting…</span>
      )}
      {perRound && entries.length > 0 && (
        <span className="gm-vp-char-total" aria-label={`total-${challenge.id}-${character.id}`}>
          Σ {total >= 0 ? '+' : ''}{total}
        </span>
      )}
    </li>
  );
};

const TrackCard = ({ challenge, roster, results, round, onEnd, onNudge, onDrainChange }) => {
  const targets = (challenge.targetIds || [])
    .map((id) => roster.find((c) => c.id === id))
    .filter(Boolean);

  const perRound = challenge.mode === CHALLENGE_MODES.PER_ROUND;
  const targetValues = targets.map((c) => results[c.id]);
  const vpSum = aggregateVp(targetValues, challenge.id);
  const pool = poolFor(challenge, targetValues);
  const failing = isFailing(challenge, pool);
  const hasThreshold = challenge.threshold > 0;

  // Bar scale: threshold when there is a success line, else the meter's
  // [min, max] span, else no bar (pure unbounded tally).
  const minOr0 = typeof challenge.min === 'number' ? challenge.min : 0;
  const pct = hasThreshold
    ? (pool / challenge.threshold) * 100
    : typeof challenge.max === 'number' && challenge.max > minOr0
      ? ((pool - minOr0) / (challenge.max - minOr0)) * 100
      : null;
  const barPct = pct === null ? null : Math.max(0, Math.min(100, pct));

  const submittedCount = targets.filter((c) => {
    const entries = entriesFor(results[c.id], challenge.id);
    return perRound ? entries.some((e) => e.round === round) : entries.length > 0;
  }).length;

  return (
    <section
      className="gm-dash-panel gm-vp-panel"
      aria-label={`Skill Challenge: ${challenge.name}`}
      data-testid={`vp-track-${challenge.id}`}
      data-failing={failing || undefined}
      style={{ '--vp-pct': `${barPct ?? 0}%` }}
    >
      <div className="gm-vp-header">
        <h2>{challenge.name}</h2>
        <span className="gm-vp-badges">
          {failing && <span className="gm-vp-failing">FAILING</span>}
          {perRound && <span className="gm-vp-mode-chip">each round</span>}
          {challenge.actionCost > 0 && <ActionSymbol cost={challenge.actionCost} />}
        </span>
        <span className="gm-vp-total" data-met={hasThreshold && pool >= challenge.threshold}>
          {pool}{hasThreshold ? ` / ${challenge.threshold}` : ''} VP
        </span>
      </div>

      {barPct !== null && (
        <div className="gm-vp-bar" aria-hidden="true">
          <div className="gm-vp-fill" />
        </div>
      )}

      <ul className="gm-vp-list" aria-label={`${challenge.name} submissions`}>
        {targets.map((c) => (
          <TrackRow
            key={c.id}
            character={c}
            challenge={challenge}
            resultValue={results[c.id]}
            round={round}
          />
        ))}
      </ul>

      <div className="gm-vp-controls">
        <div className="gm-vp-nudges">
          <button
            type="button"
            className="gm-vp-nudge-btn"
            onClick={() => onNudge(challenge, -1, vpSum)}
            aria-label={`Nudge ${challenge.name} down`}
          >
            −1
          </button>
          <button
            type="button"
            className="gm-vp-nudge-btn"
            onClick={() => onNudge(challenge, +1, vpSum)}
            aria-label={`Nudge ${challenge.name} up`}
          >
            +1
          </button>
        </div>
        <label className="gm-vp-drain">
          Drain/round
          <input
            type="number"
            min="0"
            value={challenge.drainPerRound ?? 0}
            onChange={(e) => onDrainChange(challenge, e.target.value)}
            aria-label={`${challenge.name} drain per round`}
          />
        </label>
      </div>

      <div className="gm-vp-footer">
        <span className="gm-vp-count">
          {submittedCount}/{targets.length} submitted{perRound ? ' this round' : ''}
        </span>
        <button
          type="button"
          className="gm-vp-end-btn"
          onClick={() => onEnd(challenge, pool, failing)}
          aria-label={`End ${challenge.name}`}
        >
          End Challenge
        </button>
      </div>
    </section>
  );
};

/**
 * Live Victory Point challenge panel on the GM dashboard — one card per
 * active track in cnmh_vpchallenge_global (#1470). Renders nothing while
 * the collection is empty. Ending a track only removes it from the
 * collection; players self-clean their own cnmh_vpresult entries when they
 * see the track is gone (single-writer keys, no cross-client races).
 *
 * Meter tracks (#1471): the GM client is the single writer of `adjust` —
 * ±1 nudge buttons, a live drain-per-round input, and an automatic drain
 * applied here when the encounter round advances (lastDrainRound stamps
 * make the sweep idempotent across remounts).
 */
const SkillChallengePanel = () => {
  const { characters } = useContent();
  const { encounter } = useEncounter();
  const { appendEvent } = useSessionLog();
  const [challengesRaw, setChallenges] = useSyncedState(globalKey(APP.VPCHALLENGE), null);

  const [results, setResults] = useState({});
  const onResult = useCallback((charId, res) => {
    setResults((prev) => (prev[charId] === res ? prev : { ...prev, [charId]: res }));
  }, []);

  const roundActive = encounter?.active ? (encounter.round ?? 0) : null;

  // Per-round drain sweep. Reads the rendered value and is a strict no-op
  // unless a drain is actually due, so it cannot loop; lastDrainRound
  // persists on the doc, so a remounted panel never re-applies a round.
  useEffect(() => {
    if (roundActive === null) return;
    const map = normalizeChallenges(challengesRaw);
    const updates = {};
    const logs = [];
    for (const c of Object.values(map)) {
      if (!(c.drainPerRound > 0)) continue;
      if (c.lastDrainRound == null || c.lastDrainRound > roundActive) {
        // First sighting this encounter — arm without draining.
        updates[c.id] = { ...c, lastDrainRound: roundActive };
      } else if (roundActive > c.lastDrainRound) {
        const steps = roundActive - c.lastDrainRound;
        const vpSum = aggregateVp((c.targetIds || []).map((id) => results[id]), c.id);
        const { adjust, pool, applied } = applyPoolDelta(c, vpSum, -c.drainPerRound * steps);
        updates[c.id] = { ...c, adjust, lastDrainRound: roundActive };
        if (applied !== 0) {
          logs.push(`"${c.name}" drains ${-applied} → ${pool}${c.threshold > 0 ? `/${c.threshold}` : ''} VP`);
        }
      }
    }
    if (!Object.keys(updates).length) return;
    setChallenges((cur) => ({ ...normalizeChallenges(cur), ...updates }));
    for (const text of logs) appendEvent({ type: 'challenge', text });
  }, [roundActive, challengesRaw, results, setChallenges, appendEvent]);

  const challenges = normalizeChallenges(challengesRaw);
  const list = Object.values(challenges)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  if (!list.length) return null;

  const roster = Array.isArray(characters) ? characters : [];
  const round = roundActive ?? 0;

  const patchChallenge = (id, patch) =>
    setChallenges((cur) => {
      const map = normalizeChallenges(cur);
      if (!map[id]) return cur;
      return { ...map, [id]: { ...map[id], ...patch } };
    });

  const handleNudge = (challenge, delta, vpSum) => {
    const { adjust, pool, applied } = applyPoolDelta(challenge, vpSum, delta);
    if (applied === 0) return;
    patchChallenge(challenge.id, { adjust });
    appendEvent({
      type: 'challenge',
      text: `"${challenge.name}" nudged ${applied > 0 ? '+' : ''}${applied} → ${pool}${challenge.threshold > 0 ? `/${challenge.threshold}` : ''} VP`,
    });
  };

  // Changing the drain re-arms lastDrainRound so a re-enabled drain never
  // back-charges rounds that passed while it was off.
  const handleDrainChange = (challenge, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0);
    patchChallenge(challenge.id, { drainPerRound: n, lastDrainRound: roundActive });
  };

  const handleEnd = (challenge, pool, failing) => {
    const hasThreshold = challenge.threshold > 0;
    const outcome = hasThreshold
      ? (pool >= challenge.threshold ? 'success' : 'incomplete')
      : (failing ? 'failed' : 'held');
    appendEvent({
      type: 'challenge',
      text: `"${challenge.name}" ended — ${pool}${hasThreshold ? `/${challenge.threshold}` : ''} VP (${outcome})`,
    });
    setChallenges((cur) => {
      const map = normalizeChallenges(cur);
      if (!map[challenge.id]) return cur;
      const next = { ...map };
      delete next[challenge.id];
      return Object.keys(next).length ? next : null;
    });
  };

  return (
    <>
      <VpResultsCollector characters={roster} onResult={onResult} />
      {list.map((challenge) => (
        <TrackCard
          key={challenge.id}
          challenge={challenge}
          roster={roster}
          results={results}
          round={round}
          onEnd={handleEnd}
          onNudge={handleNudge}
          onDrainChange={handleDrainChange}
        />
      ))}
    </>
  );
};

export default SkillChallengePanel;
