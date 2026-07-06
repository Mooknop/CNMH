import React, { useRef, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useEncounter } from '../../hooks/useEncounter';
import { useReconciliation } from '../../hooks/useReconciliation';
import { seedDefaults, applyContentDiff, applyCharacterContentDiff } from '../../utils/gmApi';
import { downloadBackup, restoreBackup } from '../../utils/gmBackup';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import PlayModeControl from '../../components/gm/PlayModeControl';
import PartyPanel from '../../components/gm/PartyPanel';
import GmSaveRequest from '../../components/gm/GmSaveRequest';
import RequestedSaves from '../../components/encounter/RequestedSaves';
import PersistentChip from '../../components/encounter/PersistentChip';
import EffectsModal from '../../components/character-sheet/EffectsModal';
import SetLocationModal from '../../components/gm/SetLocationModal';
import AdjustHpModal from '../../components/gm/AdjustHpModal';
import CharacterStateModal from '../../components/gm/CharacterStateModal';
import GmGearModal from '../../components/gm/GmGearModal';
import RecallKnowledgeModal from '../../components/gm/RecallKnowledgeModal';
import SkillChallengeModal from '../../components/gm/SkillChallengeModal';
import SkillChallengePanel from '../../components/gm/SkillChallengePanel';
import PartyGoldModal from '../../components/gm/PartyGoldModal';
import SessionLogPanel from '../../components/gm/SessionLogPanel';
import CurrentRoomPanel from '../../components/gm/CurrentRoomPanel';
import EventsPanel from '../../components/gm/EventsPanel';
import BestiaryEditor from '../../components/gm/BestiaryEditor';
import Modal from '../../components/shared/Modal';
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
                  <PersistentChip entry={e} />
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

// Render the applyContentDiff (authored collections) + applyCharacterContentDiff
// (field-merged characters) reports as one readable summary. Lists live-only ids
// explicitly so the GM can review/delete them manually — the diff never deletes.
const summarizeDiff = (report, charReport) => {
  const lines = [];
  for (const [coll, r] of Object.entries(report || {})) {
    const bits = [];
    if (r.added.length) bits.push(`+${r.added.length} added`);
    if (r.changed.length) bits.push(`${r.changed.length} changed`);
    if (r.unchanged) bits.push(`${r.unchanged} unchanged`);
    if (r.liveOnly.length) bits.push(`${r.liveOnly.length} live-only`);
    if (!bits.length) continue;
    lines.push(`${coll}: ${bits.join(', ')}`);
    if (r.added.length) lines.push(`  added: ${r.added.join(', ')}`);
    if (r.changed.length) lines.push(`  changed: ${r.changed.join(', ')}`);
    if (r.liveOnly.length) lines.push(`  live-only (not in bundle — delete manually if intended): ${r.liveOnly.join(', ')}`);
  }
  if (charReport) {
    const { added = [], changed = [], liveOnly = [] } = charReport;
    const bits = [];
    if (added.length) bits.push(`+${added.length} added`);
    if (changed.length) bits.push(`${changed.length} changed`);
    if (liveOnly.length) bits.push(`${liveOnly.length} live-only`);
    if (bits.length) {
      lines.push(`character: ${bits.join(', ')} (inventory + gold preserved)`);
      if (added.length) lines.push(`  added: ${added.join(', ')}`);
      changed.forEach(({ id, fields }) =>
        lines.push(`  changed: ${id}${fields.length ? ` (${fields.join(', ')})` : ''}`));
      if (liveOnly.length) lines.push(`  live-only (not in bundle): ${liveOnly.join(', ')}`);
    }
  }
  return lines.length ? lines.join('\n') : 'Already up to date — nothing to apply.';
};

// ─────────────────────────────────────────────────────────────
// Maintenance panel — collapsible; seed / backup / restore
// Logic unchanged from the pre-refresh GmDashboard.
// ─────────────────────────────────────────────────────────────
const MaintenancePanel = () => {
  const { source, rawCharacters } = useContent();
  // Pending durable player overlays (consumed/gold/acquired/removed) not yet
  // committed to the character docs. A force reseed reverts char docs, so these
  // must be Synced first or they're lost — surface a warning before reseeding.
  const { pendingByChar } = useReconciliation();
  const pendingCount = (pendingByChar || []).reduce((n, g) => n + g.changes.length, 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const fileRef = useRef(null);

  const runSeed = async (force) => {
    setConfirm(null);
    setBusy(true);
    setMsg(null);
    try {
      // Never overwrite without a fresh backup on disk: a force reseed bypasses
      // the live store's normal history, so the downloaded snapshot is the
      // GM's restore point. If the backup fails, abort before any destructive
      // write (the import-defaults path, force=false, is non-destructive).
      if (force) {
        try {
          await downloadBackup();
        } catch (e) {
          setMsg(`Reseed aborted — backup failed, nothing was overwritten: ${e.message}`);
          return;
        }
      }
      const res = await seedDefaults(force);
      setMsg(`${force ? 'Backup downloaded, then reseeded' : 'Done'}: ${JSON.stringify(res.seeded)}`);
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  // One safe content apply: authored collections via applyContentDiff, then
  // characters via the field-level merge (preserves live inventory/gold). Both
  // archive every write, so the whole drop is restorable.
  const applyDiff = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const report = await applyContentDiff();
      const charReport = await applyCharacterContentDiff(rawCharacters);
      setMsg(summarizeDiff(report, charReport));
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
          <button className="btn-primary" disabled={busy} onClick={applyDiff}>
            Apply content update (diff)
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => runSeed(false)}>
            Import defaults (only empty collections)
          </button>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() => setConfirm({ kind: 'reseed' })}
          >
            Force reseed (overwrite)
          </button>
        </div>
        {pendingCount > 0 && (
          <p className="gm-warn" data-testid="reseed-pending-warning">
            ⚠ {pendingCount} pending player change{pendingCount === 1 ? '' : 's'} not yet
            synced to character docs. A reseed reverts those docs — Sync them first
            (Characters → Pending player changes) or they&apos;ll be lost.
          </p>
        )}
        <p className="gm-count">
          The diff-based update above writes only the docs that are new or changed
          (quests, items, spells, lore, traits, factions, calendar, effects, runes),
          one at a time, archiving each prior version so every write is restorable. It
          never deletes — docs only in the live store are reported, not removed.
          Characters are field-merged: authored content (feats, spells, stats,
          actions) is applied while live <strong>inventory and gold are preserved</strong>.
          Theme and images are left untouched. Prefer it over the destructive reseed
          below for routine content drops.
        </p>

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
          title="Force reseed (disaster recovery)"
          message={[
            pendingCount > 0
              ? `⚠ ${pendingCount} pending player change${pendingCount === 1 ? '' : 's'} have NOT been synced to character docs and will be lost. Cancel and Sync them first unless you're sure.`
              : null,
            'This downloads a backup, then overwrites ALL stored content with the bundled defaults. Prior versions are archived (restorable from history) and the backup is your full restore point — but live GM edits are reverted. Use this only for disaster recovery, not routine content drops.',
          ].filter(Boolean).join('\n\n')}
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
  const [isAdjustHpModalOpen, setIsAdjustHpModalOpen] = useState(false);
  const [isCharacterStateModalOpen, setIsCharacterStateModalOpen] = useState(false);
  const [isGearModalOpen, setIsGearModalOpen] = useState(false);
  const [isRecallKnowledgeModalOpen, setIsRecallKnowledgeModalOpen] = useState(false);
  const [isSkillChallengeModalOpen, setIsSkillChallengeModalOpen] = useState(false);
  const [isPartyGoldModalOpen, setIsPartyGoldModalOpen] = useState(false);
  const [isBestiaryEditorOpen, setIsBestiaryEditorOpen] = useState(false);

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

          {/* Current Room — under the mode/movement controls; hidden until
              rooms are imported */}
          <CurrentRoomPanel />

          {/* Events — active/upcoming chapter events + game-date due highlight;
              hidden until events are imported */}
          <EventsPanel />
        </div>

        {/* Right column: party HP roster + quick actions */}
        <div className="gm-dash-right">
          <PartyPanel />

          {/* Victory Point challenge — only while one is active */}
          <SkillChallengePanel />

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
              <button
                type="button"
                className="gm-qa"
                aria-label="Adjust character HP"
                onClick={() => setIsAdjustHpModalOpen(true)}
              >
                <GmIcon name="health" className="gm-qa-ico" />
                <span className="gm-qa-title">Adjust HP</span>
                <span className="gm-qa-desc">Heal or damage any character</span>
              </button>
              <button
                type="button"
                className="gm-qa"
                aria-label="Inspect character state"
                onClick={() => setIsCharacterStateModalOpen(true)}
              >
                <GmIcon name="users" className="gm-qa-ico" />
                <span className="gm-qa-title">Character State</span>
                <span className="gm-qa-desc">Inspect every live resource and flag for a character</span>
              </button>
              <button
                type="button"
                className="gm-qa"
                aria-label="Manage character gear"
                onClick={() => setIsGearModalOpen(true)}
              >
                <GmIcon name="bag" className="gm-qa-ico" />
                <span className="gm-qa-title">Manage Gear</span>
                <span className="gm-qa-desc">Bind talismans &amp; shield attachments instantly (sandbox-safe)</span>
              </button>
              <button
                type="button"
                className="gm-qa"
                aria-label="Send Recall Knowledge prompt"
                onClick={() => setIsRecallKnowledgeModalOpen(true)}
              >
                <GmIcon name="book" className="gm-qa-ico" />
                <span className="gm-qa-title">Recall Knowledge</span>
                <span className="gm-qa-desc">Send a skill-check prompt to players</span>
              </button>
              <button
                type="button"
                className="gm-qa"
                aria-label="Start a skill challenge"
                onClick={() => setIsSkillChallengeModalOpen(true)}
              >
                <GmIcon name="flag" className="gm-qa-ico" />
                <span className="gm-qa-title">Skill Challenge</span>
                <span className="gm-qa-desc">Run a Victory Point skill challenge</span>
              </button>
              <button
                type="button"
                className="gm-qa"
                aria-label="Set party gold"
                onClick={() => setIsPartyGoldModalOpen(true)}
              >
                <GmIcon name="bag" className="gm-qa-ico" />
                <span className="gm-qa-title">Party Gold</span>
                <span className="gm-qa-desc">Set how much gold each character carries</span>
              </button>
              {isEncounter && (
                <button
                  type="button"
                  className="gm-qa"
                  aria-label="Edit monster descriptions"
                  onClick={() => setIsBestiaryEditorOpen(true)}
                >
                  <GmIcon name="sword" className="gm-qa-ico" />
                  <span className="gm-qa-title">Bestiary</span>
                  <span className="gm-qa-desc">Redact or override monster descriptions</span>
                </button>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Session Log — full-width, above maintenance */}
      <SessionLogPanel />

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

      <AdjustHpModal
        isOpen={isAdjustHpModalOpen}
        onClose={() => setIsAdjustHpModalOpen(false)}
      />

      <GmGearModal
        isOpen={isGearModalOpen}
        onClose={() => setIsGearModalOpen(false)}
      />
      <CharacterStateModal
        isOpen={isCharacterStateModalOpen}
        onClose={() => setIsCharacterStateModalOpen(false)}
      />

      <RecallKnowledgeModal
        isOpen={isRecallKnowledgeModalOpen}
        onClose={() => setIsRecallKnowledgeModalOpen(false)}
      />

      <SkillChallengeModal
        isOpen={isSkillChallengeModalOpen}
        onClose={() => setIsSkillChallengeModalOpen(false)}
      />

      <PartyGoldModal
        isOpen={isPartyGoldModalOpen}
        onClose={() => setIsPartyGoldModalOpen(false)}
      />

      <Modal
        isOpen={isBestiaryEditorOpen}
        onClose={() => setIsBestiaryEditorOpen(false)}
        title="Bestiary — Description Overrides"
        maxWidth="820px"
      >
        <BestiaryEditor />
      </Modal>
    </div>
  );
};

export default GmDashboard;
