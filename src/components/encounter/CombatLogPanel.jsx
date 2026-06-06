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
  const bottomRef = useRef(null);

  const log = encounter?.log || [];

  useEffect(() => {
    if (open && bottomRef.current && bottomRef.current.scrollIntoView) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        <ol className="combat-log-list" aria-label="Log entries">
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
          <li ref={bottomRef} aria-hidden="true" style={{ listStyle: 'none' }} />
        </ol>
      )}
    </div>
  );
};

export default CombatLogPanel;
