import React from 'react';
import { useEffects } from '../../hooks/useEffects';
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
  const { effects: effectCatalog, characters } = useContent();
  const { gameDate, time } = useGameDate();
  const nowSecs = toGameSeconds({ ...gameDate, ...time });
  const getEffect = (id) => (effectCatalog || []).find((e) => e.id === id) || null;
  const getCharName = (id) => (characters || []).find((c) => c.id === id)?.name || null;

  if (effects.length === 0) return null;

  return (
    <div className="effects-panel" aria-label="Active effects">
      <div className="effects-panel-header">
        <span className="effects-panel-title">
          EFFECTS
        </span>
        <span className="effects-panel-count">{effects.length}</span>
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
      </ul>
    </div>
  );
};

export default EffectsPanel;
