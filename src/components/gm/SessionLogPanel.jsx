import React from 'react';
import { useSessionLog } from '../../hooks/useSessionLog';
import './SessionLogPanel.css';

const TYPE_LABELS = {
  mode:   'Mode',
  save:   'Save',
  recall: 'RK',
};

const formatTime = (ts) => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const SessionLogPanel = () => {
  const { log } = useSessionLog();

  return (
    <section className="gm-dash-panel gm-session-log" aria-label="Session Log">
      <h2>Session Log</h2>
      {log.length === 0 ? (
        <p className="gm-help">No events yet this session.</p>
      ) : (
        <ol className="gm-slog-list" aria-label="session log entries">
          {log.map((entry) => (
            <li key={entry.id} className={`gm-slog-entry gm-slog-entry--${entry.type || 'info'}`}>
              <span className="gm-slog-time" aria-hidden="true">{formatTime(entry.ts)}</span>
              <span className="gm-slog-badge">{TYPE_LABELS[entry.type] || entry.type}</span>
              <span className="gm-slog-text">{entry.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

export default SessionLogPanel;
