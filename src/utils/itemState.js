// Ownership state of an inventory entry. The live-loadout layer
// (cnmh_loadout_<characterId>) stores only the four mutable states; `stowed`
// is *derived* — an entry whose effective parent is a container is Stowed and
// never stores a state. A top-level entry with no override is Worn.
export const ITEM_STATES = ['worn', 'held1', 'held2', 'dropped'];
export const DEFAULT_ITEM_STATE = 'worn';
export const STOWED = 'stowed';

export const ITEM_STATE_LABEL = {
  worn: 'Worn',
  held1: 'Held in 1 Hand',
  held2: 'Held in 2 Hands',
  dropped: 'Dropped',
  stowed: 'Stowed',
};

// Any unknown / missing value collapses to the Worn default so a corrupt or
// stale loadout entry can never wedge the effective view.
export const normalizeItemState = (s) =>
  ITEM_STATES.includes(s) ? s : DEFAULT_ITEM_STATE;

// The two "in a hand" states. A two-handed grip (held2) and a single-hand
// grip (held1) both count as held for ability-gating purposes.
export const HELD_STATES = ['held1', 'held2'];
export const isHeldState = (s) => HELD_STATES.includes(s);

// Whether an item's granted abilities (strikes, item actions, scroll/wand/
// staff spells) are currently usable. True when the item is in a hand, or the
// catalog explicitly marks it usable without a hand (`noHandRequired`) — the
// escape hatch for worn-but-functional gear. Anything else (worn/stowed/
// dropped/unknown) is inactive: the ability is still shown, just disabled.
export const itemAbilitiesActive = (item) =>
  !!item && (isHeldState(item.state) || item.noHandRequired === true);
