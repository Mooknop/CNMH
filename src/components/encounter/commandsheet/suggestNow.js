// src/components/encounter/commandsheet/suggestNow.js
// Command Sheet "Right Now" ranking (#413). Pure function over the action
// catalog (buildActionCatalog tiles) + live turn state + focus. Answers "what
// can I do right now?" with ≤4 affordable, usable actions ranked by context.
//
// Ported from the design prototype's suggestNow(). Enemy-focused only this slice:
// the support/healing dimension (ally targeting, consumables-as-tiles + their
// draw/retrieve action cost, low-HP boost) is a separate follow-up slice. Spells
// aren't catalog tiles (the grid has a "Cast a Spell" launcher), so they don't
// surface here — consistent with the grid.

// Can the action be paid for out of the remaining budget? All catalog tiles are
// action-cost (1/2/3); reactions/free live on their own tabs and never reach here.
export function affordable(tile, actionsLeft) {
  return tile.cost <= actionsLeft;
}

// Is the action usable in the current context? A target-needing tile (strike /
// "vs <defense>" maneuver) needs a focused foe; inactive tiles never qualify.
export function usable(tile, hasFocus) {
  if (tile.inactive) return false;
  if (tile.needsTarget && !hasFocus) return false;
  return true;
}

/**
 * @param {Array}  tiles                 buildActionCatalog tiles
 * @param {Object} opts
 * @param {number} opts.actionsLeft      actions remaining this turn
 * @param {boolean} opts.hasFocus        whether a foe is focused
 * @returns {Array} up to 4 tiles, most relevant first
 */
export function suggestNow(tiles, { actionsLeft = 0, hasFocus = false } = {}) {
  const live = (tiles || []).filter(
    (t) => affordable(t, actionsLeft) && usable(t, hasFocus)
  );

  const score = (t) => {
    let s = 0;
    if (hasFocus) {
      // A foe is targeted → offense first.
      if (t.origin === 'strike') s += 10;
      else if (t.cat === 'skill' && t.needsTarget) s += 8;
      else if (t.cat === 'attack' && t.needsTarget) s += 7;
    } else {
      // No foe → positioning / defense (Seek buckets under 'defense').
      if (t.cat === 'move') s += 8;
      if (t.cat === 'defense') s += 7;
    }
    return s;
  };

  return [...live].sort((a, b) => score(b) - score(a)).slice(0, 4);
}
