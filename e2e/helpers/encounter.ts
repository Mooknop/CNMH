// Build a minimal *active* encounter record (cnmh_encounter_global) for seeding
// via mockSession. An active encounter makes usePlayMode report mode==='encounter',
// which flips the sheet's mode-aware "play" tab to Encounter and renders the
// combat surface (HandsPanel, ActionsList → the Magic button, TurnTrackerPanel).
//
// Shape mirrors src/utils/encounterUtils.js (defaultEncounter + makePcEntry).
export function activeEncounter(
  charId: string,
  name: string,
  extra: Record<string, unknown> = {},
) {
  return {
    active: true,
    phase: 'in-progress',
    round: 1,
    currentTurnIndex: 0,
    order: [{ entryId: `e2e-${charId}`, kind: 'pc', charId, name, initiative: 20 }],
    log: [],
    saveRequests: [],
    ...extra,
  };
}

// Order-entry builders mirroring makePcEntry/makeEnemyEntry (encounterUtils.js),
// with stable entryIds so tests can re-push a consistent order across turns.
export const pcEntry = (charId: string, name: string, initiative: number | null = null) => ({
  entryId: `e2e-pc-${charId}`,
  kind: 'pc' as const,
  charId,
  name,
  initiative,
});

export const enemyEntry = (name: string, initiative: number | null = null) => ({
  entryId: `e2e-enemy-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  kind: 'enemy' as const,
  name,
  initiative,
});

// Full encounter record at an arbitrary phase, for seeding/pushing via mockSession.
export const encounterState = ({
  phase,
  round = 1,
  currentTurnIndex = 0,
  order = [],
}: {
  phase: 'setup' | 'in-progress';
  round?: number;
  currentTurnIndex?: number;
  order?: Array<Record<string, unknown>>;
}) => ({
  active: true,
  phase,
  round,
  currentTurnIndex,
  order,
  log: [],
  saveRequests: [],
});

// Matches src/utils/encounterUtils.js defaultEncounter() — an ended/idle encounter.
export const idleEncounter = () => ({
  active: false,
  phase: 'idle',
  round: 0,
  currentTurnIndex: 0,
  order: [],
  log: [],
  saveRequests: [],
});

// A turn state with the reaction available — defaultTurnState (useTurnState.jsx)
// has the reaction unavailable until a first turn, so tests that exercise
// reaction-cost actions (Shield Block, reaction prompts) seed this.
export const readyTurnState = () => ({
  actionsSpent: 0,
  attacksMade: 0,
  reactionAvailable: true,
  reactionSpent: false,
  hasStartedFirstTurn: true,
  actionsLog: [], // spendReaction/spendActions spread this — must be present
});
