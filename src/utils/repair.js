// Repair (#579) — pure rules, React-free. The Repair activity (Crafting) is a
// check against the item's DC that restores Hit Points by degree of success and
// the repairer's Crafting proficiency rank.
//
// PF2e Repair (CRB): Success restores 5 HP + 5 per rank beyond trained;
// Critical Success restores 10 HP + 10 per rank beyond trained. That collapses
// to 5 × rank (success) and 10 × rank (crit) for ranks 1–4. Repair requires
// trained Crafting, so rank 0 restores nothing.
//
// Shield-only interim (#579): the durability epic (#539) generalizes this to
// weapons/armor; for now the Repair surface targets tracked shield HP.

import { getLevelBasedDc } from './InventoryUtils';

/** HP restored by a Repair check. Only successes restore; rank 0 restores 0. */
export function repairHp({ rank, degree }) {
  const r = Number(rank) || 0;
  if (r < 1) return 0;
  if (degree === 'criticalSuccess') return 10 * r;
  if (degree === 'success') return 5 * r;
  return 0; // failure / critical failure restore nothing
}

/**
 * Repair DC for an item of the given level — the level-based DC, floored at the
 * level-1 DC so a level-0 (or unleveled) basic item still has a sane DC.
 */
export function repairDc(itemLevel) {
  const lvl = Math.max(1, Math.min(20, Math.round(Number(itemLevel) || 0)));
  return getLevelBasedDc(lvl);
}

/**
 * Time/actions a Repair costs. Normally 10 minutes. Quick Repair drops it to
 * 1 minute, then to 3 actions at master and 1 action at legendary Crafting.
 */
export function repairTimeLabel({ rank, quick }) {
  if (!quick) return '10 minutes';
  const r = Number(rank) || 0;
  if (r >= 4) return '1 action';
  if (r >= 3) return '3 actions';
  return '1 minute';
}
