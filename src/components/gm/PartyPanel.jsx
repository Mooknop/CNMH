import React from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useCharacterLiveState } from '../../hooks/useCharacterLiveState';
import { useGameDate } from '../../contexts/GameDateContext';
import { formatLiveValue } from '../../utils/liveStateRegistry';
import { collectCooldowns, collectImmunities } from '../../utils/partyCooldowns';
import { toGameSeconds, formatAvailableAt } from '../../utils/gameTime';
import { getCharacterColor } from '../../utils/CharacterUtils';

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
// Compact, read-only "what does everyone have left" board. Both bands are
// driven off liveStateRegistry so they never drift from the inspector: a chip
// is rendered only when the PC actually has that key (graceful degrade — rows
// omit pools a character/feature doesn't use). Labels are short on purpose so
// the row stays glanceable; the inspector (#229) carries the full names.

// Resource pools — value is the point, so show whenever the key is present.
const RESOURCE_CHIPS = [
  { type: 'heropoints',  label: 'Hero'  },
  { type: 'focus',       label: 'Focus' },
  { type: 'slots',       label: 'Slots' },
  { type: 'staff',       label: 'Staff' },
  { type: 'wands',       label: 'Wands' },
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
  return { key: 'reaction', label: 'Reaction', value: spent ? 'spent' : 'ready', spent };
};

// ─── Single-character row ────────────────────────────────────
// Hooks must be called at component top level — one PartyMemberRow
// per character so each can subscribe to its own live state. nowSecs is
// threaded from the panel so every row reads one shared clock snapshot.
const PartyMemberRow = ({ character, color, nowSecs }) => {
  const { liveState } = useCharacterLiveState(character.id);
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
      label: c.label,
      value: formatLiveValue(c.type, liveState[c.type], character),
    }));
  const reaction = reactionChip(liveState.turnstate);
  if (reaction) chips.push(reaction);

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
      style={{ '--x-theme': color, '--hp-pct': `${pct}%` }}
      data-testid={`party-row-${character.id}`}
    >
      <div className="gm-party-head">
        <span className="gm-party-name">{character.name}</span>
        <div className="gm-party-bar" aria-hidden="true">
          <div className="gm-party-fill" />
        </div>
        <span className="gm-party-hp" aria-label={`hp-${character.id}`}>
          {current}/{max}
          {temp > 0 && (
            <span className="gm-party-temp-label">+{temp}</span>
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
      </div>

      {chips.length > 0 && (
        <ul className="gm-party-chips" aria-label={`resources-${character.id}`}>
          {chips.map((c) => (
            <li
              className={`gm-party-chip${c.spent ? ' is-spent' : ''}`}
              key={c.key}
              data-testid={`party-chip-${character.id}-${c.key}`}
            >
              <span className="gm-party-chip-label">{c.label}</span>
              <span className="gm-party-chip-value">{c.value}</span>
            </li>
          ))}
        </ul>
      )}

      {pills.length > 0 && (
        <ul className="gm-party-pills" aria-label={`state-${character.id}`}>
          {pills.map((p) => (
            <li
              className="gm-party-pill"
              key={p.type}
              data-testid={`party-pill-${character.id}-${p.type}`}
            >
              <span className="gm-party-pill-label">{p.label}</span>
              <span className="gm-party-pill-value">{p.value}</span>
            </li>
          ))}
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
  const { gameDate, time } = useGameDate();
  const roster = Array.isArray(characters) ? characters : [];

  // One shared clock snapshot for every row's cooldown/immunity math.
  const nowSecs = toGameSeconds({ ...gameDate, ...time });

  return (
    <section className="gm-dash-panel gm-party-panel" aria-label="Party">
      <h2>Party</h2>
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
            />
          ))}
        </ul>
      )}
    </section>
  );
};

export default PartyPanel;
