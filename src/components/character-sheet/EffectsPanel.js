import React from 'react';
import { useEffects } from '../../hooks/useEffects';
import './EffectsPanel.css';
import { getEffect } from '../../data/pf2eEffects';

const EffectsPanel = ({ charId, themeColor }) => {
  const { effects, removeEffect } = useEffects(charId);

  if (effects.length === 0) return null;

  return (
    <div className="effects-panel" aria-label="Active effects">
      <div className="effects-panel-header">
        <span className="effects-panel-title" style={{ color: themeColor }}>
          EFFECTS
        </span>
        <span className="effects-panel-count">{effects.length}</span>
      </div>
      <ul className="effects-panel-list">
        {effects.map((entry) => {
          const def = getEffect(entry.effectId);
          const name = def ? def.name : entry.effectId;
          return (
            <li key={entry.id} className="effects-panel-item">
              <span className="effects-panel-name">{name}</span>
              <button
                className="effects-panel-remove"
                onClick={() => removeEffect(entry.id)}
                aria-label={`Remove ${name}`}
                title={`Remove ${name}`}
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
