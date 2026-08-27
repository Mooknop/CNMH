import React, { useEffect, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useSession } from '../../contexts/SessionContext';
import { usePlayMode } from '../../hooks/usePlayMode';
import { usePartyActivity } from '../../hooks/usePartyActivity';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { useExplorationEffect } from '../../hooks/useExplorationEffect';
import { EXPLORATION_ACTIVITIES } from '../../data/explorationActivities';
import { availableActivitiesFor } from '../../utils/explorationUtils';
import { getCharacterColor } from '../../utils/CharacterUtils';
import { formatSpeedBreakdown } from '../../utils/speed';
import { monogram } from '../encounter/commandsheet/Dossier';
import { APP, syncKey, globalKey } from '../../sync/keys';
import './DockExplorationRoster.css';

// GM Command Dock — Exploration roster strip (#1810, epic #1804 S6). The party
// map's second column. Deliberately NOT five control panes: the epic's ruling
// is that the map is the control surface, so this is one compact chip per PC —
// who they are, what they're doing, how fast they're doing it, and whether
// they're the selected mover. Tapping a chip selects that PC exactly like
// tapping their token (the pane owns the selection; we just call back into it).
//
// ─── THE DOCK IS A WRITER, NOT JUST A VIEW ───────────────────────────────────
// The GM sets each PC's `cnmh_exploration_<charId>` from here — an act-as write
// on the SAME key the player's ExplorationList writes, so no new key, no
// SANDBOX_WRITABLE_TYPES change, and the two pickers stay interchangeable (both
// filter through explorationUtils' shared `availableActivitiesFor` gate).
//
// ─── THE EFFECT DRIVER (the load-bearing part) ───────────────────────────────
// Until this slice, the activity's self-buff was applied ONLY by the player's
// own client: ExplorationTab mounts `useExplorationEffect(charId, effectId)`
// and writes `cnmh_scoutbonus_global` when its pick is Scout. GM-driven play
// breaks that — the GM picks Defend for a player whose tablet is asleep, the
// pick syncs, and the +2 Perception never lands. So each chip child below
// mounts the SAME hook with the SAME derivation, and the strip maintains the
// Scout key party-wide. The dock drives the buffs whether or not anyone else
// is looking.
//
// DUAL-MOUNT IDEMPOTENCY (verified, and covered by tests): with a player's
// ExplorationTab mounted at the same time, two clients drive the same
// `cnmh_effects_<charId>`. They converge rather than fight, because
// `useExplorationEffect` is a reconciler, not an appender:
//   · it bails outright when the existing `source:'exploration'` entry already
//     carries the desired effectId — the steady state for both writers;
//   · when it does write, it FILTERS OUT every prior exploration-source entry
//     before appending exactly one. So even if both writers fire off the same
//     stale render (each minting its own uid), the second write replaces the
//     first — one entry, never two — and the next render has both bailing.
// Both surfaces derive `desired` from the same synced pick and the same
// effective `mode`, so they can never want different values and oscillate.
// Same standard for Scout: the strip writes `cnmh_scoutbonus_global` only when
// the derived value DIFFERS from what's stored, so identical writes are free —
// and, as a bonus, the dock repairs the pre-existing player-side race where a
// non-Scout PC's tab blanks the key on mount.

const PACE_LABEL = { half: '½ Speed', double: '×2 Speed', full: 'Full Speed' };

// ─── One PC's chip ───────────────────────────────────────────────────────────
// Hooks must be unconditional and per-character, so every chip is its own
// component (the PartyPanel/PartyMemberRow precedent) — the pick subscription,
// the derived character, and the effect driver all live here.
const RosterChip = ({
  character, accent, selected, explorationActive, onSelect,
}) => {
  const charId = character.id;
  const [pick, setPick] = useSyncedState(syncKey(APP.EXPLORATION, charId), null);
  const [open, setOpen] = useState(false);
  const model = useCharacter(character);

  const activity = EXPLORATION_ACTIVITIES.find((a) => a.name === pick) || null;

  // Dock-side effect driver — mirrors ExplorationTab's derivation exactly.
  useExplorationEffect(charId, explorationActive ? (activity?.mechanics?.effect || null) : null);

  const speed = model?.speed || null;
  const options = availableActivitiesFor(EXPLORATION_ACTIVITIES, {
    flags: model?.flags || {},
    skillProficiencies: model?.skillProficiencies || {},
  });

  const choose = (name) => {
    setPick(pick === name ? null : name);
    setOpen(false);
  };

  return (
    <li
      className={`dock-exp-chip${selected ? ' is-selected' : ''}`}
      style={{ '--x-theme': accent }}
      data-testid={`dock-exp-chip-${charId}`}
    >
      <div className="dock-exp-chip-row">
        <button
          type="button"
          className="dock-exp-chip-main"
          aria-pressed={selected}
          aria-label={`Select ${character.name} to move`}
          onClick={() => onSelect(charId)}
        >
          <span className="dock-exp-chip-medal" aria-hidden="true">{monogram(character.name)}</span>
          <span className="dock-exp-chip-id">
            <span className="dock-exp-chip-name">{character.name}</span>
            <span className={`dock-exp-chip-activity${pick ? '' : ' is-empty'}`}>
              {pick || 'No activity'}
            </span>
          </span>
          <span className="dock-exp-chip-pace">
            {activity?.mechanics?.speed && (
              <span className="dock-exp-chip-tag">{PACE_LABEL[activity.mechanics.speed]}</span>
            )}
            {speed?.total > 0 && (
              <span
                className="dock-exp-chip-speed"
                title={formatSpeedBreakdown(speed)}
              >
                {speed.total} ft
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          className="dock-exp-chip-pick"
          aria-expanded={open}
          aria-label={`Set activity for ${character.name}`}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '×' : '⚙'}
        </button>
      </div>

      {open && (
        <ul className="dock-exp-chip-menu" aria-label={`Activities for ${character.name}`}>
          {options.map((a) => (
            <li key={a.name}>
              <button
                type="button"
                className={`dock-exp-chip-option${pick === a.name ? ' is-active' : ''}`}
                aria-pressed={pick === a.name}
                onClick={() => choose(a.name)}
              >
                <span className="dock-exp-chip-option-name">{a.name}</span>
                {a.mechanics?.speed && (
                  <span className="dock-exp-chip-tag">{PACE_LABEL[a.mechanics.speed]}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

// ─── The strip ───────────────────────────────────────────────────────────────
const NOOP = () => {};

const DockExplorationRoster = ({ selectedId = null, onSelect = NOOP }) => {
  const { characters, theme } = useContent();
  const { sendUpdate } = useSession();
  const { mode, moveOverride, setMoveOverride } = usePlayMode();
  // Party-wide pick reader — also what the readiness readout and the Scout
  // derivation below run on (the same subscription useExplorationReady uses).
  // (`deriveStatus` matches useExplorationReady's, so the readout below and
  // the party's own readiness gate always agree on who has picked.)
  const { party, readyCount, total } = usePartyActivity('exploration', {
    youFirst: false,
    deriveStatus: (state) => (state != null ? 'ready' : 'planning'),
  });

  const roster = Array.isArray(characters) ? characters : [];
  const explorationActive = mode === 'exploration';

  // Scout parity — see the dual-mount note at the top of the file. First Scout
  // in roster order wins if the GM somehow sets two; the bonus is a party-wide
  // +1 either way, so there is nothing to stack.
  const [scoutBonus, setScoutBonus] = useSyncedState(globalKey(APP.SCOUTBONUS), null);
  const desiredScout = explorationActive
    ? (party.find((p) => p.state === 'Scout')?.char?.id || null)
    : null;
  useEffect(() => {
    if ((scoutBonus || null) !== desiredScout) setScoutBonus(desiredScout);
  }, [desiredScout, scoutBonus, setScoutBonus]);

  // New beat: null every PC's pick in one tap. Confirm-less on purpose — a
  // mis-tap costs one re-pick. Writes go through sendUpdate (not each chip's
  // setter) because the parent has no hook per PC; the session's local
  // subscriber fanout lands them in every chip's useSyncedState anyway. The
  // override drops with it, or the fresh beat would skip the picker entirely —
  // the same pairing PlayModeControl's exploration-entry reset does.
  const newBeat = () => {
    roster.forEach((c) => sendUpdate(c.id, APP.EXPLORATION, null));
    setMoveOverride(false);
  };

  return (
    <aside className="dock-exp-roster" aria-label="Party activities">
      <div className="dock-exp-roster-head">
        <span className="dock-exp-roster-label">Party</span>
        <span className="dock-exp-roster-ready" role="status">
          {readyCount} / {total} picked
        </span>
      </div>

      {roster.length === 0 ? (
        <p className="dock-exp-note">No characters in the roster yet.</p>
      ) : (
        <ul className="dock-exp-roster-list">
          {roster.map((c, i) => (
            <RosterChip
              key={c.id}
              character={c}
              accent={theme?.accentOverrides?.[c.id] || getCharacterColor(i)}
              selected={selectedId === c.id}
              explorationActive={explorationActive}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}

      <div className="dock-exp-roster-foot">
        <button
          type="button"
          className={`dock-exp-btn${moveOverride ? ' is-on' : ''}`}
          aria-pressed={moveOverride}
          title="Let the party move before everyone has picked an activity"
          onClick={() => setMoveOverride(!moveOverride)}
        >
          Start movement
        </button>
        <button
          type="button"
          className="dock-exp-btn"
          title="Clear every activity pick and start a fresh exploration beat"
          onClick={newBeat}
          disabled={roster.length === 0}
        >
          New beat
        </button>
      </div>
    </aside>
  );
};

export default DockExplorationRoster;
