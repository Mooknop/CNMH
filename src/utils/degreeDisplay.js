// Degree-of-success DISPLAY vocabulary (#1315) — the labels and CSS classes
// for the four PF2e outcome degrees, colocated with the computation side
// (saveDegree.computeSaveDegree / rollResolution.resolveActionRoll). These
// maps were re-declared inline in 14 components; this is now the only copy.
//
// Two label flavors: checks/saves speak "Success/Failure", attack rolls
// against AC speak "Hit/Miss". The CSS classes are shared across both (the
// save-* names predate attack usage and are styled globally in gm/encounter
// stylesheets — renaming them is a CSS sweep for another day).

export const DEGREE_LABELS = {
  criticalSuccess: 'Critical Success',
  success: 'Success',
  failure: 'Failure',
  criticalFailure: 'Critical Failure',
};

export const ATTACK_DEGREE_LABELS = {
  criticalSuccess: 'Critical Hit',
  success: 'Hit',
  failure: 'Miss',
  criticalFailure: 'Critical Miss',
};

export const DEGREE_CLASS = {
  criticalSuccess: 'save-crit-success',
  success: 'save-success',
  failure: 'save-failure',
  criticalFailure: 'save-crit-failure',
};

// Label for a degree key; `attack: true` selects the Hit/Miss flavor.
// Unknown degrees fall back to the raw key so a new degree never renders blank.
export const degreeLabel = (degree, { attack = false } = {}) =>
  (attack ? ATTACK_DEGREE_LABELS : DEGREE_LABELS)[degree] ?? degree;

export const degreeClass = (degree) => DEGREE_CLASS[degree] ?? '';
