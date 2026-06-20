import React from 'react';
import { useTake10 } from '../../hooks/useTake10';
import './Take10Prompt.css';

// The "Take 10 in progress" fly-up that appears on every player's sheet while a
// Take 10 is active (#560, epic #536). Slice 1 is the coordination spine: each
// player toggles Ready, and a derived all-ready gate (watched GM-side in
// PlayModeControl) advances the clock centrally. The per-player activity
// allocation list lands in Slice 2.
const Take10Prompt = ({ character, characterColor }) => {
  const charId = character?.id;
  const { active, minutes, ready, setReady, readyCount, ids } = useTake10(charId);

  if (!active) return null;

  const themeColor = characterColor || 'var(--color-theme)';
  const total = ids.length;

  return (
    <div
      className="t10-prompt"
      style={{ '--t10-theme': themeColor }}
      role="region"
      aria-label="Take 10 in progress"
    >
      <div className="t10-header">
        <span className="t10-eyebrow">Take 10</span>
        <span className="t10-minutes">{minutes} min</span>
      </div>

      <p className="t10-blurb">
        The party is taking {minutes} minutes. Mark yourself ready when you've
        settled what you're doing.
      </p>

      <div className="t10-footer">
        <span className="t10-count" aria-label="players ready">
          {readyCount} / {total} ready
        </span>
        <button
          type="button"
          className={`t10-ready-btn${ready ? ' t10-ready-btn--on' : ''}`}
          onClick={() => setReady(!ready)}
          aria-pressed={ready}
        >
          {ready ? '✓ Ready' : 'Ready'}
        </button>
      </div>
    </div>
  );
};

export default Take10Prompt;
