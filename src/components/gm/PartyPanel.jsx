import React from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
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

// ─── Single-character row ────────────────────────────────────
// Hooks must be called at component top level — one PartyMemberRow
// per character so each can call useSyncedState independently.
const PartyMemberRow = ({ character, color }) => {
  const [hp] = useSyncedState(
    `cnmh_hp_${character.id}`,
    () => ({
      current: character.maxHp || 0,
      max:     character.maxHp || 0,
      temp:    0,
      dying:   0,
      wounded: 0,
      doomed:  0,
    })
  );

  const current = hp?.current ?? character.maxHp ?? 0;
  const max     = hp?.max     ?? character.maxHp ?? 0;
  const temp    = hp?.temp    ?? 0;
  const dying   = hp?.dying   ?? 0;
  const wounded = hp?.wounded ?? 0;

  const pct    = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const status = hpStatus(current, max);

  // --x-theme: per-character accent (allowed dynamic bridge)
  // --hp-pct: fill width as a CSS custom property (avoids inline width)
  return (
    <li
      className="gm-party-row"
      data-status={status}
      style={{ '--x-theme': color, '--hp-pct': `${pct}%` }}
      data-testid={`party-row-${character.id}`}
    >
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
    </li>
  );
};

// ─── Party Panel ─────────────────────────────────────────────
const PartyPanel = () => {
  const { characters } = useContent();
  const roster = Array.isArray(characters) ? characters : [];

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
            />
          ))}
        </ul>
      )}
    </section>
  );
};

export default PartyPanel;
