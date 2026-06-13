import React from 'react';
import { useEffects } from '../../hooks/useEffects';
import { useSustains } from '../../hooks/useSustains';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import './EffectsPanel.css';
import { expiryLabel, expiryLabelSecs } from '../../utils/expiry';
import { toGameSeconds } from '../../utils/gameTime';
import { IMMUNITY_EFFECT_ID } from '../../utils/treatWounds';
import { ABILITY_IMMUNITY_EFFECT_ID } from '../../utils/immunity';

const FROM_NAME_EFFECT_IDS = [IMMUNITY_EFFECT_ID, ABILITY_IMMUNITY_EFFECT_ID];

const EffectsPanel = ({ charId, themeColor }) => {
  const { effects, removeEffect } = useEffects(charId);
  const { sustains, end: endSustain } = useSustains(charId);
  const { effects: effectCatalog, characters } = useContent();
  const { gameDate, time } = useGameDate();
  const nowSecs = toGameSeconds({ ...gameDate, ...time });
  const getEffect = (id) => (effectCatalog || []).find((e) => e.id === id) || null;
  const getCharName = (id) => (characters || []).find((c) => c.id === id)?.name || null;

  if (effects.length === 0 && sustains.length === 0) return null;

  return (
    <div className="effects-panel" aria-label="Active effects">
      <div className="effects-panel-header">
        <span className="effects-panel-title">
          EFFECTS
        </span>
        <span className="effects-panel-count">{effects.length + sustains.length}</span>
      </div>
      <ul className="effects-panel-list">
        {effects.map((entry) => {
          const def = getEffect(entry.effectId);
          const baseName = def ? def.name : entry.effectId;
          // Ability immunity carries its source ability ("Immune: Guidance").
          const name = entry.effectId === ABILITY_IMMUNITY_EFFECT_ID && entry.source
            ? `${baseName}: ${entry.source}`
            : baseName;
          // Clock-based expiry (immunity timers) takes precedence over the
          // encounter-boundary label when present.
          const expLabel = typeof entry.expireAtSecs === 'number'
            ? expiryLabelSecs(entry.expireAtSecs, nowSecs)
            : expiryLabel(entry.expireAt);
          const sourceName = FROM_NAME_EFFECT_IDS.includes(entry.effectId) && entry.appliedBy
            ? getCharName(entry.appliedBy)
            : null;
          const displayName = sourceName ? `${name} — from ${sourceName}` : name;
          return (
            <li key={entry.id} className="effects-panel-item">
              <span className="effects-panel-name">{displayName}</span>
              {expLabel && (
                <span className="effects-panel-expiry" title={`Expires: ${expLabel}`}>
                  {expLabel}
                </span>
              )}
              <button
                className="effects-panel-remove"
                onClick={() => removeEffect(entry.id)}
                aria-label={`Remove ${displayName}`}
                title={`Remove ${displayName}`}
              >
                ×
              </button>
            </li>
          );
        })}
        {/* Sustained spells (#220) — visible off-turn; End mirrors the caster's
            turn prompt by writing the same cnmh_sustains_<charId> ledger. */}
        {sustains.map((s) => (
          <li key={s.id} className="effects-panel-item effects-panel-item--sustain">
            <span className="effects-panel-name">{s.spellName}</span>
            <span className="effects-panel-tag" title="Sustained spell">sustained</span>
            <button
              className="effects-panel-remove"
              onClick={() => endSustain(s.id)}
              aria-label={`End ${s.spellName}`}
              title={`End ${s.spellName}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default EffectsPanel;
