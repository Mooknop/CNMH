import React, { useState } from 'react';
import ConfirmDialog from '../../shared/ConfirmDialog';
import HpFx from '../../shared/HpFx';
import { useContent } from '../../../contexts/ContentContext';
import { useSession } from '../../../contexts/SessionContext';
import { useGameDate } from '../../../contexts/GameDateContext';
import { useCharacter } from '../../../hooks/useCharacter';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useSessionLog } from '../../../hooks/useSessionLog';
import { getFocusInfo } from '../../../utils/SpellUtils';
import { performDailyPrep } from '../../../utils/dailyPrep';
import { getCharacterColor } from '../../../utils/CharacterUtils';
import { toGameSeconds } from '../../../utils/gameTime';
import { RELAY, APP, syncKey } from '../../../sync/keys';
import './DowntimeViews.css';

// Downtime dock — Resources view (#1853 wave 2, #1860). A NEW surface: the one
// screen where the GM restores the party between encounters and overnight. One
// row per PC — identity, an HP bar with ±5 steppers, focus pips, spell-slot
// pips — over a footer bar carrying the two party-wide actions.
//
// ── EVERY VALUE IS REAL, NOTHING IS STORED ───────────────────────────────────
// HP is `cnmh_hp_<charId>` (the bridge-relayed key, so a Foundry-side change
// lands here live); focus is `cnmh_focus_<charId>`, an integer of points SPENT
// (0 = full pool) whose ceiling comes from getFocusInfo(character); slots are
// `cnmh_slots_<charId>`, a rank -> spent map whose ceilings come from
// useCharacter's `spellSlotTotals` (which folds in worn bonus-slot gear, so a
// Ring of Wizardry shows its extra pip). Ratios, pip fill, bar tone and the
// tradition note are all recomputed at render — none of it is written back.
//
// ── WRITES: force:true, ALWAYS ───────────────────────────────────────────────
// Every mutation here goes out as a direct getState/sendUpdate read-modify-write
// with `{ force: true }` (the useGiveItem / TrainingView pattern) rather than
// through a per-character hook setter. Two reasons: the GM dock mutates
// ARBITRARY roster PCs (hooks can't be called per-row from a party-wide
// handler), and `hp`/`focus`/`slots` are per-character resource keys outside
// SANDBOX_WRITABLE_TYPES — without `force` the offline-sandbox freeze would
// swallow them silently, and this surface has to work with Foundry down.
// Side effects (session-log lines, clock advances) fire in the click handlers,
// never in effects.
//
// ── WHAT "REST" MEANS HERE (rulings, #1860) ──────────────────────────────────
// A rest = performDailyPrep (slots, focus, staff charges, wand uses, daily
// frequencies, until-daily-prep effects — the exact same util the player's
// DailyPrepModal and the GM's PartyDailyPrepButton run, carrying each PC's
// existing Eld attunement and refreshing any prepared staff) PLUS the one thing
// that util deliberately does NOT touch: hit points. On top of full HP we:
//   - CLEAR wounded — PF2e ends the wounded condition when you recover to full
//     HP from a night's rest, and this button is that rest.
//   - CLEAR dying — a dying PC cannot be resting; out of combat the value is
//     assumed to be 0 already, so this is a defensive normalization, not a
//     rules call. (If someone is actually dying, the GM is in an encounter and
//     should not be on this screen.)
//   - PRESERVE temp HP — temp HP has its own source-dependent duration; a rest
//     is not authorized to strip it, and the steppers leave it alone too.
//   - LEAVE doomed alone. PF2e reduces doomed by 1 per full night's rest, but
//     the #1860 spec is silent on it and a silent condition change is worse
//     than an explicit GM adjustment. Deliberate omission, not an oversight.
// The per-PC Rest does NOT advance the clock — only the party's "Rest for the
// night" does (8 hours), and "Refocus party" advances 10 minutes. That split is
// the whole reason both buttons exist: the GM often rests one PC's resources
// after the fact without moving the party's day.

const HP_STEP = 5;
const REST_HOURS = 8;
const REFOCUS_MINUTES = 10;

// useSyncedState mirrors every write to localStorage; a direct sendUpdate does
// not, so party-wide writes keep the mirror in step by hand (the consumables /
// hymnHealing / dailyPrep convention for non-hook writers).
const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

// The shape useCharacter seeds cnmh_hp_<id> with — reused for the party-wide
// path, which reads through getState and may find the key untouched.
const hpSeed = (character) => ({
  current: character?.maxHp || 0,
  max: character?.maxHp || 0,
  temp: 0,
  dying: 0,
  wounded: 0,
  doomed: 0,
});

// Bar tone by remaining fraction (#1860 spec): > 0.6 verdant, > 0.3 gold,
// else peril. A class modifier, never an inline color — the thresholds live
// here and the hues live in the stylesheet.
const hpToneFor = (current, max) => {
  const ratio = max > 0 ? current / max : 0;
  if (ratio > 0.6) return 'verdant';
  if (ratio > 0.3) return 'gold';
  return 'peril';
};

const ORDINALS = ['0th', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const rankLabel = (rank) => ORDINALS[rank] || `${rank}th`;

// The slot note is whatever the character doc actually carries. Today that is
// `spellcasting.tradition` and nothing else, so most casters read "Occult" /
// "Arcane"; if a prepared-vs-spontaneous field is ever authored it joins on
// (the spec's "Arcane, spontaneous"). Absent metadata degrades to no note at
// all rather than to invented copy.
const slotNoteFor = (spellcasting) => {
  const prep = spellcasting?.preparation
    || (spellcasting?.spontaneous === true ? 'spontaneous' : null)
    || (spellcasting?.prepared === true ? 'prepared' : null);
  return [spellcasting?.tradition, prep].filter(Boolean).join(', ');
};

// Full HP + the condition normalization documented in the file header. Reads
// the live key so a concurrent bridge write isn't clobbered wholesale.
const restoreHp = (character, getState, sendUpdate) => {
  const live = getState(character.id, RELAY.HP) || hpSeed(character);
  const max = live.max || character.maxHp || 0;
  const next = { ...live, current: max, wounded: 0, dying: 0, damageType: undefined };
  writeLocal(syncKey(RELAY.HP, character.id), next);
  sendUpdate(character.id, RELAY.HP, next, { force: true });
};

// One PC. Its own component because the three resource reads (useCharacter for
// the derived model + hp, plus the focus and slot keys) are per-character hooks
// the party-wide view cannot call in a loop.
const ResourceRow = ({ character, color, onRest }) => {
  const { sendUpdate } = useSession();
  const model = useCharacter(character);
  const [focusSpent] = useSyncedState(syncKey(APP.FOCUS, character.id), 0);
  const [slotsSpent] = useSyncedState(syncKey(APP.SLOTS, character.id), {});

  const hp = model?.hp || hpSeed(character);
  const max = hp.max || 0;
  const current = Math.max(0, Math.min(max, hp.current || 0));
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  const tone = hpToneFor(current, max);

  const focusInfo = getFocusInfo(character);
  const focusMax = focusInfo?.max || 0;
  const focusOpen = Math.max(0, Math.min(focusMax, focusMax - (Number(focusSpent) || 0)));

  const totals = model?.spellSlotTotals || character.spellcasting?.spell_slots || {};
  const ranks = Object.keys(totals)
    .map(Number)
    .filter((r) => r > 0 && (totals[r] || 0) > 0)
    .sort((a, b) => a - b);
  const note = slotNoteFor(character.spellcasting);

  // Steppers move HP only: temp is never spent or granted by a nudge, and the
  // clamp is to [0, max] so a tap can neither overheal nor push past 0 into the
  // dying track (that is an encounter decision, not a downtime one).
  const stepHp = (delta) => {
    const next = Math.max(0, Math.min(max, current + delta));
    if (next === current) return;
    const value = { ...hp, current: next, damageType: undefined };
    writeLocal(syncKey(RELAY.HP, character.id), value);
    sendUpdate(character.id, RELAY.HP, value, { force: true });
  };

  return (
    <div
      className="dock-dt-res-row"
      style={{ '--x-theme': color }}
      data-testid={`dock-dt-res-${character.id}`}
    >
      <div className="dock-dt-res-who">
        <span className="dock-dt-res-dot" aria-hidden="true" />
        <span className="dock-dt-res-id">
          <span className="dock-dt-res-name">{character.name}</span>
          <span className="dock-dt-res-class">{model?.characterClass || character.class}</span>
        </span>
      </div>

      {/* HpFx is purely presentational — it watches hp.current/hp.temp locally
          and plays the damage/heal flash + floating number on any change,
          whoever wrote the key (a stepper here, a Foundry hit, a healing
          potion on the player's device). */}
      <HpFx hp={hp} className="dock-dt-res-hp">
        <button
          type="button"
          className="dock-dt-step"
          aria-label={`Reduce ${character.name}'s HP by ${HP_STEP}`}
          disabled={current <= 0}
          onClick={() => stepHp(-HP_STEP)}
        >
          −
        </button>
        <span className="dock-dt-res-hp-gauge">
          <span className="dock-dt-res-hp-label">
            HP
            <strong className="dock-dt-res-hp-value">{current} / {max}</strong>
          </span>
          <span className={`dock-dt-bar dock-dt-res-bar dock-dt-res-bar--${tone}`}>
            <span className="dock-dt-bar-fill" style={{ '--rp-pct': `${pct}%` }} />
          </span>
        </span>
        <button
          type="button"
          className="dock-dt-step"
          aria-label={`Restore ${HP_STEP} HP to ${character.name}`}
          disabled={current >= max}
          onClick={() => stepHp(HP_STEP)}
        >
          +
        </button>
      </HpFx>

      {/* A PC with no focus pool (most martials) gets an empty cell rather than
          an empty label — the grid column stays, the noise doesn't. */}
      <div className="dock-dt-res-focus">
        {focusMax > 0 && (
          <>
            <span className="dock-dt-res-label">Focus</span>
            <div className="dock-dt-res-pips">
              {Array.from({ length: focusMax }, (_, i) => (
                <span
                  key={i}
                  className={`dock-dt-res-pip${i < focusOpen ? ' dock-dt-res-pip--on' : ''}`}
                  aria-hidden="true"
                />
              ))}
              <span className="dock-dt-res-readout">{focusOpen} / {focusMax}</span>
            </div>
          </>
        )}
      </div>

      <div className="dock-dt-res-slots">
        <span className="dock-dt-res-label">Spell slots</span>
        <div className="dock-dt-res-slot-groups">
          {ranks.map((r) => {
            const total = totals[r] || 0;
            const open = Math.max(0, total - (Number(slotsSpent?.[r]) || 0));
            return (
              <span key={r} className="dock-dt-res-slot-group">
                <span className="dock-dt-res-rank">{rankLabel(r)}</span>
                {Array.from({ length: total }, (_, i) => (
                  <span
                    key={i}
                    className={`dock-dt-res-slot-pip${i < open ? ' dock-dt-res-slot-pip--on' : ''}`}
                    aria-hidden="true"
                  />
                ))}
              </span>
            );
          })}
          {note && <span className="dock-dt-res-note">{note}</span>}
        </div>
      </div>

      <button
        type="button"
        className="dock-dt-btn dock-dt-res-rest"
        aria-label={`Rest ${character.name}`}
        onClick={() => onRest(character)}
      >
        Rest
      </button>
    </div>
  );
};

const ResourcesView = () => {
  const { characters } = useContent();
  const { getState, sendUpdate } = useSession();
  const { gameDate, time, advanceHours, advanceMinutes } = useGameDate();
  const { appendEvent } = useSessionLog();
  const [confirming, setConfirming] = useState(false);

  const roster = characters || [];
  const nowSecs = () => toGameSeconds({ ...gameDate, ...time });

  // performDailyPrep for one PC, carrying their existing Eld attunement and
  // leaving `staffChoice` undefined so a prepared staff is merely refreshed —
  // the exact defaults PartyDailyPrepButton's party loop uses.
  const prepOne = (character, secs) =>
    performDailyPrep({
      character,
      getState,
      sendUpdate,
      nowSecs: secs,
      eldChoice: getState(character.id, APP.ELDATTUNE) || undefined,
    });

  const restOne = (character) => {
    const { summary } = prepOne(character, nowSecs());
    restoreHp(character, getState, sendUpdate);
    appendEvent({ type: 'rest', text: `GM: ${character.name} rested — full HP, ${summary}` });
  };

  // Focus only, for everyone: one Refocus activity is 10 minutes, and the whole
  // party refocuses in parallel, so the clock moves once. Written for every PC
  // rather than only the ones carrying spent points — the write is idempotent
  // and "the party refocused" should not depend on who happened to be dirty.
  const refocusParty = () => {
    roster.forEach((c) => {
      writeLocal(syncKey(APP.FOCUS, c.id), 0);
      sendUpdate(c.id, APP.FOCUS, 0, { force: true });
    });
    advanceMinutes(REFOCUS_MINUTES);
    appendEvent({ type: 'rest', text: `GM: party refocused (${REFOCUS_MINUTES} minutes)` });
  };

  const restParty = () => {
    const secs = nowSecs();
    roster.forEach((c) => {
      prepOne(c, secs);
      restoreHp(c, getState, sendUpdate);
    });
    // One clock advance and ONE log line for the whole party (the flooding the
    // per-PC line would cause is why PartyDailyPrepButton summarizes too).
    advanceHours(REST_HOURS);
    appendEvent({ type: 'rest', text: 'GM: party rested for the night — full HP and daily resources restored' });
    setConfirming(false);
  };

  return (
    <section className="dock-dt-view dock-dt-res-view" aria-label="Resources">
      <header className="dock-dt-head">
        <div className="dock-dt-title">
          <span className="dock-dt-kicker">Downtime</span>
          <h2 className="dock-dt-heading">Resources</h2>
        </div>
        <span className="dock-dt-count">Hit points, focus, spell slots</span>
      </header>

      {/* One row per PC, in roster order — which is also the order
          getCharacterColor keys off, so a PC's dot here matches their accent
          everywhere else in the app. */}
      <div className="dock-dt-view-body dock-dt-res-body">
        {roster.map((c, i) => (
          <ResourceRow key={c.id} character={c} color={getCharacterColor(i)} onRest={restOne} />
        ))}
      </div>

      <div className="dock-dt-footbar">
        <span className="dock-dt-footbar-copy">
          A night&apos;s rest restores full HP, all focus points and every spell slot, and advances
          the clock 8 hours.
        </span>
        <button
          type="button"
          className="dock-dt-btn dock-dt-btn--arcane"
          onClick={refocusParty}
        >
          Refocus party
        </button>
        <button
          type="button"
          className="dock-dt-btn dock-dt-btn--primary dock-dt-res-rest-all"
          onClick={() => setConfirming(true)}
        >
          Rest for the night
        </button>
      </div>

      {/* Destructive to in-flight encounter state (it zeroes spent slots, focus
          and wand uses for everyone), so it goes through ConfirmDialog like
          every other irreversible GM action on the dock. */}
      <ConfirmDialog
        isOpen={confirming}
        title="Rest for the night"
        message="Restore full HP, all focus points, every spell slot, staff charges, wand uses and daily abilities for the whole party, and advance the clock 8 hours. Existing Eld attunements are kept."
        confirmLabel="Rest the party"
        danger={false}
        onConfirm={restParty}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
};

export default ResourcesView;
