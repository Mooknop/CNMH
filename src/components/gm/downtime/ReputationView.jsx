import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '../../../contexts/ContentContext';
import { useSessionLog } from '../../../hooks/useSessionLog';
import { saveDocument } from '../../../utils/gmApi';
import {
  rankFor,
  ladderBounds,
  stepReputation,
  rankChangeLogText,
} from '../../../utils/reputation';
import ReputationRadarChart from '../../shared/ReputationRadarChart';
import './DowntimeViews.css';

// Downtime dock — Reputation view (#1850; moved out of DockDowntimePane into
// its own view file by the #1853 redesign). One row per `reputation.Factions`
// entry (the `faction` collection) — the score lives on the doc itself, not a
// synced key.
//
// ALL REPUTATION MATH LIVES IN utils/reputation.js: rank lookup, ladder bounds,
// and the rose/fell phrasing. This component hands data to the util and writes
// back what comes out.
//
// RANK-CHANGE SIDE EFFECTS FIRE IN THE COMMIT HANDLER, NOT AN EFFECT. The
// handler compares the same before/after pair it just wrote via
// `rankChangeLogText` and appends the session-log line from there. A faction
// doc write fans out to every connected GM's ContentContext over its live-edit
// socket, so watching the refreshed value from a `useEffect` would double-fire:
// each open GM tab would append the same line off the same broadcast. (The
// reconciliation effect below is NOT one of these — it only clears local
// optimistic state once the live doc catches up; it never calls `saveDocument`
// or `appendEvent`, so it can't double-fire anything.)
//
// OPTIMISTIC + DEBOUNCED. A stepper tap updates local state immediately (so a
// burst of taps feels instant) and (re)schedules a single commit ~600ms after
// the LAST tap for that faction — clearing the previous timer on every tap is
// what collapses a whole burst into one `saveDocument` call/one DO archive
// version, and, since only one timer is ever live per faction, there is never a
// second, stale commit racing the latest tap burst. `prevRepRef` captures the
// pre-burst baseline (not re-read on every tap) so the rank-change log compares
// the value before the burst to the value the burst actually committed, not
// intermediate taps.
//
// WAVE-1 SCROLL EXCEPTION: the body still carries the pre-redesign row list and
// `.dock-dt-view-body--scroll`. The no-scroll re-layout (the two-column GMG
// ladder card grid, no radar) is #1855; the shell around this view is already
// no-scroll correct, so that slice replaces the body and nothing else.

const COMMIT_DEBOUNCE_MS = 600;

const ReputationView = () => {
  const { reputation, refresh } = useContent();
  const { appendEvent } = useSessionLog();

  // Collapsed-by-default mini radar, and the optimistic/debounced write
  // plumbing (see header note). `pendingRep` is the local override per faction
  // id while a burst is in flight or not yet reconciled with the live doc;
  // `timersRef` the in-flight debounce timeout per faction id; `prevRepRef` the
  // pre-burst baseline used for rank-change logging.
  const [radarOpen, setRadarOpen] = useState(false);
  const [pendingRep, setPendingRep] = useState({});
  const timersRef = useRef({});
  const prevRepRef = useRef({});

  const factions = useMemo(
    () => (Array.isArray(reputation?.Factions) ? reputation.Factions : []),
    [reputation]
  );

  // Clear any queued debounce timers on unmount — a stray tap must never fire
  // a commit after the view (or the whole dock) is gone. Switching views in the
  // rail unmounts this component, so this runs on every view change too.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  // Drop a faction's local optimistic override once the live doc (refreshed
  // after our own commit, or updated by another GM device/tab) actually
  // reflects it. Skips a faction with a burst still in flight (its timer is
  // still set) so a fresh tap never gets clobbered by a slow refresh landing
  // mid-burst. No saveDocument/appendEvent here — see header note.
  useEffect(() => {
    setPendingRep((cur) => {
      let changed = false;
      const next = { ...cur };
      factions.forEach((f) => {
        if (next[f.id] !== undefined && !timersRef.current[f.id] && next[f.id] === f.reputation) {
          delete next[f.id];
          changed = true;
        }
      });
      return changed ? next : cur;
    });
  }, [factions]);

  // The single write path: spread the FULL live faction doc (GmReputation's
  // contract) and change only `reputation`, then refresh so this client's own
  // ContentContext picks up the committed score. The rank-change log line is
  // computed from the SAME before/after pair the commit just wrote.
  const commitReputation = (faction, prevRep, nextRep) => {
    saveDocument('faction', faction.id, { ...faction, reputation: nextRep })
      .then(() => refresh())
      .catch(() => {});
    const text = rankChangeLogText(faction, prevRep, nextRep);
    if (text) appendEvent({ type: 'reputation', text });
  };

  // Optimistic tap + debounced commit (see header note). Re-arming the same
  // faction's timer on every tap — rather than letting an earlier one fire —
  // is what turns a whole burst into exactly one commit.
  const stepFaction = (faction, delta) => {
    const base =
      pendingRep[faction.id] ?? (typeof faction.reputation === 'number' ? faction.reputation : 0);
    const next = stepReputation(faction, base, delta);
    if (next === base) return; // clamped at the ladder's edge — nothing to do

    if (!timersRef.current[faction.id]) {
      // First tap of a fresh burst — remember the pre-burst value for the log.
      prevRepRef.current[faction.id] = base;
    }
    setPendingRep((cur) => ({ ...cur, [faction.id]: next }));

    clearTimeout(timersRef.current[faction.id]);
    timersRef.current[faction.id] = setTimeout(() => {
      delete timersRef.current[faction.id];
      commitReputation(faction, prevRepRef.current[faction.id], next);
    }, COMMIT_DEBOUNCE_MS);
  };

  return (
    <section className="dock-dt-view" aria-label="Reputation">
      <header className="dock-dt-head">
        <div className="dock-dt-title">
          <span className="dock-dt-kicker">Downtime</span>
          <h2 className="dock-dt-heading">Reputation</h2>
        </div>
        {factions.length > 0 && (
          <>
            <span className="dock-dt-count">
              {factions.length} faction{factions.length === 1 ? '' : 's'} · GMG ladder −50…50
            </span>
            <button
              type="button"
              className="dock-dt-btn dock-dt-rep-radar-toggle"
              aria-expanded={radarOpen}
              onClick={() => setRadarOpen((open) => !open)}
            >
              {radarOpen ? 'Hide radar' : 'Radar'}
            </button>
          </>
        )}
        <Link className="dock-dt-btn" to="/gm/world/reputation">
          Manage factions
        </Link>
      </header>

      <div className="dock-dt-view-body dock-dt-view-body--scroll">
        {!factions.length ? (
          <div className="dock-dt-note" role="status">
            <p>No factions yet.</p>
            <Link className="dock-dt-btn" to="/gm/world/reputation">
              Author factions in the Reputation editor
            </Link>
          </div>
        ) : (
          <>
            {radarOpen && (
              <div className="dock-dt-rep-radar" data-testid="dock-dt-rep-radar">
                <ReputationRadarChart factions={factions} compact />
              </div>
            )}
            <ul className="dock-dt-rep-list">
              {factions.map((faction) => {
                const rep =
                  pendingRep[faction.id] ??
                  (typeof faction.reputation === 'number' ? faction.reputation : 0);
                const rank = rankFor(faction, rep);
                const { min, max } = ladderBounds(faction);
                return (
                  <li
                    className="dock-dt-rep-row"
                    key={faction.id}
                    data-testid={`dock-dt-faction-${faction.id}`}
                  >
                    <div className="dock-dt-rep-head">
                      <span className="dock-dt-rep-name">{faction.name}</span>
                      <span className="dock-dt-rep-score">{rep}</span>
                      {rank && <span className="dock-dt-rep-rank">{rank.name}</span>}
                    </div>
                    {rank?.effect && (
                      <p className="dock-dt-rep-effect">{rank.effect}</p>
                    )}
                    <div className="dock-dt-rep-actions">
                      <button
                        type="button"
                        className="dock-dt-step"
                        aria-label={`Lower ${faction.name} reputation`}
                        disabled={rep <= min}
                        onClick={() => stepFaction(faction, -1)}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="dock-dt-step"
                        aria-label={`Raise ${faction.name} reputation`}
                        disabled={rep >= max}
                        onClick={() => stepFaction(faction, 1)}
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
};

export default ReputationView;
