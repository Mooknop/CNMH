import React, { useState, useCallback } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import {
  normalizeChallenges,
  poolFor,
  isFailing,
  isInfluence,
  roundFor,
  CHALLENGE_MODES,
} from '../../utils/victoryPoints';
import ActionSymbol from '../shared/ActionSymbol';
import VpResultsCollector from '../shared/VpResultsCollector';
import './ObjectivesStrip.css';
import { APP, globalKey } from '../../sync/keys';

/**
 * Read-only objectives bar (#1472): one compact chip per active encounter
 * track so the whole party shares the scene's state — the stability meter
 * dropping is the motivation to peel off and Bolster. Influence chips show
 * the round only, never points: tier reveals stay GM-paced (#205).
 */
const ObjectivesStrip = () => {
  const { characters } = useContent();
  const [challengesRaw] = useSyncedState(globalKey(APP.VPCHALLENGE), null);
  const { encounter } = useEncounter();

  const [results, setResults] = useState({});
  const onResult = useCallback((charId, res) => {
    setResults((prev) => (prev[charId] === res ? prev : { ...prev, [charId]: res }));
  }, []);

  const challenges = normalizeChallenges(challengesRaw);
  const list = Object.values(challenges)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  if (!list.length) return null;

  const roster = Array.isArray(characters) ? characters : [];

  return (
    <div className="objectives-strip" role="region" aria-label="Encounter objectives">
      <VpResultsCollector characters={roster} onResult={onResult} />
      {list.map((c) => {
        if (isInfluence(c)) {
          const round = roundFor(c, encounter);
          return (
            <span className="objective-chip" key={c.id} aria-label={`${c.name} objective`}>
              <span className="objective-name">{c.name}</span>
              <span className="objective-state">
                Round {round}{c.roundsTotal > 0 ? ` / ${c.roundsTotal}` : ''}
              </span>
              {c.actionCost > 0 && <ActionSymbol cost={c.actionCost} />}
            </span>
          );
        }

        const targetValues = (c.targetIds || []).map((id) => results[id]);
        const pool = poolFor(c, targetValues);
        const failing = isFailing(c, pool);
        return (
          <span
            className="objective-chip"
            key={c.id}
            data-failing={failing || undefined}
            aria-label={`${c.name} objective`}
          >
            <span className="objective-name">{c.name}</span>
            <span className="objective-state">
              {pool}{c.threshold > 0 ? ` / ${c.threshold}` : ''} VP
            </span>
            {failing && <span className="objective-failing">FAILING</span>}
            {c.mode === CHALLENGE_MODES.PER_ROUND && (
              <span className="objective-dot" title="repeatable each round" aria-hidden="true">↻</span>
            )}
            {c.actionCost > 0 && <ActionSymbol cost={c.actionCost} />}
          </span>
        );
      })}
    </div>
  );
};

export default ObjectivesStrip;
