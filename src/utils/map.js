// Multiple Attack Penalty (MAP) helpers.
//
// MAP applies to the 2nd and 3rd+ attack each turn: −5/−10, or −4/−8 when the
// weapon/ability has the Agile trait. The "step" is how many attacks the actor
// has already made this turn, clamped to 0–2.

export const hasTrait = (ability, trait) =>
  Array.isArray(ability?.traits) &&
  ability.traits.some((t) => String(t).toLowerCase() === String(trait).toLowerCase());

export const isAttackAbility = (ability) => hasTrait(ability, 'Attack');

export const isAgile = (ability) => hasTrait(ability, 'Agile');

// Clamp an attacks-made count to a usable MAP step (0, 1 or 2).
export const mapStepFor = (attacksMade) =>
  Math.min(Math.max(attacksMade || 0, 0), 2);

// Penalty for an ability at a given step: 0, −5/−10 (−4/−8 agile).
export const mapPenaltyFor = (ability, step) => {
  const s = Math.min(Math.max(step || 0, 0), 2);
  if (s === 0) return 0; // avoid -0
  return -(isAgile(ability) ? 4 : 5) * s;
};
