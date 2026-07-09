import React, { useContext, useEffect, useRef, useCallback } from 'react';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useExplorationReady } from '../../hooks/useExplorationReady';
import { useTake10 } from '../../hooks/useTake10';
import { resolveTake10 } from '../../utils/take10Resolve';
import { CharacterContext } from '../../contexts/CharacterContext';
import { useSession } from '../../contexts/SessionContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { toGameSeconds } from '../../utils/gameTime';
import { useSyncedState } from '../../hooks/useSyncedState';
import { usePartyGold } from '../../hooks/usePartyGold';
import { useLore } from '../../contexts/LoreContext';
import { useSessionLog } from '../../hooks/useSessionLog';
import DowntimeControl from './DowntimeControl';
import PartyDailyPrepButton from './PartyDailyPrepButton';
import ExplorationTimeControl from './ExplorationTimeControl';
import GmIcon from '../../pages/gm/GmIcon';
import './PlayModeControl.css';
import { APP, globalKey } from '../../sync/keys';

// GM play-mode area, split per the spec into two stacked sections:
//   1. Marquee  — mode pills (Exploration / Downtime / Encounter) + clock
//                 (time/date/weekday) + campaign meta (location, party level,
//                 treasure). Encounter is a status pill, never clickable —
//                 encounters are started in Foundry VTT.
//   2. Context  — the mode-specific controls (movement toggle + time advance
//                 for exploration; the downtime block/advance controls for
//                 downtime). Hidden during an encounter (the initiative panel
//                 owns that state).
// Also owns the exploration activity-ready override and the authoritative
// reset of party picks each time exploration is (re)entered.

const PlayModeControl = () => {
  const { mode, gmMode, setGmMode, moveEnabled, setMoveEnabled, setMoveOverride } = usePlayMode();
  const { appendEvent } = useSessionLog();
  const { openLore } = useLore();
  const { allChosen } = useExplorationReady();
  const {
    active: take10Active,
    allReady: take10AllReady,
    minutes: take10Minutes,
    openedAt: take10OpenedAt,
    readyCount: take10ReadyCount,
    ids: take10Ids,
    clear: clearTake10,
  } = useTake10();
  const { characters } = useContext(CharacterContext) || {};
  const { sendUpdate, getState } = useSession();
  const { formatClockTime, formatGameDate, getCurrentWeekday, advanceMinutes, gameDate, time } = useGameDate();

  // Campaign meta has no home in the content model, so the GM edits it inline
  // here, synced for every client. Party level is derived from the roster.
  const [campaign, setCampaign] = useSyncedState(globalKey(APP.CAMPAIGN), { location: '', locationLoreId: '' });
  const location = campaign?.location ?? '';
  const locationLoreId = campaign?.locationLoreId ?? '';
  const { total: partyGold } = usePartyGold(characters);
  const partyLevel = Array.isArray(characters) && characters.length
    ? Math.max(...characters.map((c) => c.level || 0))
    : null;
  const isEncounter = mode === 'encounter';

  // Authoritative reset: whenever exploration is (re)entered, clear every
  // party PC's pick and drop the override. This covers offline players' stale
  // picks; per-client tabs also clear their own pick for snappiness. Writing
  // null is idempotent, so the two paths race harmlessly. Seed prevMode with
  // the current mode so a mid-beat GM mount doesn't wipe live picks.
  const prevMode = useRef(mode);
  useEffect(() => {
    const was = prevMode.current;
    prevMode.current = mode;
    if (mode === 'exploration' && was !== 'exploration') {
      setMoveOverride(false);
      (characters || []).forEach((c) => sendUpdate(c.id, APP.EXPLORATION, null));
    }
  }, [mode, characters, sendUpdate, setMoveOverride]);

  // Take 10 resolution (#560/#562/#563): the GM client is the single writer of
  // the shared clock. Resolve each player's allocation (Refocus restores all
  // Focus Points; everything else is logged), advance time once by the block
  // length, and close the beat. clearTake10 flips active→false so the all-ready
  // effect can't re-fire. PlayModeControl is GM-only-mounted, so no player tab
  // races the writes. Reused by both the auto all-ready path and the GM
  // "Resolve now" override.
  const runTake10Resolution = useCallback(() => {
    // Item-effect durations run from when the block FINISHES, so stamp expiry
    // against block-end time (current clock + the advance we're about to apply).
    const blockEndSecs = toGameSeconds({ ...gameDate, ...time }) + take10Minutes * 60;
    resolveTake10({
      characters,
      openedAt: take10OpenedAt,
      nowSecs: blockEndSecs,
      getState,
      sendUpdate,
      appendLog: appendEvent,
    });
    advanceMinutes(take10Minutes);
    appendEvent({ type: 'time', text: `Take 10 — advanced ${take10Minutes} min` });
    clearTake10();
  }, [
    characters, take10OpenedAt, take10Minutes, gameDate, time,
    getState, sendUpdate, advanceMinutes, appendEvent, clearTake10,
  ]);

  // Auto-resolve the moment every party PC is ready.
  useEffect(() => {
    if (take10AllReady) runTake10Resolution();
  }, [take10AllReady, runTake10Resolution]);

  // GM "Cancel" — close the beat with no time advance. The beat stamp means
  // stale allocations auto-invalidate on the next start(), so no fan-out needed.
  const cancelTake10 = useCallback(() => {
    clearTake10();
    appendEvent({ type: 'activity', text: 'Take 10 cancelled' });
  }, [clearTake10, appendEvent]);

  // Encounter interrupt (#563): if combat starts mid-Take 10, cancel the beat so
  // it can't resurface stale when exploration resumes.
  useEffect(() => {
    if (isEncounter && take10Active) {
      clearTake10();
      appendEvent({ type: 'activity', text: 'Take 10 interrupted by encounter' });
    }
  }, [isEncounter, take10Active, clearTake10, appendEvent]);

  // Each downtime period starts with a clean slate of selected activities and
  // committed days. This is now handled declaratively: per-character downtime
  // state is stamped with the active block's startedAt and read through
  // periodState (see downtimeUtils), so state from a prior period reads as
  // empty without any GM-side fan-out write.

  return (
    <>
      {/* ── Marquee: pills + clock + campaign meta ───────────── */}
      <section className="pmc-marquee gm-bracketed" aria-label="Play mode">
        <div className="pmc-modes">
          <span className="pmc-label">Play Mode</span>
          <div className="pmc-pills" role="group" aria-label="Play mode">
            <button
              type="button"
              className={`pmc-pill${!isEncounter && gmMode === 'exploration' ? ' pmc-pill--active' : ''}`}
              onClick={() => { setGmMode('exploration'); appendEvent({ type: 'mode', text: 'Mode → Exploration' }); }}
              aria-pressed={!isEncounter && gmMode === 'exploration'}
              disabled={isEncounter}
            >
              <GmIcon name="map" className="pmc-pill-ico" />
              Exploration
            </button>
            <button
              type="button"
              className={`pmc-pill${!isEncounter && gmMode === 'downtime' ? ' pmc-pill--active' : ''}`}
              onClick={() => { setGmMode('downtime'); appendEvent({ type: 'mode', text: 'Mode → Downtime' }); }}
              aria-pressed={!isEncounter && gmMode === 'downtime'}
              disabled={isEncounter}
            >
              <GmIcon name="home" className="pmc-pill-ico" />
              Downtime
            </button>
            {/* Encounter is a status, never a control — set by Foundry VTT. */}
            <span
              className={`pmc-pill pmc-pill--locked${isEncounter ? ' pmc-pill--active' : ''}`}
              aria-current={isEncounter ? 'true' : undefined}
              title="Encounters are started in Foundry VTT"
            >
              <GmIcon name="sword" className="pmc-pill-ico" />
              Encounter
            </span>
          </div>
        </div>

        <div className="pmc-marquee-divider" aria-hidden="true" />

        <div className="pmc-clock">
          <span className="pmc-clock-time">{formatClockTime()}</span>
          <span className="pmc-clock-date">{formatGameDate()}</span>
          <span className="pmc-clock-weekday">{getCurrentWeekday()}</span>
        </div>

        <div className="pmc-marquee-spacer" />

        <div className="pmc-marquee-meta">
          <div className="pmc-meta-stat">
            <div className="pmc-meta-location-row">
              <input
                className="pmc-meta-value pmc-meta-input"
                value={location}
                onChange={(e) => setCampaign({ ...(campaign || {}), location: e.target.value, locationLoreId: '' })}
                placeholder="—"
                aria-label="Campaign location"
              />
              {locationLoreId && (
                <button
                  type="button"
                  className="pmc-lore-link"
                  onClick={() => openLore(locationLoreId)}
                  aria-label="View location lore"
                  title="View location lore"
                >
                  <GmIcon name="book" />
                </button>
              )}
            </div>
            <div className="pmc-meta-key">Location</div>
          </div>
          <div className="pmc-meta-stat">
            <div className="pmc-meta-value">{partyLevel != null ? `Lv ${partyLevel}` : '—'}</div>
            <div className="pmc-meta-key">Party</div>
          </div>
          <div className="pmc-meta-stat">
            <div className="pmc-meta-value pmc-meta-gold">
              {partyGold}
              <span className="pmc-meta-gp">gp</span>
            </div>
            <div className="pmc-meta-key">Treasure</div>
          </div>
        </div>
      </section>

      {/* ── Context strip: mode-specific controls ────────────── */}
      {!isEncounter && (
        <section className="pmc-context" aria-label="Mode controls">
          {gmMode === 'downtime' && (
            <>
              <DowntimeControl />
              <PartyDailyPrepButton />
            </>
          )}

          {gmMode === 'exploration' && (
            <>
              <div className="pmc-row pmc-row--toggle">
                <label className="pmc-toggle-label" htmlFor="pmc-move-toggle">
                  Allow token movement
                </label>
                <button
                  id="pmc-move-toggle"
                  type="button"
                  role="switch"
                  className={`pmc-switch${moveEnabled ? ' pmc-switch--on' : ''}`}
                  onClick={() => setMoveEnabled(!moveEnabled)}
                  aria-checked={moveEnabled}
                >
                  <span className="pmc-switch-knob" aria-hidden="true" />
                </button>
              </div>

              <ExplorationTimeControl />

              {take10Active && (
                <div className="pmc-row pmc-row--take10">
                  <span className="pmc-take10-readout">
                    Take 10 · {take10ReadyCount} / {take10Ids.length} ready
                  </span>
                  <div className="pmc-take10-actions">
                    <button
                      className="pmc-override-btn"
                      onClick={runTake10Resolution}
                      disabled={take10AllReady}
                      title={take10AllReady ? 'Resolving…' : 'Resolve and advance time now, even if not everyone is ready'}
                    >
                      Resolve now
                    </button>
                    <button className="pmc-take10-cancel" onClick={cancelTake10}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!allChosen && (
                <div className="pmc-row pmc-row--override">
                  <span className="pmc-override-hint">Waiting for the party to choose activities…</span>
                  <button className="pmc-override-btn" onClick={() => setMoveOverride(true)}>
                    Start movement
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
};

export default PlayModeControl;
