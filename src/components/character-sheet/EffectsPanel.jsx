import React from 'react';
import { useEffects } from '../../hooks/useEffects';
import { useContent } from '../../contexts/ContentContext';
import './EffectsPanel.css';
import { expiryLabel } from '../../utils/expiry';
import { IMMUNITY_EFFECT_ID } from '../../utils/treatWounds';

const EffectsPanel = ({ charId, themeColor }) => {
  const { effects, removeEffect } = useEffects(charId);
  const { effects: effectCatalog, characters } = useContent();
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
          const name = def ? def.name : entry.effectId;
          const expLabel = expiryLabel(entry.expireAt);
          const healerName = entry.effectId === IMMUNITY_EFFECT_ID && entry.appliedBy
            ? getCharName(entry.appliedBy)
            : null;
          const displayName = healerName ? `${name} — from ${healerName}` : name;
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
