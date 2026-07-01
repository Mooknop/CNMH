// src/utils/overload.js
// Overload flat check (#957 S4). After a scepter's once/day actuated use is
// spent, the wielder may Overload to use it again: a DC 10 flat check. On a
// success the activation resolves *and* the scepter breaks; on a failure the
// effect doesn't happen (the actions are lost) and it still breaks. Either way
// it gains the `broken` condition.
import { flatCheckPasses } from './flatChecks';

export const OVERLOAD_DC = 10;

/**
 * Roll the Overload flat check. Injectable RNG for deterministic tests.
 * @param {() => number} [rng] - returns [0,1)
 * @returns {{ roll: number, dc: number, success: boolean }}
 */
export function rollOverload(rng = Math.random) {
  const roll = Math.floor(rng() * 20) + 1;
  return { roll, dc: OVERLOAD_DC, success: flatCheckPasses(roll, OVERLOAD_DC) };
}
