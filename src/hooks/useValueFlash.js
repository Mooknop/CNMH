import { useEffect, useRef, useState } from 'react';

// How long a flash descriptor stays live before self-clearing. Matches the
// longest fx animation (--fx-duration-bloom in src/fx.css) so the CSS one-shot
// always finishes before the attribute is removed.
export const FX_FLASH_MS = 600;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// FX primitive (#1344): watch a value (typically off useSyncedState) and, on
// change, return a short-lived flash descriptor `{ fx, delta, key }` that
// self-clears after FX_FLASH_MS. Consumers spread it onto markup as
// `data-fx={flash.fx}` (styled in src/fx.css) and may use `key` as a React key
// to restart a mid-flight animation on rapid re-trigger.
//
// - `value` should be a primitive (pass `hp?.current`, not the hp object);
//   changes are detected with Object.is and `delta` is only computed when both
//   sides are numbers.
// - `classify(prev, next)` maps the transition to an fx kind (e.g. down →
//   'damage', up → 'heal'); default is 'changed'. Return null/undefined to
//   suppress the flash for that transition.
// - null/undefined values are hydration gaps, not transitions: the first
//   non-null value is the baseline, so nothing flashes on page load or
//   reconnect-replay.
// - Under prefers-reduced-motion this always returns null (so floating-number
//   components can skip rendering entirely, not just skip animating).
export function useValueFlash(value, classify) {
  const [flash, setFlash] = useState(null);
  const prevRef = useRef(undefined); // undefined = no baseline yet
  const seqRef = useRef(0);
  const timerRef = useRef(null);
  const classifyRef = useRef(classify);
  classifyRef.current = classify;

  useEffect(() => {
    if (value === null || value === undefined) return;
    const prev = prevRef.current;
    prevRef.current = value;
    if (prev === undefined || Object.is(prev, value)) return;
    if (prefersReducedMotion()) return;
    const fx = classifyRef.current ? classifyRef.current(prev, value) : 'changed';
    if (!fx) return;
    const delta =
      typeof prev === 'number' && typeof value === 'number' ? value - prev : undefined;
    seqRef.current += 1;
    setFlash({ fx, delta, key: seqRef.current });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFlash(null), FX_FLASH_MS);
  }, [value]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return flash;
}

export default useValueFlash;
