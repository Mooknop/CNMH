import React, { useState, useEffect, useCallback } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSessionLog } from '../../hooks/useSessionLog';
import {
  aggregateVp,
  charVp,
  entriesFor,
  skillLabel,
  normalizeChallenges,
  CHALLENGE_MODES,
} from '../../utils/victoryPoints';
import { DEGREE_LABELS } from '../../utils/degreeDisplay';
import ActionSymbol from '../shared/ActionSymbol';
import './SkillChallengePanel.css';
import { APP, syncKey, globalKey } from '../../sync/keys';

// Hooks must be called at component top level — one subscriber per roster
// character so each can watch its own cnmh_vpresult key (same pattern as
// PartyMemberRow); the panel folds the values into per-track cards.
const CharResults = ({ character, onResult }) => {
  const [result] = useSyncedState(syncKey(APP.VPRESULT, character.id), null);

  useEffect(() => {
    onResult(character.id, result);
  }, [character.id, result, onResult]);

  return null;
};

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

const TrackCard = ({ challenge, roster, results, round, onEnd }) => {
  const targets = (challenge.targetIds || [])
    .map((id) => roster.find((c) => c.id === id))
    .filter(Boolean);

  const perRound = challenge.mode === CHALLENGE_MODES.PER_ROUND;
  const total = aggregateVp(
    targets.map((c) => results[c.id]),
    challenge.id
  );
  const pct = challenge.threshold > 0
    ? Math.max(0, Math.min(100, (total / challenge.threshold) * 100))
    : 0;
  const submittedCount = targets.filter((c) => {
    const entries = entriesFor(results[c.id], challenge.id);
    return perRound ? entries.some((e) => e.round === round) : entries.length > 0;
  }).length;

  return (
    <section
      className="gm-dash-panel gm-vp-panel"
      aria-label={`Skill Challenge: ${challenge.name}`}
      data-testid={`vp-track-${challenge.id}`}
      style={{ '--vp-pct': `${pct}%` }}
    >
      <div className="gm-vp-header">
        <h2>{challenge.name}</h2>
        <span className="gm-vp-badges">
          {perRound && <span className="gm-vp-mode-chip">each round</span>}
          {challenge.actionCost > 0 && <ActionSymbol cost={challenge.actionCost} />}
        </span>
        <span className="gm-vp-total" data-met={total >= challenge.threshold}>
          {total} / {challenge.threshold} VP
        </span>
      </div>

      <div className="gm-vp-bar" aria-hidden="true">
        <div className="gm-vp-fill" />
      </div>

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

      <div className="gm-vp-footer">
        <span className="gm-vp-count">
          {submittedCount}/{targets.length} submitted{perRound ? ' this round' : ''}
        </span>
        <button
          type="button"
          className="gm-vp-end-btn"
          onClick={() => onEnd(challenge, total)}
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

  const challenges = normalizeChallenges(challengesRaw);
  const list = Object.values(challenges)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  if (!list.length) return null;

  const roster = Array.isArray(characters) ? characters : [];
  const round = encounter?.active ? (encounter.round ?? 0) : 0;

  const handleEnd = (challenge, total) => {
    appendEvent({
      type: 'challenge',
      text: `"${challenge.name}" ended — ${total}/${challenge.threshold} VP (${total >= challenge.threshold ? 'success' : 'incomplete'})`,
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
      {roster.map((c) => (
        <CharResults key={c.id} character={c} onResult={onResult} />
      ))}
      {list.map((challenge) => (
        <TrackCard
          key={challenge.id}
          challenge={challenge}
          roster={roster}
          results={results}
          round={round}
          onEnd={handleEnd}
        />
      ))}
    </>
  );
};

export default SkillChallengePanel;
