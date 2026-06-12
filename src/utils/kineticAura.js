// Kinetic aura predicates (#228). Channel Elements activates a kineticist's
// aura; impulses require it; overflow impulses deactivate it on use.
//
// Trait-driven so existing content works untagged: an ability with both the
// Aura and Kineticist traits activates the aura, the Impulse trait requires
// it, and the Overflow trait burns it out. Explicit boolean tags
// (activatesAura / requiresAura / overflow) take precedence so content can
// opt in or out without engine changes.

const hasTrait = (ability, name) => {
  const traits = Array.isArray(ability?.traits) ? ability.traits : [];
  const lower = String(name).toLowerCase();
  return traits.some((t) => String(t).toLowerCase() === lower);
};

export const activatesAura = (ability) => {
  if (!ability) return false;
  if (ability.activatesAura !== undefined) return ability.activatesAura === true;
  return hasTrait(ability, 'aura') && hasTrait(ability, 'kineticist');
};

export const requiresAura = (ability) => {
  if (!ability) return false;
  if (ability.requiresAura !== undefined) return ability.requiresAura === true;
  return hasTrait(ability, 'impulse');
};

export const isOverflow = (ability) => {
  if (!ability) return false;
  if (ability.overflow !== undefined) return ability.overflow === true;
  return hasTrait(ability, 'overflow');
};

// Whether the character has any aura-activating ability — gates the aura
// badge so non-kineticists never render aura UI.
export const characterHasKineticAura = (character) =>
  (character?.feats || []).some(
    (f) =>
      (f?.actions || []).some(activatesAura) ||
      (f?.strikes || []).some(activatesAura)
  ) || (character?.actions || []).some(activatesAura);
