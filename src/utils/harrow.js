// Harrow deck vocabulary (#227). The physical deck stays at the table — the
// app only tracks which suit was drawn. The active omen is synced state
// (cnmh_omen_<charId>, useOmen) so the GM and the turn tracker see it; suit
// metadata here drives the picker, badges, and the suit→check-type hints
// (the trigger condition for Avoid Dire Fate).

export const HARROW_SUITS = [
  { id: 'Hammers', checks: 'Strikes',         flavor: 'Force and direct action' },
  { id: 'Keys',    checks: 'Reflex Saves',    flavor: 'Cunning and adaptability' },
  { id: 'Shields', checks: 'Fortitude Saves', flavor: 'Protection and endurance' },
  { id: 'Books',   checks: 'Skill Checks',    flavor: 'Knowledge and learning' },
  { id: 'Stars',   checks: 'Will Saves',      flavor: 'Fate and cosmic forces' },
  { id: 'Crowns',  checks: 'Other',           flavor: 'Leadership and dominion' },
];

export const suitById = (id) => HARROW_SUITS.find((s) => s.id === id) || null;

export const isHarrowSuit = (id) => !!suitById(id);
