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
