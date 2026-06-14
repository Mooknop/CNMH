// Pure geometry/physics helpers for the character carousel.
// Extracted from the design prototype (design_handoff_player_dashboard/reference/app.jsx)
// so the drag/index math is unit-testable in isolation from React.

export const CARD_WIDTH = 244; // px — fixed card box width (matches CSS .cc-card)
export const PEEK = 0.62; // locked: fraction of card width between neighbour centers
export const SPACING = CARD_WIDTH * PEEK; // px between adjacent card centers

/** Clamp an index into the valid [0, n-1] range. */
export const clampIndex = (i, n) => Math.max(0, Math.min(n - 1, i));

/**
 * Convert a horizontal drag delta into a fractional slot offset, applying
 * end-resistance (×0.35) once the projected position passes the first/last card.
 * @param {number} dx - pointer delta in px (current - start); positive = dragged right
 * @param {number} active - current centered index
 * @param {number} n - number of cards
 * @param {number} [spacing=SPACING]
 * @returns {number} fractional offset to add to `active`
 */
export const dragFraction = (dx, active, n, spacing = SPACING) => {
  let f = -dx / spacing;
  const proj = active + f;
  if (proj < 0) f = -active + proj * 0.35;
  if (proj > n - 1) f = n - 1 - active + (proj - (n - 1)) * 0.35;
  return f;
};

/** Resolve the resting index after a drag release. */
export const resolveRelease = (active, frac, n) => clampIndex(Math.round(active + frac), n);

/**
 * Visual transform for a single card given its signed offset from center.
 * @param {number} o - signed offset (index - active - dragFraction)
 * @returns {{culled:boolean, translateX:number, scale:number, opacity:number, blur:number, brightness:number, zIndex:number}}
 */
export const cardStyleForOffset = (o, spacing = SPACING) => {
  const ao = Math.abs(o);
  if (ao > 2.2) return { culled: true };
  return {
    culled: false,
    translateX: o * spacing,
    scale: 1 - Math.min(ao, 1.6) * 0.14,
    opacity: 1 - Math.min(ao, 1.6) * 0.42,
    blur: ao > 0.2 ? Math.min((ao - 0.2) * 2.4, 3) : 0,
    brightness: 1 - Math.min(ao, 1) * 0.28,
    zIndex: 100 - Math.round(ao * 10),
  };
};
