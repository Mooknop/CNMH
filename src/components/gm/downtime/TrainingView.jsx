import React, { useEffect, useRef, useState } from 'react';
import { useContent } from '../../../contexts/ContentContext';
import { useSession } from '../../../contexts/SessionContext';
import { useEncounter } from '../../../hooks/useEncounter';
import { usePartyActivity } from '../../../hooks/usePartyActivity';
import { buildTrainedEntry, grantTrainedAbility } from '../../../utils/applyTraining';
import { buildTrainingResult } from '../../../utils/earnIncomeResults';
import { saveDocument } from '../../../utils/gmApi';
import {
  TRAINING_VENDORS,
  trainingVendorById,
  trackOffering,
  trackLabel,
  buildGrant,
} from '../../../data/trainingVendors';
import { APP } from '../../../sync/keys';
import { FX_FLASH_MS } from '../../../hooks/useValueFlash';
import './DowntimeViews.css';

// Downtime dock — Training board view (#1853 wave 2, #1858). Re-houses
// PartyTrainingBoard as a two-column card grid, one card per PC with an
// in-progress track, and adds the two GM mutations the read-only board never
// had: banking hours directly (no allocator round-trip) and confirming a
// completed track on the spot.
//
// Training tracks are NOT period-scoped (they persist across downtime
// blocks — see cnmh_training_<charId> in TrainingProjects.jsx), so this view
// shows standing state independent of the active block, exactly like
// PartyTrainingBoard (which stays put, unchanged, on the GM console).
//
// ── +8 h ─────────────────────────────────────────────────────────────────
// Read-modify-write straight to the target PC's cnmh_training_<charId> doc via
// getState/sendUpdate (per useGiveItem's canonical pattern) — the GM dock
// can't call a per-character hook for an arbitrary roster PC. `force: true` is
// required: 'training' is a per-character resource key, not in
// SANDBOX_WRITABLE_TYPES, so an offline-sandbox freeze would otherwise drop
// the write silently (see SessionContext.isSandboxWritable). Hours are never
// clamped to the benchmark — a track can sit "over" until confirmed.
//
// A card's footer has exactly ONE +8 h button regardless of how many tracks
// the PC has in progress; it applies to the first INCOMPLETE track (ready
// tracks are skipped — they want confirming, not more hours). If every track
// on the card is already ready, +8 h is a no-op.
//
// ── Confirm completion ──────────────────────────────────────────────────
// Locked decision (#1858): DIRECT GRANT, skipping the results queue entirely
// — unlike the player-submitted flow (TrainingProjects.jsx → cnmh_downtimeresults_global
// → DowntimeResultsApproval), which stays untouched and still works for
// tracks a player's own client happens to carry past the benchmark. This
// button exists for the far more common case: hours were banked from THIS
// dock (or the party's device was never open when a track crossed over), so
// nothing is sitting in the queue to approve.
//
// For every ready track on the card, an entry is built the same shape
// TrainingProjects.jsx hands to the queue (buildTrainingResult) and granted
// via applyTraining's grantTrainedAbility — the exact function + arg shape
// DowntimeResultsApproval.confirm uses for a training entry, so both paths
// write the identical trained[] shape. When a card has MULTIPLE ready tracks,
// they're granted sequentially against a locally-threaded rawCharacters
// snapshot (each grant's trained[] entry folded in before the next reads it)
// rather than each call trusting the still-stale ContentContext value — two
// grantTrainedAbility calls made from the same closure would otherwise race:
// the second would overwrite the first's saveDocument with a trained[] that
// never saw it, since ContentContext.refresh()'s effect hasn't landed yet.
// One saveDocument per track, one refresh() after the batch, one appendLog
// line per grant (grantTrainedAbility's own, same as the review-queue path).
// Granted tracks are then spliced out of the PC's training doc in a single
// force:true write (the log line, per the repo's side-effects-in-handlers
// invariant, already fired inside each grantTrainedAbility call above — never
// in an effect).
//
// A track hitting its benchmark (whether via +8 h here or an over-benchmark
// value already sitting in the doc when this view mounts) gets a brief
// data-fx="bloom" highlight (src/fx.css) — self-clearing, matching the
// FX_FLASH_MS convention used everywhere else in the dock.

const HOURS_PER_BUMP = 8;

const isReady = (t) => (t.hours || 0) >= t.benchmarkHours;

// Build the queue-shaped entry for one track, mirroring what
// TrainingProjects.jsx submits when a track completes on the player's own
// device — so the direct-grant path here and the review-queue path produce
// byte-identical trained[] entries.
const buildEntryForTrack = (char, track) => {
  const offering = trackOffering(track, TRAINING_VENDORS);
  const choice = track.choiceId
    ? (offering?.choices || []).find((c) => c.id === track.choiceId)
    : null;
  const vendor = trainingVendorById(track.vendorId);
  return buildTrainingResult({
    charId: char.id,
    charName: char.name,
    vendorId: track.vendorId,
    vendorName: vendor?.name || track.vendorId,
    offeringId: track.offeringId,
    offeringName: offering?.name || track.offeringId,
    choiceId: choice?.id,
    choiceName: choice?.name,
    grant: buildGrant(offering, choice),
  });
};

const TrainingView = () => {
  const { rawCharacters, refresh } = useContent();
  const { getState, sendUpdate } = useSession();
  const { appendLog } = useEncounter();
  const { party } = usePartyActivity('training');
  const [busyId, setBusyId] = useState(null); // charId currently confirming (async)
  const [bloomTrackId, setBloomTrackId] = useState(null);
  const bloomTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(bloomTimerRef.current), []);

  const rows = party
    .map((p) => ({
      char: p.char,
      color: p.color,
      tracks: (p.state?.tracks || []).filter((t) => (t.status || 'in-progress') === 'in-progress'),
    }))
    .filter((r) => r.tracks.length > 0);

  const flashReady = (trackId) => {
    setBloomTrackId(trackId);
    clearTimeout(bloomTimerRef.current);
    bloomTimerRef.current = setTimeout(
      () => setBloomTrackId((cur) => (cur === trackId ? null : cur)),
      FX_FLASH_MS
    );
  };

  const writeTracks = (charId, tracks) => {
    sendUpdate(charId, APP.TRAINING, { tracks }, { force: true });
  };

  const bumpHours = (char, visibleTracks) => {
    const target = visibleTracks.find((t) => !isReady(t));
    if (!target) return; // every track on this card is already ready
    const live = getState(char.id, APP.TRAINING)?.tracks || visibleTracks;
    const nextHours = (target.hours || 0) + HOURS_PER_BUMP;
    const next = live.map((t) => (t.id === target.id ? { ...t, hours: nextHours } : t));
    writeTracks(char.id, next);
    if (nextHours >= target.benchmarkHours) flashReady(target.id);
  };

  const confirmCompletion = async (char, visibleTracks) => {
    const ready = visibleTracks.filter(isReady);
    if (ready.length === 0) return;
    setBusyId(char.id);
    try {
      let snapshot = rawCharacters;
      for (const track of ready) {
        // Deliberately sequential (see header comment): each grant must land
        // before the next reads the same character's trained[] snapshot.
        const entry = buildEntryForTrack(char, track);
        await grantTrainedAbility({ entry, rawCharacters: snapshot, saveDocument, appendLog });
        snapshot = snapshot.map((c) =>
          String(c.id) === String(char.id)
            ? { ...c, trained: [...(Array.isArray(c.trained) ? c.trained : []), buildTrainedEntry(entry)] }
            : c
        );
      }
      if (refresh) await refresh();

      const readyIds = new Set(ready.map((t) => t.id));
      const live = getState(char.id, APP.TRAINING)?.tracks || visibleTracks;
      writeTracks(char.id, live.filter((t) => !readyIds.has(t.id)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="dock-dt-view" aria-label="Training">
      <header className="dock-dt-head">
        <div className="dock-dt-title">
          <span className="dock-dt-kicker">Downtime</span>
          <h2 className="dock-dt-heading">Training</h2>
        </div>
        <span className="dock-dt-count">Tracks persist across periods</span>
      </header>

      <div className="dock-dt-view-body">
        {rows.length === 0 ? (
          <div className="dock-dt-note" role="status">
            <p>No one is currently training. Tracks a PC starts from their Downtime tab appear here.</p>
          </div>
        ) : (
          <div className="dock-dt-train-grid">
            {rows.map(({ char, color, tracks }) => {
              const anyReady = tracks.some(isReady);
              const vendorName = trainingVendorById(tracks[0]?.vendorId)?.name || tracks[0]?.vendorId;
              const busy = busyId === char.id;
              return (
                <div key={char.id} className="dock-dt-train-card" data-testid={`dock-dt-train-${char.id}`}>
                  <div className="dock-dt-train-head">
                    <span
                      className="dock-dt-train-dot"
                      style={{ '--x-theme': color }}
                      aria-hidden="true"
                    />
                    <span className="dock-dt-train-name">{char.name}</span>
                    <span className="dock-dt-train-vendor">{vendorName}</span>
                  </div>

                  <div className="dock-dt-train-tracks">
                    {tracks.map((t) => {
                      const ready = isReady(t);
                      const pct = Math.min(100, Math.round(((t.hours || 0) / t.benchmarkHours) * 100));
                      return (
                        <div
                          key={t.id}
                          className={`dock-dt-train-track${ready ? ' dock-dt-train-track--ready' : ''}`}
                          data-fx={bloomTrackId === t.id ? 'bloom' : undefined}
                        >
                          <div className="dock-dt-train-track-row">
                            <span className="dock-dt-train-label">{trackLabel(t)}</span>
                            <span className="dock-dt-train-readout">
                              {ready ? '✓ ready' : `${t.hours || 0}h / ${t.benchmarkHours}h`}
                            </span>
                          </div>
                          <span className="dock-dt-bar dock-dt-train-bar">
                            <span className="dock-dt-bar-fill" style={{ '--rp-pct': `${pct}%` }} />
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="dock-dt-train-footer">
                    <button
                      type="button"
                      className="dock-dt-btn"
                      disabled={busy}
                      aria-label={`Add ${HOURS_PER_BUMP} hours for ${char.name}`}
                      onClick={() => bumpHours(char, tracks)}
                    >
                      +{HOURS_PER_BUMP} h
                    </button>
                    <button
                      type="button"
                      className={`dock-dt-btn dock-dt-train-confirm${anyReady ? ' dock-dt-train-confirm--ready' : ''}`}
                      disabled={!anyReady || busy}
                      aria-label={
                        anyReady
                          ? `Confirm completion for ${char.name}`
                          : `No track ready for ${char.name}`
                      }
                      onClick={() => confirmCompletion(char, tracks)}
                    >
                      {busy ? 'Granting…' : anyReady ? 'Confirm completion' : 'No track ready'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default TrainingView;
