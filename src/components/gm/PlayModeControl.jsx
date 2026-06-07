import React, { useContext, useEffect, useRef } from 'react';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useExplorationReady } from '../../hooks/useExplorationReady';
import { CharacterContext } from '../../contexts/CharacterContext';
import { useSession } from '../../contexts/SessionContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import DowntimeControl from './DowntimeControl';
import ExplorationTimeControl from './ExplorationTimeControl';
import GmIcon from '../../pages/gm/GmIcon';
import './PlayModeControl.css';

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
  const { allChosen } = useExplorationReady();
  const { characters } = useContext(CharacterContext) || {};
  const { sendUpdate, getState } = useSession();
  const { formatClockTime, formatGameDate, getCurrentWeekday } = useGameDate();

  // Campaign meta has no home in the content model, so the GM edits it inline
  // here, synced for every client. Party level is derived from the roster.
  const [campaign, setCampaign] = useSyncedState('cnmh_campaign_global', { location: '', treasure: '' });
  const location = campaign?.location ?? '';
  const treasure = campaign?.treasure ?? '';
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
      (characters || []).forEach((c) => sendUpdate(c.id, 'exploration', null));
    }
  }, [mode, characters, sendUpdate, setMoveOverride]);

  // Clear selected activities when entering Downtime so each period starts
  // with a clean slate. Ledger (accumulated progress) is preserved.
  const prevGmMode = useRef(gmMode);
  useEffect(() => {
    const was = prevGmMode.current;
    prevGmMode.current = gmMode;
    if (gmMode === 'downtime' && was !== 'downtime') {
      (characters || []).forEach((c) => {
        const dt = getState(c.id, 'downtime') || {};
        sendUpdate(c.id, 'downtime', { ...dt, selected: [] });
      });
    }
  }, [gmMode, characters, getState, sendUpdate]);

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
              onClick={() => setGmMode('exploration')}
              aria-pressed={!isEncounter && gmMode === 'exploration'}
              disabled={isEncounter}
            >
              <GmIcon name="map" className="pmc-pill-ico" />
              Exploration
            </button>
            <button
              type="button"
              className={`pmc-pill${!isEncounter && gmMode === 'downtime' ? ' pmc-pill--active' : ''}`}
              onClick={() => setGmMode('downtime')}
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
            <input
              className="pmc-meta-value pmc-meta-input"
              value={location}
              onChange={(e) => setCampaign({ ...(campaign || {}), location: e.target.value })}
              placeholder="—"
              aria-label="Campaign location"
            />
            <div className="pmc-meta-key">Location</div>
          </div>
          <div className="pmc-meta-stat">
            <div className="pmc-meta-value">{partyLevel != null ? `Lv ${partyLevel}` : '—'}</div>
            <div className="pmc-meta-key">Party</div>
          </div>
          <div className="pmc-meta-stat">
            <div className="pmc-meta-value pmc-meta-gold">
              <input
                className="pmc-meta-input pmc-meta-input--num"
                type="number"
                min="0"
                value={treasure}
                onChange={(e) => setCampaign({ ...(campaign || {}), treasure: e.target.value })}
                placeholder="0"
                aria-label="Party treasure in gold"
              />
              <span className="pmc-meta-gp">gp</span>
            </div>
            <div className="pmc-meta-key">Treasure</div>
          </div>
        </div>
      </section>

      {/* ── Context strip: mode-specific controls ────────────── */}
      {!isEncounter && (
        <section className="pmc-context" aria-label="Mode controls">
          {gmMode === 'downtime' && <DowntimeControl />}

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
