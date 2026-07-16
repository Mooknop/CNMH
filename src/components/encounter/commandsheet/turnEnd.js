// Command Sheet turn-end helpers (#411). Extracted from TurnTrackerPanel so the
// deck header (whose useEndTurn owns End Turn) and the residual TurnTrackerPanel can both
// reach them without duplicating the shapes.
import { defaultTurnState } from '../../../hooks/useTurnState';

// Fresh turn state for the *next* PC, pre-seeded by End Turn so their Submit
// isn't disabled by stale actionsSpent before their own self-reset effect runs.
// Derived from defaultTurnState so new fields can't drift.
export const RESET_STATE = {
  ...defaultTurnState(),
  reactionAvailable: true,
  hasStartedFirstTurn: true,
};

export const writeLocal = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* noop */ }
};
