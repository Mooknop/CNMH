import React, { useRef, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useEncounter } from '../../hooks/useEncounter';
import { seedDefaults, seedMissing, repointFocusSpellsToCatalog, syncChainConfig } from '../../utils/gmApi';
import { downloadBackup, restoreBackup } from '../../utils/gmBackup';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import PlayModeControl from '../../components/gm/PlayModeControl';
import PartyPanel from '../../components/gm/PartyPanel';
import GmSaveRequest from '../../components/gm/GmSaveRequest';
import RequestedSaves from '../../components/encounter/RequestedSaves';
import EffectsModal from '../../components/character-sheet/EffectsModal';
import SetLocationModal from '../../components/gm/SetLocationModal';
import GmIcon from './GmIcon';
import './gm.css';

// ─────────────────────────────────────────────────────────────
// Initiative panel — encounter mode only
// Actor-assignment UI: the GM maps Foundry actor IDs → CNMH
// character IDs. Auto-matched by ActorMapSync; overrideable here.
// "Not a PC" writes null so ActorMapSync never re-matches it.
// ─────────────────────────────────────────────────────────────
const InitiativePanel = ({ encounter, actorMap, setActorMap, characters }) => {
  const phase        = encounter?.phase          || 'idle';
  const order        = encounter?.order          || [];
  const round        = encounter?.round          || 0;
  const currentIndex = encounter?.currentTurnIndex ?? 0;
  const foundryLinked = !!encounter?.foundryCombatId;
  const pcEntries    = order.filter((e) => e.kind === 'pc' && e.charId);

  const handleAssign = (foundryActorId, charId) => {
    setActorMap((prev) => {
      const next = { ...(prev || {}) };
      if (charId === '') {
        next[foundryActorId] = null; // sentinel: don't re-match
      } else {
        next[foundryActorId] = charId;
      }
      return next;
    });
  };

  return (
    <section className="gm-dash-panel" aria-label="Initiative">
      <header className="gm-encounter-header">
        <h2>Encounter</h2>
        {foundryLinked ? (
          <p className="gm-help">Live — controlled by Foundry VTT.</p>
        ) : (
          <p className="gm-help">Waiting for combat to start in Foundry.</p>
        )}
      </header>

      {phase !== 'idle' && (
        <div className="gm-encounter-status">
          <strong>Phase:</strong> {phase}
          {phase === 'in-progress' && (
            <>
              {' '}&middot; <strong>Round {round}</strong>
              {order[currentIndex] && (
                <> &middot; current: <strong>{order[currentIndex].name}</strong></>
              )}
            </>
          )}
        </div>
      )}

      {phase !== 'idle' && <GmSaveRequest pcEntries={pcEntries} />}
      {phase !== 'idle' && <RequestedSaves />}

      {phase !== 'idle' && (
        <div className="gm-encounter-order">
          <h3>Initiative order</h3>
          {order.length === 0 && <p>No entries yet.</p>}
          <ul className="gm-encounter-list" aria-label="encounter-order">
            {order.map((e, i) => {
              const assigned = e.foundryActorId ? (actorMap[e.foundryActorId] ?? '') : '';
              return (
                <li
                  key={e.entryId}
                  className={[
                    'gm-encounter-row',
                    phase === 'in-progress' && i === currentIndex ? 'is-current' : '',
                    e.kind === 'enemy' ? 'is-enemy' : 'is-pc',
                  ].filter(Boolean).join(' ')}
                  data-testid={`order-row-${e.entryId}`}
                >
                  <span className="gm-encounter-name">{e.name}</span>
                  <span className="gm-encounter-init">
                    init {e.initiative === null || e.initiative === undefined ? '—' : e.initiative}
                  </span>
                  {e.foundryActorId && (
                    <select
                      className="gm-encounter-assign"
                      aria-label={`assign-${e.entryId}`}
                      value={assigned}
                      onChange={(ev) => handleAssign(e.foundryActorId, ev.target.value)}
                    >
                      <option value="">Not a PC</option>
                      {(characters || []).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
};

// ─────────────────────────────────────────────────────────────
// Maintenance panel — collapsible; seed / backup / restore
// Logic unchanged from the pre-refresh GmDashboard.
// ─────────────────────────────────────────────────────────────
const MaintenancePanel = () => {
  const { source, rawCharacters, spells: rawSpells } = useContent();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const fileRef = useRef(null);

  const runSeed = async (force) => {
    setConfirm(null);
    setBusy(true);
    setMsg(null);
    try {
      const res = await seedDefaults(force);
      setMsg(`Done: ${JSON.stringify(res.seeded)}`);
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const applyNewDefaults = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const seedRes    = await seedMissing();
      const repointRes = await repointFocusSpellsToCatalog(rawCharacters);
      const chainRes   = await syncChainConfig(rawSpells, rawCharacters);
      const parts = [`Done: ${JSON.stringify(seedRes.seeded)}`];
      parts.push(repointRes.repointed.length
        ? `repointed focus spells: ${repointRes.repointed.join(', ')}`
        : 'focus spells already up to date');
      parts.push(chainRes.patched.length
        ? `synced chain config: ${chainRes.patched.join(', ')}`
        : 'chain config already up to date');
      setMsg(parts.join('; '));
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const doBackup = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await downloadBackup();
      setMsg('Backup downloaded.');
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const onPickRestore = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) setConfirm({ kind: 'restore', file });
    if (fileRef.current) fileRef.current.value = '';
  };

  const doRestore = async () => {
    const { file } = confirm;
    setConfirm(null);
    setBusy(true);
    setMsg(null);
    try {
      const res = await restoreBackup(file);
      setMsg(`Restored: ${JSON.stringify(res.seeded)}`);
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="gm-dash-maintenance">
      <summary>Maintenance</summary>
      <div className="gm-dash-maintenance-body">
        <p>
          Content source:{' '}
          <strong className={source === 'server' ? 'gm-ok' : 'gm-warn'}>{source}</strong>
        </p>

        {source === 'fallback' && (
          <div className="gm-banner">
            The store is empty — the app is showing the bundled defaults. They&apos;re
            imported automatically when you enter the GM area so edits persist and
            sync live; use the buttons below to re-run it manually if needed.
          </div>
        )}

        <div className="gm-actions">
          <button className="btn-primary" disabled={busy} onClick={() => runSeed(false)}>
            Import defaults (only empty collections)
          </button>
          <button className="btn-secondary" disabled={busy} onClick={applyNewDefaults}>
            Apply new defaults (non-destructive)
          </button>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() => setConfirm({ kind: 'reseed' })}
          >
            Force reseed (overwrite)
          </button>
        </div>

        <h2>Backup &amp; restore</h2>
        <p className="gm-count">
          Download a snapshot of all stored content before risky edits. Restoring
          overwrites every collection in the file — keep backups safe.
        </p>
        <div className="gm-actions">
          <button className="btn-secondary" disabled={busy} onClick={doBackup}>
            Download backup
          </button>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => fileRef.current && fileRef.current.click()}
          >
            Restore from backup…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            aria-label="restore-file"
            style={{ display: 'none' }}
            onChange={onPickRestore}
          />
        </div>
        {msg && <pre className="gm-result">{msg}</pre>}

        <ConfirmDialog
          isOpen={confirm?.kind === 'reseed'}
          title="Force reseed"
          message="This overwrites ALL stored content with the bundled defaults, discarding every GM edit. This cannot be undone."
          confirmLabel="Reseed"
          requireType="RESEED"
          onConfirm={() => runSeed(true)}
          onCancel={() => setConfirm(null)}
        />
        <ConfirmDialog
          isOpen={confirm?.kind === 'restore'}
          title="Restore from backup"
          message={`This overwrites every collection in "${confirm?.file?.name || 'the file'}", discarding current content for those collections. This cannot be undone.`}
          confirmLabel="Restore"
          requireType="RESTORE"
          onConfirm={doRestore}
          onCancel={() => setConfirm(null)}
        />
      </div>
    </details>
  );
};

// ─────────────────────────────────────────────────────────────
// GmDashboard — Control Center
// ─────────────────────────────────────────────────────────────
const GmDashboard = () => {
  const { characters } = useContent();
  const { mode } = usePlayMode();
  const { encounter, actorMap, setActorMap } = useEncounter();
  const [isEffectsModalOpen, setIsEffectsModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  const isEncounter = mode === 'encounter';

  return (
    <div className="gm-dashboard">
      <div className="gm-dash-main">
        {/* Left column: mode marquee + initiative (encounter) */}
        <div className="gm-dash-left">
          {/* PlayModeControl owns its own marquee (bracketed) + context strip */}
          <PlayModeControl />

          {/* Initiative panel — encounter mode only */}
          {isEncounter && (
            <InitiativePanel
              encounter={encounter}
              actorMap={actorMap}
              setActorMap={setActorMap}
              characters={characters}
            />
          )}
        </div>

        {/* Right column: party HP roster + quick actions */}
        <div className="gm-dash-right">
          <PartyPanel />

          <section className="gm-dash-panel gm-dash-quick-actions" aria-label="Quick Actions">
            <h2>Quick Actions</h2>
            <div className="gm-qa-grid">
              <button
                type="button"
                className="gm-qa"
                aria-label="Apply Effect to character"
                onClick={() => setIsEffectsModalOpen(true)}
              >
                <GmIcon name="spark" className="gm-qa-ico" />
                <span className="gm-qa-title">Apply Effect</span>
                <span className="gm-qa-desc">Push a condition or effect to any character</span>
              </button>
              <button
                type="button"
                className="gm-qa"
                aria-label="Set party location"
                onClick={() => setIsLocationModalOpen(true)}
              >
                <GmIcon name="map" className="gm-qa-ico" />
                <span className="gm-qa-title">Set Location</span>
                <span className="gm-qa-desc">Set the party&apos;s current location from Location Lore</span>
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Maintenance — full-width, collapsed by default */}
      <MaintenancePanel />

      <EffectsModal
        isOpen={isEffectsModalOpen}
        onClose={() => setIsEffectsModalOpen(false)}
        selfCharId="gm"
        selfName="GM"
      />

      <SetLocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
      />
    </div>
  );
};

export default GmDashboard;
