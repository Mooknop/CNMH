// src/hooks/useGameSeconds.js
// The campaign clock as absolute game seconds — the single number every
// window/expiry rule in the app compares against (utils/frequency.js,
// utils/immunity.js, effect `expireAtSecs`).
//
// `useGameDate()` THROWS outside a GameDateProvider, which is right for the
// calendar pages but wrong for small leaf badges that only want to know whether
// a timer has run out: it forces every suite rendering such a badge to mount a
// provider it otherwise has no use for. This reads the context directly and
// returns null when there is none — and null is already the documented "no
// clock in scope, nothing has expired yet" input to those rules.
import { createContext, useContext } from 'react';
import { GameDateContext } from '../contexts/GameDateContext';
import { toGameSeconds } from '../utils/gameTime';

// Suites all over the tree full-replace the GameDateContext module with just
// `{ useGameDate }`, which leaves the context export undefined — reading it
// would throw. Falling back to a private empty context keeps those suites
// (and this hook) on the clock-less path instead.
const NO_CLOCK = createContext(null);

/** @returns {number|null} seconds since 1 Abadius 4700, or null with no provider. */
export const useGameSeconds = () => {
  const ctx = useContext(GameDateContext || NO_CLOCK);
  if (!ctx?.gameDate) return null;
  return toGameSeconds({ ...ctx.gameDate, ...ctx.time });
};

export default useGameSeconds;
