import { gridDistanceFeet } from './rangeIncrement';

// Spell areas (#1573 B3) — pure parsing + occupancy, no React, no relay.
//
// Content authors area as free text on the spell ("20-foot burst", "15-foot
// cone"), which nothing has ever parsed. This reads that text — or an authored
// `areaShape: { shape, feet }` override when the prose is unusual — into the
// shape vocabulary the placement flow needs.
//
// The shapes behave differently, and PF2e is the reason:
//   burst      — placed anywhere in range; the player must SAY where. Occupancy
//                is computable once a point is picked.
//   emanation  — always centred on the caster. Nothing to place, and occupancy
//                is computable immediately from the caster's own cell.
//   cone/line  — need a direction, not just a point. v1 lets the player mark an
//                aim point (which pings, so the table sees the intent) but does
//                NOT compute occupancy — the GM adjudicates who is caught.
//
// Grid distance uses PF2e's alternating-diagonal rule via gridDistanceFeet, so
// "within 20 feet" agrees with what Foundry measures on the canvas.

const AREA_TEXT = /(\d+)\s*-?\s*(?:foot|feet|ft\.?)\s*[- ]?\s*(burst|emanation|cone|line)/i;

export const PLACEABLE_SHAPES = ['burst', 'cone', 'line'];
export const MEASURED_SHAPES = ['burst', 'emanation'];

/**
 * The spell's area as { shape, feet }, or null when it has none (or an
 * unparseable one — a spell that says "special" simply gets no placement UI).
 *
 * Authored override wins: `ability.areaShape = { shape: 'burst', feet: 20 }`.
 */
export function parseSpellArea(ability) {
  const override = ability?.areaShape;
  if (override?.shape && Number(override.feet) > 0) {
    return { shape: String(override.shape).toLowerCase(), feet: Number(override.feet) };
  }
  const text = typeof ability?.area === 'string' ? ability.area : '';
  const match = AREA_TEXT.exec(text);
  if (!match) return null;
  return { shape: match[2].toLowerCase(), feet: Number(match[1]) };
}

// A burst must be placed before its occupancy means anything; an emanation is
// already centred on the caster; a cone/line only ever gets an aim point.
export const areaNeedsPlacement = (area) =>
  !!area && PLACEABLE_SHAPES.includes(area.shape);

export const areaComputesOccupancy = (area) =>
  !!area && MEASURED_SHAPES.includes(area.shape);

/**
 * Which combatants stand inside the area.
 *
 * @param {{shape:string,feet:number}} area
 * @param {Object}   opts
 * @param {{col,row}} opts.originCell     placed point (burst) — ignored for emanation
 * @param {Object}   opts.positions       { [entryId]: { col, row } } from the bridge
 * @param {string}   opts.casterEntryId   the caster's combatant id (emanation origin)
 * @param {Array}    opts.order           encounter order, for names/kind
 * @param {number}   [opts.feetPerSquare] scene scale (PF2e default 5)
 * @returns {Array<{entryId,name,kind,feet}>} occupants, nearest first; [] when
 *          the shape doesn't compute occupancy or positions are unavailable.
 */
export function areaOccupants(area, {
  originCell,
  positions,
  casterEntryId,
  order = [],
  feetPerSquare = 5,
} = {}) {
  if (!areaComputesOccupancy(area) || !positions) return [];

  const origin = area.shape === 'emanation'
    ? positions[casterEntryId]
    : originCell;
  if (!origin) return [];

  const entryOf = (entryId) => order.find((e) => e && e.entryId === entryId) || null;

  return Object.entries(positions)
    .map(([entryId, cell]) => ({ entryId, cell }))
    // An emanation radiates FROM the caster, so they are its origin rather than
    // something caught in it. A burst has no such courtesy — drop one at your
    // own feet and you are standing in the fire like anyone else.
    .filter(({ entryId }) => !(area.shape === 'emanation' && entryId === casterEntryId))
    .map(({ entryId, cell }) => ({
      entryId,
      cell,
      feet: gridDistanceFeet(origin, cell, feetPerSquare),
    }))
    .filter(({ feet }) => feet <= area.feet)
    .map(({ entryId, feet }) => {
      const entry = entryOf(entryId);
      return {
        entryId,
        name: entry?.name || entryId,
        kind: entry?.kind || 'enemy',
        feet,
      };
    })
    // Only combatants the encounter actually knows about can be targeted.
    .filter((o) => !!entryOf(o.entryId))
    .sort((a, b) => a.feet - b.feet);
}

// Human label for the section header ("20-foot burst").
export const areaLabel = (area) =>
  (area ? `${area.feet}-foot ${area.shape}` : '');
