// src/components/encounter/commandsheet/SelfStatusBar.jsx
// Self-status bar (#1502 S3) — DeckHeader's turn budget compressed into the
// slim always-on row at the very top of the encounter tab: monogram avatar,
// HP bar + "31/40 HP · AC 20" sub-label, the three diamond action pips, the
// reaction chip, the MAP chip, round + combat clock, and End Turn. On-turn
// pieces (pips / MAP / End Turn) hide off-turn — the reaction chip and vitals
// stay, since reactions are exactly what off-turn is about. During setup the
// budget slot shows the waiting line (InitiativeEntry owns the actual roll UI).
import React from 'react';
import { monogram, readHp } from './Dossier';
import { useEncounter } from '../../../hooks/useEncounter';
import { useTurnState, defaultTurnState } from '../../../hooks/useTurnState';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useEndTurn } from './useEndTurn';
import './SelfStatusBar.css';
import { APP, RELAY, globalKey, syncKey } from '../../../sync/keys';

const formatCombatTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const SelfStatusBar = ({ charId, character, model }) => {
  const { encounter } = useEncounter();
  const { turnState } = useTurnState(charId);
  const { endTurn, canSubmit, isMyTurn } = useEndTurn(charId, character?.name);
  const [combatSecs] = useSyncedState(globalKey(APP.COMBATSECS), 0);
  const [hpRaw] = useSyncedState(syncKey(RELAY.HP, charId || 'none'), null);

  if (!encounter || encounter.phase === 'idle') return null;
  const setup = encounter.phase === 'setup';
  if (!setup && encounter.phase !== 'in-progress') return null;

  const name = character?.name || '';
  const hp = readHp(hpRaw, model?.maxHp || null);
  const acValue = model?.armorClass?.value ?? model?.ac ?? null;
  const hpPct = hp.max > 0 && hp.current != null
    ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100))
    : null;
  const subParts = [
    hp.current != null ? `${hp.current}${hp.max > 0 ? `/${hp.max}` : ''} HP` : null,
    acValue != null ? `AC ${acValue}` : null,
  ].filter(Boolean);

  const { actionsSpent, reactionAvailable, reactionSpent, hasStartedFirstTurn } =
    turnState || defaultTurnState();
  const attacksMade = turnState?.attacksMade ?? 0;
  const mapPenalty = Math.min(attacksMade, 2) * 5;
  const actionsLeft = Math.max(0, 3 - actionsSpent);

  const reactionState = !hasStartedFirstTurn
    ? 'unavailable'
    : reactionSpent
    ? 'spent'
    : reactionAvailable
    ? 'available'
    : 'unavailable';
  const reactionLabels = {
    unavailable: 'Reaction (unavailable until your first turn)',
    available: 'Reaction (available)',
    spent: 'Reaction (spent)',
  };

  return (
    <div className="selfbar" role="region" aria-label="Self status">
      <span className="selfbar-avatar" aria-hidden="true">{monogram(name)}</span>
      <div className="selfbar-vitals">
        {hpPct != null && (
          <div className="selfbar-hp-track" aria-hidden="true">
            {/* --hp-pct: fill width as a CSS custom property (avoids inline width) */}
            <div className="selfbar-hp-fill" style={{ '--hp-pct': `${hpPct}%` }} />
          </div>
        )}
        {subParts.length > 0 && (
          <span className="selfbar-sub" aria-label={`${name} vitals`}>{subParts.join(' · ')}</span>
        )}
      </div>

      {setup ? (
        <span className="selfbar-setup">Waiting for initiative…</span>
      ) : (
        <>
          {isMyTurn && (
            <>
              <span
                className="selfbar-pips"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={3}
                aria-valuenow={actionsLeft}
                aria-label={`${actionsLeft} actions left`}
              >
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className={`selfbar-pip${n <= actionsLeft ? ' selfbar-pip--left' : ''}`}
                    aria-hidden="true"
                  />
                ))}
              </span>
              {actionsSpent > 3 && (
                <span className="selfbar-over" aria-label="Over action budget">
                  +{actionsSpent - 3}
                </span>
              )}
            </>
          )}
          <span
            className={`selfbar-reaction selfbar-reaction--${reactionState}`}
            title={reactionLabels[reactionState]}
            aria-label={reactionLabels[reactionState]}
          >
            ↩
          </span>
          {isMyTurn && attacksMade > 0 && (
            <span
              className="selfbar-map"
              title="Multiple Attack Penalty (−4/−8 with agile weapons)"
              aria-label={`Multiple Attack Penalty −${mapPenalty}`}
            >
              MAP −{mapPenalty}
            </span>
          )}
          <span className="selfbar-round">
            Round {encounter.round}
            {combatSecs > 0 && (
              <span className="selfbar-elapsed" aria-label={`${combatSecs} seconds elapsed`}>
                {' · '}{formatCombatTime(combatSecs)}
              </span>
            )}
          </span>
          {isMyTurn && (
            <button
              type="button"
              className="selfbar-end"
              onClick={endTurn}
              disabled={!canSubmit}
              aria-label="End turn"
            >
              End Turn
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default SelfStatusBar;
