// Devoted Guardian ward predicates (#228). The ward is an ordinary effect
// entry on the ally (catalog ids below) stamped appliedBy the warding
// champion; it lasts exactly as long as the warder's shield stays raised,
// so WardSync strips matching entries the moment `raised` goes false
// (manual lower, the turn-start auto-lower, or a broken shield).

export const WARD_EFFECT_IDS = ['devoted-guardian', 'devoted-guardian-tower'];

export const isWardEffectId = (id) => WARD_EFFECT_IDS.includes(id);

export const isWardEntry = (entry, warderId) =>
  !!entry && isWardEffectId(entry.effectId) && entry.appliedBy === warderId;

const actionAppliesWard = (a) =>
  Array.isArray(a?.effects) && a.effects.some((e) => isWardEffectId(e?.effectId));

// Whether the character has any ward-applying ability — gates mounting a
// WardSync watcher so non-champions never subscribe to shield state.
export const characterHasShieldWard = (character) =>
  (character?.feats || []).some((f) => (f?.actions || []).some(actionAppliesWard))
  || (character?.actions || []).some(actionAppliesWard);
