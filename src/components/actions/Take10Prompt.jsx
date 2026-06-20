import React from 'react';
import { useTake10 } from '../../hooks/useTake10';
import { useCharacter } from '../../hooks/useCharacter';
import { availableTake10Activities } from '../../data/take10Activities';
import './Take10Prompt.css';

// The "Take 10 in progress" fly-up that appears on every player's sheet while a
// Take 10 is active (epic #536). Slice 2 (#561) adds the per-player allocation:
// each player stacks 10-minute+ activities into their own block, with a live
// "X of Y min" budget meter where Y is the party-max (a longer activity widens
// the budget for everyone). Effect resolution lands in Slice 3 (#562) — here we
// only record the allocation.
const Take10Prompt = ({ character, characterColor }) => {
  const charId = character?.id;
  const {
    active, minutes, myMinutes, activities, ready, setReady,
    addActivity, removeActivity, readyCount, ids,
  } = useTake10(charId);
  const model = useCharacter(character);

  if (!active) return null;

  const themeColor = characterColor || 'var(--color-theme)';
  const total = ids.length;
  const available = availableTake10Activities(model);
  const fillPct = minutes > 0 ? Math.min(100, Math.round((myMinutes / minutes) * 100)) : 0;

  return (
    <div
      className="t10-prompt"
      style={{ '--t10-theme': themeColor }}
      role="region"
      aria-label="Take 10 in progress"
    >
      <div className="t10-header">
        <span className="t10-eyebrow">Take 10</span>
        <span className="t10-minutes">{minutes} min block</span>
      </div>

      {/* Budget meter — how full this player's block is vs the party-max. */}
      <div className="t10-budget">
        <div className="t10-budget-bar" aria-hidden="true">
          <div className="t10-budget-fill" style={{ width: `${fillPct}%` }} />
        </div>
        <span className="t10-budget-label">{myMinutes} / {minutes} min allocated</span>
      </div>

      {/* This player's stacked allocation. */}
      {activities.length > 0 && (
        <ul className="t10-stack">
          {activities.map((a, i) => (
            <li key={i} className="t10-stack-item">
              <span className="t10-stack-name">{a.label}</span>
              <span className="t10-stack-min">{a.minutes} min</span>
              <button
                type="button"
                className="t10-remove"
                onClick={() => removeActivity(i)}
                aria-label={`Remove ${a.label}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Available activities to add (eligibility-filtered). */}
      <div className="t10-available">
        {available.length === 0 ? (
          <p className="t10-empty">No 10-minute activities available to you.</p>
        ) : (
          available.map((a) => (
            <button
              key={a.id}
              type="button"
              className="t10-add"
              onClick={() => addActivity({ id: a.id, label: a.name, minutes: a.minutes })}
              title={a.note}
            >
              <span className="t10-add-name">{a.name}</span>
              <span className="t10-add-min">+{a.minutes}m</span>
            </button>
          ))
        )}
      </div>

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
