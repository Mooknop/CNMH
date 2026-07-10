import React, { useState } from 'react';
import ConfirmDialog from '../shared/ConfirmDialog';
import HpFx from '../shared/HpFx';
import { useFxBloom } from '../../hooks/useFxChannel';
import { useContent } from '../../contexts/ContentContext';
import { useSession } from '../../contexts/SessionContext';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useCharacterLiveState } from '../../hooks/useCharacterLiveState';
import { useCharacter } from '../../hooks/useCharacter';
import { formatSpeedBreakdown } from '../../utils/speed';
import { useGameDate } from '../../contexts/GameDateContext';
import { formatLiveValue, getLiveStateDescriptor } from '../../utils/liveStateRegistry';
import { collectCooldowns, collectImmunities } from '../../utils/partyCooldowns';
import { performEncounterSweep } from '../../utils/partySweep';
import { clearUse } from '../../utils/frequency';
import { toGameSeconds, formatAvailableAt } from '../../utils/gameTime';
import { getCharacterColor } from '../../utils/CharacterUtils';
import { syncKey } from '../../sync/keys';

// ─── HP status tier ──────────────────────────────────────────
// Used as a data-status attribute so CSS can colour the bar
// without any inline style on the fill element.
const hpStatus = (current, max) => {
  if (max <= 0) return 'full';
  if (current <= 0) return 'dead';
  const pct = current / max;
  if (pct <= 0.25) return 'critical';
  if (pct <= 0.5) return 'low';
  return 'full';
};

// ─── Resource read-out (#230, slice 1) ───────────────────────
// Compact "what does everyone have left" board. Both bands are driven off
// liveStateRegistry so they never drift from the inspector: a chip is rendered
// only when the PC actually has that key (graceful degrade — rows omit pools a
// character/feature doesn't use). Labels are short on purpose so the row stays
// glanceable; the inspector (#229) carries the full names. Slice 3 adds inline
// quick actions (±1 / end / clear) that reuse the registry's `edit` helpers.

// Resource pools — value is the point, so show whenever the key is present.
const RESOURCE_CHIPS = [
  { type: 'heropoints',  label: 'Hero'  },
  { type: 'focus',       label: 'Focus' },
  { type: 'slots',       label: 'Slots' },
  { type: 'staff',       label: 'Staff' },
  { type: 'wands',       label: 'Wands' },
  { type: 'itemhp',      label: 'Gear'  },
  { type: 'shieldstate', label: 'Shield' },
  { type: 'consumed',    label: 'Used'  },
];

// Combat/class flags — skipped when their formatter reports an empty state,
// so the strip only shows what's actually active.
const STATE_PILLS = [
  { type: 'stance',    label: 'Stance' },
  { type: 'aura',      label: 'Aura'   },
  { type: 'huntprey',  label: 'Prey'   },
  { type: 'omen',      label: 'Omen'   },
  { type: 'eldattune', label: 'Eld'    },
  { type: 'sustains',  label: 'Sustain' },
];

// Formatter "nothing here" sentinels — a present-but-inactive flag.
const EMPTY_VALUES = new Set(['none', 'off', 'lowered', '']);

// Reaction lives inside turnstate; surface just the at-a-glance bit.
const reactionChip = (turnstate) => {
  if (turnstate == null) return null;
  const spent = turnstate.reactionSpent || turnstate.reactionAvailable === false;
  return { key: 'reaction', type: null, label: 'Reaction', value: spent ? 'spent' : 'ready', spent };
};

// ── Inline-action resolvers (reuse the registry edit helpers) ──
// A ±1 nudge config for a numeric pool/count chip, or null if it isn't one
// the board edits inline (e.g. slots is per-rank, staff has no clear max →
// those jump to the inspector instead).
const nudgeFor = (type, liveState, character, write) => {
  const ed = getLiveStateDescriptor(type)?.edit;
  const label = getLiveStateDescriptor(type)?.label || type;
  const cur = liveState[type];
  if (ed?.kind === 'count') {
    const n = ed.read(cur);
    return {
      decDisabled: n <= 0,
      dec: () => write(type, ed.write(Math.max(0, n - 1)), `set ${label} to ${Math.max(0, n - 1)}`),
      inc: () => write(type, ed.write(n + 1), `set ${label} to ${n + 1}`),
    };
  }
  if (ed?.kind === 'pool') {
    const { spent, max } = ed.read(cur, character);
    if (max == null) return null;
    const remaining = Math.max(0, max - spent);
    const setR = (r) => {
      const rr = Math.max(0, Math.min(max, r));
      write(type, ed.write(max - rr), `set ${label} to ${rr}/${max}`);
    };
    return {
      decDisabled: remaining <= 0,
      incDisabled: remaining >= max,
      dec: () => setR(remaining - 1),
      inc: () => setR(remaining + 1),
    };
  }
  return null;
};

// An "end" handler for a combat/class flag pill, or null if it isn't a simple
// clear/toggle (lists like sustains stay in the inspector).
const endFor = (type, liveState, write) => {
  const desc = getLiveStateDescriptor(type);
  const ed = desc?.edit;
  const cur = liveState[type];
  if (ed?.kind === 'clear') return () => write(type, ed.write(), `cleared ${desc.label}`);
  if (ed?.kind === 'toggle') return () => write(type, ed.write(cur, false), `turned ${desc.label} off`);
  return null;
};

// ─── Single-character row ────────────────────────────────────
// Hooks must be called at component top level — one PartyMemberRow per
// character so each can subscribe to its own live state. nowSecs is threaded
// from the panel so every row reads one shared clock snapshot; write is the
// panel's per-character persist+log helper.
const PartyMemberRow = ({ character, color, nowSecs, write }) => {
  const { liveState } = useCharacterLiveState(character.id);
  // Derived Speed (#1223) — the same spine the sheet renders, so the GM sees
  // WHY a PC is at 15 ft (armor + encumbered) from the chip's tooltip.
  const derivedSpeed = useCharacter(character)?.speed ?? null;
  // Juice (#1346): the row blooms in the PC's accent when they use an ability.
  // No bloom-key remount here — the HpFx child holds live flash state.
  const bloom = useFxBloom(character.id);
  const hp = liveState.hp;

  const current = hp?.current ?? character.maxHp ?? 0;
  const max     = hp?.max     ?? character.maxHp ?? 0;
  const temp    = hp?.temp    ?? 0;
  const dying   = hp?.dying   ?? 0;
  const wounded = hp?.wounded ?? 0;

  const pct    = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const status = hpStatus(current, max);

  const chips = RESOURCE_CHIPS
    .filter((c) => c.type in liveState)
    .map((c) => ({
      key: c.type,
      type: c.type,
      label: c.label,
      value: formatLiveValue(c.type, liveState[c.type], character),
    }));
  const reaction = reactionChip(liveState.turnstate);
  if (reaction) chips.push(reaction);
  // Speed chip (#1223): spine-derived, read-only (no registry key to edit);
  // the tooltip carries the labeled breakdown.
  if (derivedSpeed && derivedSpeed.total > 0) {
    chips.push({
      key: 'speed',
      type: null,
      label: 'Speed',
      value: `${derivedSpeed.total} ft`,
      title: formatSpeedBreakdown(derivedSpeed),
    });
  }

  const pills = STATE_PILLS
    .filter((p) => p.type in liveState)
    .map((p) => ({ ...p, value: formatLiveValue(p.type, liveState[p.type], character) }))
    .filter((p) => !EMPTY_VALUES.has(String(p.value).trim().toLowerCase()));

  // Clock-derived ready-at timers (#230 slice 2): window cooldowns from the
  // freq ledger + ability/treat-wounds immunities from effects.
  const cooldowns  = collectCooldowns(character, liveState.freq, { nowSecs });
  const immunities = collectImmunities(liveState.effects, nowSecs);
  const hasTimers  = cooldowns.length > 0 || immunities.length > 0;

  // --x-theme: per-character accent (allowed dynamic bridge)
  // --hp-pct: fill width as a CSS custom property (avoids inline width)
  return (
    <li
      className="gm-party-row"
      data-status={status}
      data-fx={bloom ? 'bloom' : undefined}
      style={{ '--x-theme': color, '--hp-pct': `${pct}%` }}
      data-testid={`party-row-${character.id}`}
    >
      <HpFx hp={hp} className="gm-party-head">
        <span className="gm-party-name">{character.name}</span>
        <div className="gm-party-bar" aria-hidden="true">
          <div className="gm-party-fill" />
        </div>
        <span className="gm-party-hp" aria-label={`hp-${character.id}`}>
          {current}/{max}
          {temp > 0 && (
            <span className="gm-party-temp-label hp-fx-temp">+{temp}</span>
          )}
        </span>
        {dying > 0 && (
          <span
            className="gm-party-badge gm-party-dying"
            aria-label={`dying-${character.id}`}
          >
            Dying {dying}
          </span>
        )}
        {wounded > 0 && dying === 0 && (
          <span
            className="gm-party-badge gm-party-wounded"
            aria-label={`wounded-${character.id}`}
          >
            Wounded {wounded}
          </span>
        )}
      </HpFx>

      {chips.length > 0 && (
        <ul className="gm-party-chips" aria-label={`resources-${character.id}`}>
          {chips.map((c) => {
            const nudge = c.type ? nudgeFor(c.type, liveState, character, write) : null;
            return (
              <li
                className={`gm-party-chip${c.spent ? ' is-spent' : ''}`}
                key={c.key}
                title={c.title}
                data-testid={`party-chip-${character.id}-${c.key}`}
              >
                <span className="gm-party-chip-label">{c.label}</span>
                {nudge ? (
                  <span className="gm-party-chip-edit">
                    <button
                      type="button"
                      className="gm-party-mini-btn"
                      aria-label={`decrease ${c.label} for ${character.name}`}
                      disabled={nudge.decDisabled}
                      onClick={nudge.dec}
                    >−</button>
                    <span className="gm-party-chip-value">{c.value}</span>
                    <button
                      type="button"
                      className="gm-party-mini-btn"
                      aria-label={`increase ${c.label} for ${character.name}`}
                      disabled={nudge.incDisabled}
                      onClick={nudge.inc}
                    >+</button>
                  </span>
                ) : (
                  <span className="gm-party-chip-value">{c.value}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pills.length > 0 && (
        <ul className="gm-party-pills" aria-label={`state-${character.id}`}>
          {pills.map((p) => {
            const end = endFor(p.type, liveState, write);
            return (
              <li
                className="gm-party-pill"
                key={p.type}
                data-testid={`party-pill-${character.id}-${p.type}`}
              >
                <span className="gm-party-pill-label">{p.label}</span>
                <span className="gm-party-pill-value">{p.value}</span>
                {end && (
                  <button
                    type="button"
                    className="gm-party-mini-btn gm-party-pill-end"
                    aria-label={`end ${p.label} for ${character.name}`}
                    onClick={end}
                  >×</button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hasTimers && (
        <ul className="gm-party-timers" aria-label={`timers-${character.id}`}>
          {cooldowns.map((c) => (
            <li
              className="gm-party-timer gm-party-timer--cooldown"
              key={`cd-${c.key}`}
              data-testid={`party-cooldown-${character.id}-${c.key}`}
            >
              <span className="gm-party-timer-name">{c.name}</span>
              <span className="gm-party-timer-when">
                ready {formatAvailableAt(c.availableAtSecs, nowSecs)}
              </span>
              <button
                type="button"
                className="gm-party-mini-btn gm-party-timer-clear"
                aria-label={`clear cooldown ${c.name} for ${character.name}`}
                onClick={() => write('freq', clearUse(liveState.freq, c.key), `cleared cooldown: ${c.name}`)}
              >×</button>
            </li>
          ))}
          {immunities.map((i) => (
            <li
              className="gm-party-timer gm-party-timer--immunity"
              key={`imm-${i.id}`}
              data-testid={`party-immunity-${character.id}-${i.id}`}
            >
              <span className="gm-party-timer-name">Immune: {i.label}</span>
              <span className="gm-party-timer-when">
                until {formatAvailableAt(i.expireAtSecs, nowSecs)}
              </span>
              <button
                type="button"
                className="gm-party-mini-btn gm-party-timer-clear"
                aria-label={`end immunity ${i.label} for ${character.name}`}
                onClick={() => write('effects', (liveState.effects || []).filter((e) => e.id !== i.id), `ended immunity: ${i.label}`)}
              >×</button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

// ─── Party Panel ─────────────────────────────────────────────
const PartyPanel = () => {
  const { characters } = useContent();
  const { getState, sendUpdate } = useSession();
  const { appendEvent } = useSessionLog();
  const { gameDate, time } = useGameDate();
  const [sweeping, setSweeping] = useState(false);
  const roster = Array.isArray(characters) ? characters : [];

  // One shared clock snapshot for every row's cooldown/immunity math.
  const nowSecs = toGameSeconds({ ...gameDate, ...time });

  // Per-character persist (+ log) helper — mirrors the inspector's writeFor so
  // inline corrections sync exactly like the player's own taps and stay
  // auditable in the session log.
  const writeFor = (character) => (type, value, logText) => {
    try {
      window.localStorage.setItem(syncKey(type, character.id), JSON.stringify(value));
    } catch { /* quota / serialization — sync still carries it */ }
    sendUpdate(character.id, type, value);
    if (logText) appendEvent({ type: 'gm', text: `GM: ${character.name} — ${logText}` });
  };

  const runSweep = () => {
    let changed = 0;
    roster.forEach((c) => {
      changed += performEncounterSweep({ character: c, getState, sendUpdate }).changed;
    });
    appendEvent({
      type: 'gm',
      text: changed
        ? 'GM: encounter-end sweep — cleared turn/combat state for the party'
        : 'GM: encounter-end sweep — nothing to clear',
    });
    setSweeping(false);
  };

  return (
    <section className="gm-dash-panel gm-party-panel" aria-label="Party">
      <div className="gm-party-panel-head">
        <h2>Party</h2>
        {roster.length > 0 && (
          <button
            type="button"
            className="gm-party-sweep-btn"
            onClick={() => setSweeping(true)}
          >
            End-encounter sweep
          </button>
        )}
      </div>

      {roster.length === 0 ? (
        <p className="gm-help">No characters in the roster yet.</p>
      ) : (
        <ul className="gm-party-list" aria-label="party-roster">
          {roster.map((c, i) => (
            <PartyMemberRow
              key={c.id}
              character={c}
              color={getCharacterColor(i)}
              nowSecs={nowSecs}
              write={writeFor(c)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={sweeping}
        title="End-encounter sweep"
        message="Clear every party member's turn economy, raised shield, stance, aura, Hunt Prey and sustained spells, and expire encounter-scoped effects. Conditions, daily resources and clock-based immunities are left untouched."
        confirmLabel="Sweep party"
        danger={false}
        onConfirm={runSweep}
        onCancel={() => setSweeping(false)}
      />
    </section>
  );
};

export default PartyPanel;
