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
