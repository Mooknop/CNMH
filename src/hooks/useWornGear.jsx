import { useMemo } from 'react';
import { useInvested } from './useInvested';
import { isInvestable } from '../utils/InventoryUtils';
import { DEFAULT_ITEM_STATE } from '../utils/itemState';
import { hasArmorRuneBlock, resolveArmorItem } from '../utils/armorRunes';
import { SKILL_KEYS } from '../utils/EffectUtils';

// Worn-Gear Effects (W1, #730) — the app-owned passive-bonus spine.
//
// Generalizes the useShield synthetic-effect pattern: every worn item carrying
// a `modifiers: [{ stat, kind, amount }]` block contributes an always-on active
// effect (no manual toggle), folded into the same computeEffectBonuses pipeline
// as conditions and the raised shield. Covers the bonus stats the effect engine
// models — ac / fort / reflex / will / skills (W2, #731) — plus the special
// damage resistance/weakness/immunity modifiers the defense readers consume
// (#922), which ride along on the same synthetic def but never net as a bonus.
//
// IMPORTANT — these app-catalog items are NOT also on the Foundry actor. AC and
// saves are static scalars synced from Foundry; if a magic armor lived on the
// actor too, its bonus would be double-counted. The bonus is owned here and
// layered on top of the synced scalar / derived AC, so it stays outside the
// #555 reconciliation overlay model (nothing here is committed back to the doc).
//
// Stacking note: an armor's *base* AC item bonus is baked into the derived AC
// (utils/armorClass.js), OUTSIDE the effect engine. So `modifiers` must carry
// only the *magic delta* (e.g. a +1 potency rune's item bonus), never an
// armor's base acBonus — otherwise bestOfKind would collapse base + potency
// into a single item bonus instead of summing them.

// Stats worn gear can grant — defensive stats plus every skill (W2, #731). The
// effect engine already buckets these (computeEffectBonuses), and the skills
// list nets effectBonuses[skill] with a source label, so a skill modifier
// (Slick → Acrobatics, Shadow → Stealth) flows straight through once it's let
// past this gate. Genuinely unknown/malformed stats are still dropped.
const SUPPORTED_STATS = new Set(['ac', 'fort', 'reflex', 'will', ...SKILL_KEYS]);

// Damage resistance/weakness/immunity (#900/#918/#919) are special, non-bonus
// modifiers — `{ stat: 'resistance'|'weakness'|'immunity', vs, amount? }`. They
// never net through computeEffectBonuses (no bonus bucket — the `!buckets[stat]`
// guard drops them, same as `dexCap`); instead the defense readers
// (resistanceFor / weaknessFor / isImmuneTo) pick them off the synthetic def by
// stat. Immunity carries no `amount`, so the only well-formedness gate is `vs`.
const SPECIAL_STATS = new Set(['resistance', 'weakness', 'immunity']);

const isWorn = (e) => e?.state == null || e.state === DEFAULT_ITEM_STATE;

const usableModifiers = (mods) =>
  (Array.isArray(mods) ? mods : []).filter(
    (m) => m && SUPPORTED_STATS.has(m.stat) && typeof m.amount === 'number'
  );

const specialModifiers = (mods) =>
  (Array.isArray(mods) ? mods : []).filter((m) => m && SPECIAL_STATS.has(m.stat) && m.vs);

// Everything a worn item contributes: the bonus stats (ac/saves/skills) the
// effect engine buckets, plus the special damage modifiers the defense readers
// consume. An item contributes when it has at least one of either.
const contributedModifiers = (mods) => [...usableModifiers(mods), ...specialModifiers(mods)];

// The modifiers an item contributes. Armor with an etched `runes` block (#727)
// derives its magic delta (potency AC + resilient saves + property-rune
// modifiers) through the armor-rune resolver; everything else carries a flat
// authored `modifiers` array.
const itemModifiers = (e) =>
  hasArmorRuneBlock(e) ? resolveArmorItem(e).modifiers : e.modifiers;

/**
 * Synthesize always-on active-effect entries for the character's worn magic
 * gear. Returns one `{ entry, def }` per contributing item — the same shape
 * useShield emits for a raised shield — for the caller to append to the
 * sheet's effects list + catalog.
 *
 * A worn item contributes its modifiers when it is worn AND, if it carries the
 * Invested trait, currently invested. Base armor (worn, investment not
 * required) is handled separately by the derived-AC path; this is the magic
 * layer, which PF2e gates on investment.
 *
 * @param {string} charId
 * @param {Array}  inventory - the character's effective (state-stamped) inventory
 * @returns {{ wornEffects: Array<{ entry: object, def: object }> }}
 */
export const useWornGear = (charId, inventory = []) => {
  const { isInvested } = useInvested(charId);

  const wornEffects = useMemo(() => {
    return (Array.isArray(inventory) ? inventory : [])
      .filter((e) => {
        if (!isWorn(e)) return false;
        if (!contributedModifiers(itemModifiers(e)).length) return false;
        // Magic gear must be invested to grant its bonus; non-investable worn
        // gear contributes as soon as it's worn.
        if (isInvestable(e) && !isInvested(e.uid)) return false;
        return true;
      })
      .map((e) => {
        const id = `worn-${e.uid}`;
        return {
          entry: { id, effectId: id },
          def: { id, name: e.name, modifiers: contributedModifiers(itemModifiers(e)) },
        };
      });
  }, [inventory, isInvested]);

  return { wornEffects };
};

export default useWornGear;
