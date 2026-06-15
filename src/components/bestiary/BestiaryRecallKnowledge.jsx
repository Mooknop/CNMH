import React, { useEffect, useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useRecallKnowledge } from '../../hooks/useRecallKnowledge';
import { totalDaysSince4700 } from '../../utils/gameTime';
import { rkKeyFor, isDayLockedFor } from '../../utils/recallKnowledge';
import RecallKnowledgeResolver from '../encounter/RecallKnowledgeResolver';
import './BestiaryRecallKnowledge.css';

// Out-of-combat Recall Knowledge for the /bestiary browser (#396). In combat the
// acting character is the turn owner; out of combat the player must pick which PC
// is studying the creature (the app has no per-player identity). Reveals are
// written through the same creatureKey-keyed record as the in-combat modal, so
// identifying a creature here unlocks it everywhere.
const BestiaryRecallKnowledge = ({ enemy }) => {
  const { characters } = useContent();
  const { gameDate } = useGameDate();
  const { recordFor } = useRecallKnowledge();
  const party = useMemo(() => (characters || []).filter(Boolean), [characters]);

  const [actingCharId, setActingCharId] = useState(party[0]?.id ?? null);
  const [open, setOpen] = useState(false);

  // Keep the selection valid as the party list loads / changes.
  useEffect(() => {
    if (!party.some((c) => c.id === actingCharId)) {
      setActingCharId(party[0]?.id ?? null);
    }
  }, [party, actingCharId]);

  if (party.length === 0) return null;

  const actingChar = party.find((c) => c.id === actingCharId) || null;

  // Day-based crit-fail lockout (#396): a PC who critically failed today can't
  // retry this creature until the in-game date advances.
  const currentDay = totalDaysSince4700(gameDate);
  const record = recordFor(rkKeyFor(enemy));
  const locked = actingCharId ? isDayLockedFor(record, actingCharId, currentDay) : false;

  return (
    <div className="bestiary-rk" data-testid="bestiary-rk">
      {open ? (
        <RecallKnowledgeResolver
          enemy={enemy}
          actingCharId={actingCharId}
          actingCharName={actingChar?.name || ''}
          outOfCombat
          currentDay={currentDay}
          onDone={() => setOpen(false)}
        />
      ) : (
        <>
          <div className="bestiary-rk-trigger">
            <label className="bestiary-rk-char">
              <span className="bestiary-rk-char-label">Recall as</span>
              <select
                className="bestiary-rk-select"
                value={actingCharId ?? ''}
                onChange={(e) => setActingCharId(e.target.value)}
                aria-label="Acting character"
              >
                {party.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-secondary bestiary-rk-btn"
              onClick={() => setOpen(true)}
              disabled={locked}
              aria-label="Recall Knowledge"
            >
              Recall Knowledge
            </button>
          </div>
          {locked && (
            <p className="bestiary-rk-locked" data-testid="bestiary-rk-locked">
              {actingChar?.name || 'This character'} failed to recall anything about this creature
              today — try again tomorrow.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default BestiaryRecallKnowledge;
