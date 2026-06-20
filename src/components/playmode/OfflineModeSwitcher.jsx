import React from 'react';
import { usePlayMode } from '../../hooks/usePlayMode';
import { PLAY_MODES } from '../../data/playModes';
import PlayModeBadge from './PlayModeBadge';
import './OfflineModeSwitcher.css';

// The mode indicator in the character header. When live it's the read-only
// PlayModeBadge. In the offline sandbox (#554) it becomes an interactive
// switcher so players can roam encounter / exploration / downtime locally
// without the GM or Foundry driving the mode. Unlike the GM's PlayModeControl,
// Encounter is selectable here — offline it just renders the "No Active
// Encounter" idle state (CharacterSheet handles the missing live encounter).
const ORDER = ['exploration', 'encounter', 'downtime'];

const OfflineModeSwitcher = () => {
  const { mode, sandbox, localMode, setLocalMode } = usePlayMode();

  if (!sandbox) return <PlayModeBadge />;

  return (
    <div className="offline-mode-switcher" role="group" aria-label="Sandbox play mode">
      <span className="offline-mode-hint" title="Foundry isn’t connected — explore offline; nothing is saved">
        Sandbox
      </span>
      <div className="offline-mode-pills">
        {ORDER.map((id) => {
          const def = PLAY_MODES[id];
          // Reflect the effective mode so the active pill is right even before
          // the player picks (falls back to the last-synced GM mode).
          const active = mode === id;
          return (
            <button
              key={id}
              type="button"
              className={`offline-mode-pill offline-mode-pill--${id}${active ? ' offline-mode-pill--active' : ''}`}
              aria-pressed={active}
              onClick={() => setLocalMode(id)}
            >
              <i className={`ti ${def.icon}`} aria-hidden="true" />
              {def.label}
            </button>
          );
        })}
        {localMode && (
          <button
            type="button"
            className="offline-mode-reset"
            onClick={() => setLocalMode(null)}
            aria-label="Reset to the GM's last-set mode"
            title="Follow the GM's last-set mode"
          >
            Follow GM
          </button>
        )}
      </div>
    </div>
  );
};

export default OfflineModeSwitcher;
