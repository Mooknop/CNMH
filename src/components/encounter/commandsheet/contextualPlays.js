// src/components/encounter/commandsheet/contextualPlays.js
// The Focus Dossier's contextual action list (#1502 S4) — "Against this
// target" / "Support this ally" / "On yourself". A pure re-ranking +
// re-labeling of buildActionCatalog tiles filtered by the current focus, with
// the reveal-gated target intel folded in as annotations:
// - actions whose damage type matches a revealed weakness float up ("▸ hits
//   holy weakness", tagged "best");
// - strikes carry the active Exploit Vulnerability rider ("+holy 4 (exploit)");
// - "vs <defense>" maneuvers against the target's revealed lowest save get the
//   "▸ vs low Will" cue.
// No parallel catalog: the tiles are the same objects the deck renders, so a
// tapped row confirms + resolves through the exact same path.

import { affordable, usable } from './suggestNow';
import { formatModifier } from '../../../utils/CharacterUtils';
import { rkKeyFor, isSaveRevealed, isIwrRevealed } from '../../../utils/recallKnowledge';
import { defenseDC } from '../../../utils/defense';

const SAVE_LABEL = { fortitude: 'Fort', reflex: 'Ref', will: 'Will' };
const SAVE_KEYS = ['fortitude', 'reflex', 'will'];

// Damage identity of a tile: its strike damageType plus its traits ("Holy",
// "Fire", …) — the tokens a foe weakness type can match against.
const damageTokens = (tile) =>
  new Set(
    [tile.raw?.damageType, ...(tile.traits || [])]
      .filter(Boolean)
      .map((t) => String(t).toLowerCase())
  );

// The first revealed weakness this tile's damage matches, or null.
export const weaknessMatch = (tile, weaknesses = []) => {
  if (tile.cat !== 'attack' && tile.origin !== 'strike') return null;
  const tokens = damageTokens(tile);
  return (weaknesses || []).find((w) => tokens.has(String(w.type).toLowerCase())) || null;
};

/**
 * Reveal-gated intel about the focused foe, for annotating the play list.
 * Pure — mirrors the Dossier's own gating.
 *
 * @param {Object} focusEnemy  the focused enemy order entry
 * @param {Object} rec         its Recall Knowledge record (recordFor)
 * @param {Object} exploit     the acting PC's exploit record (exploitFor), or null
 * @returns {{ identified, weaknesses, lowSave, exploit }}
 */
export function targetIntel(focusEnemy, rec, exploit) {
  const defenses = focusEnemy?.defenses;
  const identified = !!rec?.identity;
  // Revealed weaknesses — full class reveal or per-type partials.
  const weaknesses = isIwrRevealed(rec, 'weaknesses')
    ? (defenses?.weaknesses || [])
    : (defenses?.weaknesses || []).filter((w) => rec?.weaknessesRevealed?.[w.type]);
  // Lowest save, only once all three are revealed (same cue as the stat grid).
  let lowSave = null;
  const dcs = SAVE_KEYS.map((k) => defenseDC(defenses, k));
  if (SAVE_KEYS.every((k) => isSaveRevealed(rec, k)) && dcs.every((v) => v != null)) {
    const min = Math.min(...dcs);
    const max = Math.max(...dcs);
    if (min !== max) {
      const key = SAVE_KEYS[dcs.indexOf(min)];
      lowSave = { key, label: SAVE_LABEL[key] };
    }
  }
  // The active exploit, only when it targets THIS foe.
  const activeExploit =
    exploit && focusEnemy && exploit.targetEntryId === rkKeyFor(focusEnemy) ? exploit : null;
  return { identified, weaknesses, lowSave, exploit: activeExploit };
}

// Exploit rider text for a strike sub-line: "+holy 4 (exploit)".
const exploitRider = (exploit) =>
  exploit
    ? `+${exploit.type === 'mortal' && exploit.weaknessType ? `${exploit.weaknessType} ` : ''}${exploit.value} (exploit)`
    : null;

/**
 * Build the contextual play list for the current focus.
 *
 * @param {Array}  tiles   buildActionCatalog tiles (the deck's own build)
 * @param {Object} ctx
 * @param {'foe'|'ally'|'self'} ctx.mode
 * @param {number}  ctx.actionsLeft
 * @param {number}  ctx.hpRatio      acting PC's HP fraction (self mode ranking)
 * @param {boolean} ctx.allyInReach  reach gate for ally support (#430)
 * @param {Object}  ctx.intel        targetIntel() result (foe mode)
 * @returns {Array<{tile, note, sub, tag}>} up to 4 entries, most relevant first
 *   note: {text, tone} inline annotation after the name, or null
 *   sub:  the row's sub-line (statLine + exploit rider), or null
 *   tag:  {text, tone} right-aligned cue ("best" / "+11"), or null
 */
export function focusPlays(tiles, { mode, actionsLeft = 0, hpRatio = 1, allyInReach = true, intel = null } = {}) {
  const { weaknesses = [], lowSave = null, exploit = null } = intel || {};

  const candidates = (tiles || []).filter((t) => {
    if (!affordable(t, actionsLeft) || !usable(t, mode === 'foe')) return false;
    if (mode === 'foe') {
      return t.origin === 'strike' || ((t.cat === 'attack' || t.cat === 'skill') && t.needsTarget);
    }
    if (mode === 'ally') {
      return !!t.supports && allyInReach;
    }
    // self: own healing, defensive posture, or self-applicable support.
    return !!t.heals || t.cat === 'defense' || !!t.supports;
  });

  const hurt = hpRatio < 0.6;
  const score = (t) => {
    let s = 0;
    if (mode === 'foe') {
      if (t.origin === 'strike') s += 10;
      else if (t.cat === 'skill') s += 8;
      else s += 7;
      if (weaknessMatch(t, weaknesses)) s += 6;
      if (lowSave && t.raw?.targetDefense === lowSave.key) s += 3;
    } else if (mode === 'ally') {
      if (t.heals) s += 9;
      if (t.supports) s += 8;
    } else {
      if (hurt && t.heals) s += 9;
      if (t.cat === 'defense') s += 6;
      if (t.supports) s += 5;
    }
    return s;
  };

  const ranked = [...candidates].sort((a, b) => score(b) - score(a)).slice(0, 4);

  let bestTagged = false;
  return ranked.map((tile) => {
    let note = null;
    let tag = null;
    let sub = tile.statLine || null;

    if (mode === 'foe') {
      const weak = weaknessMatch(tile, weaknesses);
      if (weak) {
        note = { text: `▸ hits ${weak.type} weakness`, tone: 'verdant' };
        if (!bestTagged) {
          tag = { text: 'best', tone: 'verdant' };
          bestTagged = true;
        }
      } else if (lowSave && tile.raw?.targetDefense === lowSave.key) {
        note = { text: `▸ vs low ${lowSave.label}`, tone: 'arcane' };
      }
      if (tile.origin === 'strike' && exploit) {
        sub = [sub, exploitRider(exploit)].filter(Boolean).join(' · ');
      }
      if (!tag && tile.origin === 'strike' && tile.raw?.attackMod !== undefined) {
        tag = { text: formatModifier(tile.raw.attackMod), tone: 'ember' };
      }
    } else if (mode === 'self' && hurt && tile.heals && !bestTagged) {
      tag = { text: 'best', tone: 'verdant' };
      bestTagged = true;
    }

    return { tile, note, sub, tag };
  });
}
