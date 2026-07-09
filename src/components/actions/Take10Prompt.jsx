import React, { useState } from 'react';
import { useTake10 } from '../../hooks/useTake10';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { availableTake10Activities, itemTake10Activities } from '../../data/take10Activities';
import { affixedKey } from '../../utils/affix';
import './Take10Prompt.css';
import { APP, syncKey } from '../../sync/keys';

// Finalize a picker selection into the allocation entry the resolver consumes.
// Item entries snapshot everything the (inventory-blind) GM resolver needs.
const buildItemEntry = (activity, target) => {
  const base = {
    id: activity.id,
    kind: activity.kind,
    label: `${activity.label} → ${target.name}`,
    minutes: activity.minutes,
    itemName: activity.itemName,
  };
  return activity.kind === 'oil'
    ? { ...base, itemUid: activity.itemUid, targetUid: target.uid, targetName: target.name, meta: activity.meta }
    : { ...base, talismanUid: activity.talismanUid, hostUid: target.uid, hostName: target.name };
};

// The "Take 10 in progress" fly-up that appears on every player's sheet while a
// Take 10 is active (epic #536). Each player stacks 10-minute+ activities into
// their own block, with a live "X of Y min" budget meter where Y is the
// party-max (a longer activity widens the budget for everyone). On all-ready the
// GM resolves the block (PlayModeControl → resolveTake10).
//
// Item-targeted consumables (#566) — 10-minute oils and unaffixed talismans —
// surface from inventory and need a target before they can be allocated: tapping
// one opens an inline picker (which weapon/armor/item), and the chosen target is
// carried on the entry so the resolver can run applyItemEffect / affix.
const Take10Prompt = ({ character, characterColor }) => {
  const charId = character?.id;
  const {
    active, minutes, myMinutes, activities, ready, setReady,
    addActivity, removeActivity, readyCount, allReady, ids,
  } = useTake10(charId);
  const model = useCharacter(character);
  const [consumed] = useSyncedState(syncKey(APP.CONSUMED, charId || 'nobody'), {});
  const [affixed] = useSyncedState(affixedKey(charId || 'nobody'), {});

  // The item activity awaiting a target pick (inline picker), or null.
  const [pending, setPending] = useState(null);

  if (!active) return null;

  const themeColor = characterColor || 'var(--color-theme)';
  const total = ids.length;
  const available = availableTake10Activities(model);
  const itemActivities = itemTake10Activities(model, { consumed, affixed });
  const fillPct = minutes > 0 ? Math.min(100, Math.round((myMinutes / minutes) * 100)) : 0;

  const pickTarget = (target) => {
    addActivity(buildItemEntry(pending, target));
    setPending(null);
  };

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
          <div className="t10-budget-fill" style={{ '--t10-fill': `${fillPct}%` }} />
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

      {pending ? (
        /* Inline target picker for the item activity being added. */
        <div className="t10-picker" role="group" aria-label={`Target for ${pending.label}`}>
          <div className="t10-picker-head">
            <span className="t10-picker-title">{pending.label} — pick a target</span>
            <button type="button" className="t10-picker-cancel" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
          {pending.targets.length === 0 ? (
            <p className="t10-empty">No valid target in your inventory.</p>
          ) : (
            <div className="t10-picker-targets" role="radiogroup" aria-label="Target item">
              {pending.targets.map((t) => (
                <button
                  key={t.uid}
                  type="button"
                  className="t10-picker-target"
                  onClick={() => pickTarget(t)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Available activities to add (eligibility-filtered + item-derived). */
        <div className="t10-available">
          {available.length === 0 && itemActivities.length === 0 ? (
            <p className="t10-empty">No 10-minute activities available to you.</p>
          ) : (
            <>
              {available.map((a) => (
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
              ))}
              {itemActivities.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="t10-add t10-add--item"
                  onClick={() => setPending(a)}
                  title={a.note}
                >
                  <span className="t10-add-name">{a.label}…</span>
                  <span className="t10-add-min">+{a.minutes}m</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {allReady && (
        <p className="t10-waiting">Everyone's ready — waiting for the GM to resolve…</p>
      )}

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
