// Roll toast (#1490 S3, riding the #1343 fx rails). When any character's
// actor-roll resolves — Foundry-delegated or manually typed — the confirm-time
// 'ability' fx event carries a compact `roll` payload (utils/rollToast) and
// every device in the party shows a short accent-themed card: who, what, the
// raw d20 face, the total, and a degree chip per judged target. Nat 20 blooms,
// nat 1 shakes (fx.css bindings, reduced-motion guarded there).
//
// Fire-and-forget like everything on the fx channel: the encounter log is the
// durable record; a missed toast costs nothing. Replay/staleness is
// useFxChannel's problem (id-dedup + 5s freshness + hydration baseline).
//
// D2 (#1575): the rail also floats DEVICE-LOCAL pending cards for in-flight
// dice-tower rolls (useFoundryDice → utils/pendingRolls bus — deliberately not
// the fx channel). A pending card shows "Rolling in Foundry…" until the ack
// lands, then settles into a normal result card (face + total; judged degree
// chips still arrive later on the confirm-time fx toast) — or vanishes on
// nack/timeout, where the input's manual entry is the story.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFxChannel } from '../../hooks/useFxChannel';
import { useContent } from '../../contexts/ContentContext';
import { degreeLabel, degreeClass } from '../../utils/degreeDisplay';
import { subscribePendingRolls } from '../../utils/pendingRolls';
import './RollToast.css';

// Longer than the 600ms one-shot juice: the card carries reading content.
export const ROLL_TOAST_MS = 4000;
const MAX_TOASTS = 3;

const RollToast = () => {
  const { characters } = useContent();
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Set());

  const push = useCallback((toast) => {
    setToasts((cur) => [...cur.slice(-(MAX_TOASTS - 1)), toast]);
    const t = setTimeout(() => {
      timersRef.current.delete(t);
      setToasts((cur) => cur.filter((x) => x.key !== toast.key));
    }, ROLL_TOAST_MS);
    timersRef.current.add(t);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  useFxChannel(
    useCallback((evt) => {
      if (evt.kind !== 'ability' || !evt.roll) return;
      push({ key: evt.id, charId: evt.charId, roll: evt.roll });
    }, [push])
  );

  // Pending dice-tower rolls (D2). The Map ref is the source of truth (the
  // settle handler needs the start event's charId/flavor); state mirrors it
  // for render. 'settle' converts the card into a normal toast via push().
  const [pendingRolls, setPendingRolls] = useState([]);
  const pendingMapRef = useRef(new Map());
  useEffect(() => subscribePendingRolls((evt) => {
    const map = pendingMapRef.current;
    if (evt.phase === 'start') {
      map.set(evt.id, { charId: evt.charId, flavor: evt.flavor, formula: evt.formula });
    } else {
      const meta = map.get(evt.id);
      map.delete(evt.id);
      if (evt.phase === 'settle' && meta) {
        push({
          key: `pending-${evt.id}`,
          charId: meta.charId,
          roll: { d20: evt.face, total: evt.total, flavor: meta.flavor || meta.formula },
        });
      }
    }
    setPendingRolls(Array.from(map, ([id, meta]) => ({ id, ...meta })));
  }), [push]);

  if (toasts.length === 0 && pendingRolls.length === 0) return null;

  return (
    <div className="roll-toast-rail" aria-live="polite">
      {pendingRolls.map((p) => {
        const who = (characters || []).find((c) => c && c.id === p.charId);
        return (
          <div
            key={`pending-${p.id}`}
            className="roll-toast roll-toast--pending"
            data-testid="roll-toast-pending"
            style={who?.color ? { '--color-theme': who.color } : undefined}
          >
            <div className="roll-toast-head">
              <span className="roll-toast-name">{who?.name || p.charId}</span>
              <span className="roll-toast-flavor">{p.flavor || p.formula}</span>
            </div>
            <div className="roll-toast-roll">
              <span className="roll-toast-die roll-toast-die--pending" aria-hidden="true">
                {p.formula || '1d20'}
              </span>
              <span className="roll-toast-pending-note">Rolling in Foundry…</span>
            </div>
          </div>
        );
      })}
      {toasts.map((t) => {
        const who = (characters || []).find((c) => c && c.id === t.charId);
        const { d20, total, flavor, attack, targets, more } = t.roll;
        const nat = d20 === 20 ? 'bloom' : d20 === 1 ? 'shake' : null;
        return (
          <div
            key={t.key}
            className="roll-toast"
            data-testid="roll-toast"
            style={who?.color ? { '--color-theme': who.color } : undefined}
          >
            <div className="roll-toast-head">
              <span className="roll-toast-name">{who?.name || t.charId}</span>
              <span className="roll-toast-flavor">{flavor}</span>
            </div>
            <div className="roll-toast-roll">
              {/* d20 can be null (manual-total mode, non-d20 formulas) —
                  render the total alone rather than an empty die. */}
              {d20 != null && (
                <span
                  className={`roll-toast-die${d20 === 20 ? ' roll-toast-die--nat20' : ''}${d20 === 1 ? ' roll-toast-die--nat1' : ''}`}
                  data-fx={nat || undefined}
                  aria-label={`d20 face ${d20}`}
                >
                  {d20}
                </span>
              )}
              {typeof total === 'number' && (
                <span className="roll-toast-total">= {total}</span>
              )}
            </div>
            {targets?.length > 0 && (
              <div className="roll-toast-targets">
                {targets.map((tg, i) => (
                  <span key={i} className={`roll-toast-chip ${degreeClass(tg.degree)}`}>
                    {tg.name && <span className="roll-toast-chip-name">{tg.name}</span>}
                    {degreeLabel(tg.degree, { attack })}
                  </span>
                ))}
                {more > 0 && <span className="roll-toast-more">+{more} more</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RollToast;
