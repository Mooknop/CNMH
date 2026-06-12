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

// Harrow Casting (#227): the metamagic draw. DC 11 flat check on every
// Harrow Cast; failing it loses the active omen at the END of the turn
// (useOmen's pendingLoss, cleared by the turn tracker on submit).
export const HARROW_CAST_DC = 11;

/**
 * The drawn suit's mechanical effect for one Harrow Cast.
 * `kind` tells UseAbilityModal how to apply it on confirm:
 *   'damage-note' — manual rider note (chained-spell damage step is #281)
 *   'self-effect' — catalog effect entry on the caster (until next turn)
 *   'self-heal'   — player-rolled healing applied to the caster
 *   'target-heal' — player-rolled healing applied to the picked PC target,
 *                   plus a save-bonus effect on an omen match
 *   'note'        — log-only guidance (Books' free RK, Crowns' subtle cast)
 *
 * @param {string}  suit - a HARROW_SUITS id
 * @param {Object}  opts - { spellRank, match } (match = drawn suit equals the active omen)
 */
export const harrowCastEffect = (suit, { spellRank = 0, match = false } = {}) => {
  switch (suit) {
    case 'Hammers':
      return {
        kind: 'damage-note',
        note: `+${match ? spellRank * 2 : spellRank} force damage on a hit or failed save (single-target offensive spells only${match ? '; doubled — omen match' : ''})`,
      };
    case 'Keys':
      return {
        kind: 'self-effect',
        effectId: match ? 'harrow-key-ward-2' : 'harrow-key-ward',
        note: `+${match ? 2 : 1} status bonus to AC and all saves until the start of your next turn${match ? ' (omen match)' : ''}`,
      };
    case 'Shields':
      return {
        kind: 'self-heal',
        dice: match ? `4d6+${spellRank * 2}` : `2d6+${spellRank}`,
        note: `Heal yourself ${match ? `4d6+${spellRank * 2}` : `2d6+${spellRank}`}${match ? ' (omen match)' : ''}`,
      };
    case 'Books':
      return {
        kind: 'note',
        note: `Free Recall Knowledge about the target using your spell attack roll${match ? ' with a +2 status bonus (omen match)' : ''}`,
      };
    case 'Stars':
      return {
        kind: 'target-heal',
        dice: `2d6+${spellRank}`,
        effectId: match ? 'harrow-star-saves' : null,
        note: `Heal the willing target 2d6+${spellRank}${match ? '; they gain +2 status to all saves until the start of your next turn (omen match)' : ''}`,
      };
    case 'Crowns':
      return {
        kind: 'note',
        note: `Subtle cast: Fortune-Telling Lore vs each observer's Perception DC hides the spellcasting${match ? ' — +2 status bonus (omen match)' : ''}`,
      };
    default:
      return null;
  }
};
