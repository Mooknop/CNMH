import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useSession } from '../../contexts/SessionContext';
import { usePlayMode } from '../../hooks/usePlayMode';
import { usePartyActivity } from '../../hooks/usePartyActivity';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useExplorationEffect } from '../../hooks/useExplorationEffect';
import { EXPLORATION_ACTIVITIES } from '../../data/explorationActivities';
import {
  availableActivitiesFor,
  bestRollSkill,
  explorationRollBonus,
  explorationDegreeOfSuccess,
  rollD20,
  isDockRollable,
  applyExplorationSuccessEffect,
  SKILL_DISPLAY_NAMES,
  DEGREE_LABEL,
} from '../../utils/explorationUtils';
import { getCharacterColor } from '../../utils/CharacterUtils';
import { formatSpeedBreakdown } from '../../utils/speed';
import { monogram } from '../encounter/commandsheet/Dossier';
import { APP, RELAY, syncKey, globalKey } from '../../sync/keys';
import ExplorationTimeControl from './ExplorationTimeControl';
import './DockExplorationRoster.css';

const fmtMod = (m) => (m == null ? '—' : (m >= 0 ? `+${m}` : `${m}`));

// GM Command Dock — Exploration roster strip (#1810, epic #1804 S6). The party
// map's second column. Deliberately NOT five control panes: the epic's ruling
// is that the map is the control surface, so this is one compact chip per PC —
// who they are, what they're doing, how fast they're doing it, and whether
// they're in the selection. Tapping a chip TOGGLES that PC exactly like
// tapping their token (the pane owns the selection SET — #1824, epic #1822
// A2 — we just call back into it); `selectedIds` is a `Set`, and every member
// renders selected, not just one. `onSelectAll`/`onClear` (also #1824) grab
// or empty the whole party from here.
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

// ─── DOCK-SIDE SECRET CHECKS (#1812, epic #1804 S8) ──────────────────────────
// A picked activity carrying `mechanics.roll` gets a d20 button on its chip.
// Tapping it rolls RIGHT HERE, in this component's own state, and NOTHING
// about the roll (face, total, DC, degree) is ever written through
// `useSyncedState`/`sendUpdate` or the session log. That's the whole point:
// the CampaignSession DO fans every synced key out to every connected peer —
// app tabs AND the Foundry bridge — so a player's own device would see a
// "secretly" rolled Perception or Stealth check the instant it synced. The
// ONLY way this check is actually secret is to never put it on the wire.
// (Contrast with the effect an activity's roll can *grant* on success — e.g.
// Avoid Notice's `avoid-notice-hidden` — which DOES go through sendUpdate,
// exactly as it already does from the player's own RollActivityModal. The
// mechanical outcome is public the same way it always was; only the roll
// that produced it is not.)
//
// Modifier math, degree-of-success, and effect application all come from
// explorationUtils (shared with RollActivityModal, refactored onto the same
// functions in this slice) — the dock cannot compute a different number than
// the player-side modal would for the same PC/skill.
//
// DC is a per-row, per-PC input (not one shared field): a beat's Search DC
// and a beat's Gather Information DC are usually unrelated secret numbers,
// and a shared field would force the GM to re-type it between PCs mid-roll.
// Leaving it blank rolls a raw total with no degree — useful when the GM
// hasn't decided (or doesn't want to reveal, even to themselves via a
// degree label) the DC yet.
//
// Re-roll: tapping the d20 again after a result simply rolls again and
// replaces it (no confirm) — mirrors RollActivityModal's own re-open-and-roll
// path, which is likewise not idempotent: a second successful commit of the
// same onSuccessEffect appends a second entry rather than replacing the
// first (`applyExplorationSuccessEffect` is deliberately an append, not a
// reconciler like `useExplorationEffect` above). This slice does not attempt
// to fix that pre-existing quirk; a GM who re-rolls a success into another
// success can double-apply the effect, same as re-opening the player modal
// could. Changing the PC's activity pick (including "New beat") clears that
// chip's roll row entirely, since a stale result from a different activity
// would be actively misleading.
//
// `roll.target === 'party-pc'` (only Treat Poison today) is EXCLUDED from the
// dock roll affordance — see `isDockRollable` in explorationUtils. It needs a
// target picker that doesn't fit a compact roster row, and Treat Poison isn't
// Secret-traited in the first place, so there's no secrecy reason to roll it
// here instead of on the player's own client.

const PACE_LABEL = { half: '½ Speed', double: '×2 Speed', full: 'Full Speed' };

// ─── One PC's chip ───────────────────────────────────────────────────────────
// Hooks must be unconditional and per-character, so every chip is its own
// component (the PartyPanel/PartyMemberRow precedent) — the pick subscription,
// the derived character, and the effect driver all live here.
const RosterChip = ({
  character, accent, selected, explorationActive, onSelect, effectCatalog, onRegisterRoll,
}) => {
  const charId = character.id;
  const [pick, setPick] = useSyncedState(syncKey(APP.EXPLORATION, charId), null);
  const [open, setOpen] = useState(false);
  const model = useCharacter(character);

  const activity = EXPLORATION_ACTIVITIES.find((a) => a.name === pick) || null;

  // Dock-side effect driver — mirrors ExplorationTab's derivation exactly.
  // The third arg (#1812) keeps this from clobbering a roll-granted
  // onSuccessEffect entry the roll row below just applied — see
  // useExplorationEffect's own comment for why that race is real.
  useExplorationEffect(
    charId,
    explorationActive ? (activity?.mechanics?.effect || null) : null,
    activity?.mechanics?.roll?.onSuccessEffect || null
  );

  const speed = model?.speed || null;
  const options = availableActivitiesFor(EXPLORATION_ACTIVITIES, {
    flags: model?.flags || {},
    skillProficiencies: model?.skillProficiencies || {},
  });

  const choose = (name) => {
    setPick(pick === name ? null : name);
    setOpen(false);
  };

  // ── Secret check roll (#1812) — see the file-header comment for the
  // unsynced ruling. Everything from here down (`dc`, `result`) is
  // component-local React state, never a synced key.
  const roll = activity?.mechanics?.roll || null;
  const canRoll = !!roll && isDockRollable(roll);
  const { getState, sendUpdate } = useSession();
  const { effects } = useEffects(charId);
  const [activeConditions] = useSyncedState(syncKey(RELAY.CONDITIONS, charId), []);
  const [dc, setDc] = useState('');
  const [result, setResult] = useState(null);

  const skillId = canRoll
    ? (roll.type === 'skill-pick' ? bestRollSkill(roll, character, model) : roll.skill)
    : null;

  const followExpert = getState(charId, APP.FOLLOWEXPERT);
  const followExpertBonus = (followExpert?.skillId && followExpert.skillId === skillId) ? 2 : 0;

  const { bonus, circumstanceBonus, circumstanceLabel } = canRoll
    ? explorationRollBonus(roll, skillId, character, {
        conditions: activeConditions || [], effects: effects || [], effectCatalog, followExpertBonus,
      })
    : { bonus: null, circumstanceBonus: 0, circumstanceLabel: '' };

  const onSuccessEffectId = roll?.onSuccessEffect || null;
  const effectDef = onSuccessEffectId
    ? (effectCatalog || []).find((e) => e.id === onSuccessEffectId) || null
    : null;

  // Re-picking (or clearing) the activity invalidates any prior roll for it.
  useEffect(() => { setResult(null); setDc(''); }, [pick]);

  const doRoll = useCallback(() => {
    if (!canRoll || !skillId) return;
    const face = rollD20();
    const total = face + (bonus ?? 0);
    const dcNum = dc !== '' && !isNaN(parseInt(dc, 10)) ? parseInt(dc, 10) : null;
    const degree = dcNum != null ? explorationDegreeOfSuccess(total, dcNum) : null;
    const succeeded = degree === 'success' || degree === 'criticalSuccess';

    let note = null;
    if (effectDef) {
      if (succeeded) {
        applyExplorationSuccessEffect(onSuccessEffectId, charId, { getState, sendUpdate });
        note = `${effectDef.name} applied`;
      } else if (degree) {
        note = `${effectDef.name} — success required`;
      }
    }

    setResult({ face, total, degree, note });
  }, [canRoll, skillId, bonus, dc, effectDef, onSuccessEffectId, charId, getState, sendUpdate]);

  // Register this chip's roll trigger with the strip's "Roll all" button —
  // a plain ref registry (not lifted state) because the roll math needs this
  // component's own hooks (character model, conditions, effects), and those
  // can't run in a loop at the parent (rules of hooks) the way
  // usePartyActivity's picks already do for the "N pending" count.
  useEffect(() => {
    if (!onRegisterRoll) return undefined;
    onRegisterRoll(charId, canRoll && skillId ? doRoll : null);
    return () => onRegisterRoll(charId, null);
  }, [charId, onRegisterRoll, canRoll, skillId, doRoll]);

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

      {canRoll && (
        <div className="dock-exp-chip-roll" data-testid={`dock-exp-roll-${charId}`}>
          <span className="dock-exp-chip-roll-mod" title={circumstanceLabel ? `includes ${fmtMod(circumstanceBonus)} ${circumstanceLabel}` : undefined}>
            {skillId ? `${SKILL_DISPLAY_NAMES[skillId] || skillId} ${fmtMod(bonus)}` : 'no trained skill'}
          </span>
          <label className="dock-exp-chip-dc-label">
            DC
            <input
              type="number"
              min="1"
              className="dock-exp-chip-dc"
              aria-label={`Secret DC for ${character.name}`}
              value={dc}
              onChange={(e) => setDc(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="dock-exp-chip-roll-btn"
            aria-label={`Roll ${activity.name} for ${character.name}`}
            disabled={!skillId}
            onClick={doRoll}
          >
            🎲
          </button>
          {result && (
            <span
              className={`dock-exp-chip-result${result.degree ? ` dock-exp-degree--${result.degree}` : ''}`}
              data-testid={`dock-exp-result-${charId}`}
              role="status"
            >
              <span className="dock-exp-chip-result-math">
                d20 {result.face} {fmtMod(bonus)} = {result.total}
              </span>
              {result.degree && (
                <span className="dock-exp-chip-result-degree">{DEGREE_LABEL[result.degree]}</span>
              )}
              {result.note && <span className="dock-exp-chip-result-note">{result.note}</span>}
            </span>
          )}
        </div>
      )}

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
const EMPTY_SELECTION = new Set();

const DockExplorationRoster = ({
  selectedIds = EMPTY_SELECTION, onSelect = NOOP, onSelectAll = NOOP, onClear = NOOP,
}) => {
  const { characters, theme, effects: effectCatalog } = useContent();
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

  // Roll all (#1812) — one tap rolls every PC whose current pick is
  // roll-bearing (secret checks at the top of a beat: Search, Avoid Notice,
  // ...). `rollFnsRef` is a registry each RosterChip fills in with its own
  // roll trigger (see that component's registration effect) since the actual
  // roll needs hooks that can only run per-chip. `party` (already subscribed
  // above for the readiness readout) gives a reactive count of who's
  // currently eligible, independent of the ref, for the button's label.
  const rollFnsRef = useRef({});
  const registerRoll = useCallback((charId, fn) => {
    rollFnsRef.current[charId] = fn;
  }, []);
  const pendingRolls = party.filter(
    (p) => p.state && isDockRollable(EXPLORATION_ACTIVITIES.find((a) => a.name === p.state)?.mechanics?.roll)
  );
  const rollAll = () => {
    pendingRolls.forEach((p) => rollFnsRef.current[p.char.id]?.());
  };

  return (
    <aside className="dock-exp-roster" aria-label="Party activities">
      <div className="dock-exp-roster-head">
        <span className="dock-exp-roster-label">Party</span>
        <span className="dock-exp-roster-ready" role="status">
          {readyCount} / {total} picked
        </span>
      </div>

      {/* Select all / Clear (#1824, epic #1822 A2) — selection is a set now,
          so the strip needs a fast way to grab the whole party or bail back
          to nothing, same footing as the per-chip toggle below. */}
      <div className="dock-exp-roster-selectrow">
        <button
          type="button"
          className="dock-exp-btn"
          onClick={onSelectAll}
          disabled={roster.length === 0}
        >
          Select all
        </button>
        <button
          type="button"
          className="dock-exp-btn"
          onClick={onClear}
          disabled={selectedIds.size === 0}
        >
          Clear
        </button>
        {selectedIds.size > 0 && (
          <span className="dock-exp-roster-selcount" role="status">
            {selectedIds.size} selected
          </span>
        )}
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
              selected={selectedIds.has(c.id)}
              explorationActive={explorationActive}
              onSelect={onSelect}
              effectCatalog={effectCatalog}
              onRegisterRoll={registerRoll}
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
        <button
          type="button"
          className="dock-exp-btn"
          title="Secretly roll every PC's current roll-bearing activity at once — nothing rides the relay"
          onClick={rollAll}
          disabled={pendingRolls.length === 0}
        >
          Roll all ({pendingRolls.length})
        </button>
      </div>

      {/* Time control (#1811, epic #1804 S7) — the roster column's footer,
          below the party-state actions. `.dock-exp-time` is a thin dock-scoped
          wrapper (DockExplorationRoster.css) that keeps ExplorationTimeControl's
          `.pmc-*` rows from overflowing this narrow column; it never touches
          the shared .pmc-* rules PlayModeControl's own mount still relies on.
          The component is self-contained: it reads cnmh_exploredist_global
          (accrued by the pane's move handler) against cnmh_roster_global for
          the distance→minutes suggestion, and Apply both advances the shared
          clock and zeroes the tally. */}
      <div className="dock-exp-time">
        <ExplorationTimeControl />
      </div>
    </aside>
  );
};

export default DockExplorationRoster;
