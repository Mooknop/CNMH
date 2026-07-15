import React, { useEffect, useRef, useState } from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import './CombatLogPanel.css';

const TYPE_LABELS = {
  round: '⚔',
  turn: '▶',
  action: '•',
  system: '★',
};

const CombatLogPanel = () => {
  const { encounter } = useEncounter();
  const [open, setOpen] = useState(true);
  const listRef = useRef(null);

  const log = encounter?.log || [];

  // Keep the newest entry visible by scrolling the log's OWN list, never
  // scrollIntoView on a sentinel — that walks up every scrollable ancestor and
  // yanks the whole character-sheet page down to the bottom of this panel when
  // the log first hydrates (log.length 0 → N on FULL_STATE).
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [log.length, open]);

  if (!encounter || encounter.phase === 'idle') return null;

  return (
    <div className="combat-log-panel" role="region" aria-label="Combat log">
      <button
        className="combat-log-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Combat Log ({log.length})
        <span aria-hidden="true">{open ? ' ▲' : ' ▼'}</span>
      </button>

      {open && (
        <ol className="combat-log-list" aria-label="Log entries" ref={listRef}>
          {log.map((entry) => (
            <li
              key={entry.id}
              className={`combat-log-entry combat-log-entry--${entry.type || 'action'}`}
            >
              <span className="combat-log-icon" aria-hidden="true">
                {TYPE_LABELS[entry.type] || '•'}
              </span>
              <span className="combat-log-text">{entry.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default CombatLogPanel;
