// src/hooks/useCharacter.js
// Data layer hook — all reads from player data and derived calculations go through here.
// Components should call useCharacter(character) and destructure what they need.
// Never import directly from utils in components; use this hook instead.

import { useMemo } from 'react';

import { useSyncedState } from './useSyncedState';
import { useEffects } from './useEffects';
import { dexCapFor, computeEffectBonuses, combineModifiers } from '../utils/EffectUtils';
import { computeConditionEffects } from '../utils/ConditionUtils';
import { hydrateConditions } from '../data/pf2eConditions';
import { deriveSpeed, armorSpeedPenalty, shieldSpeedPenalty } from '../utils/speed';
import { useContent } from '../contexts/ContentContext';
import { buildEffectiveInventory } from '../utils/effectiveInventory';
import { applyRemovedOverlay } from '../utils/removedOverlay';
import { itemAbilitiesActive } from '../utils/itemState';
import { itemUidOf } from '../utils/affix';
import { applyItemModes } from '../utils/itemModes';
import { wornBonusSlots, wornSenses } from '../utils/wornGear';
import { listStaves } from '../utils/staffPrep';
import { itemCatalogMap, spellCatalogMap, runeCatalogMap, resolveInventory } from '../utils/contentUtils';

import {
  getAbilityModifier,
  getSkillModifier,
  getItemBonus,
  SKILL_ABILITY_MAP,
  calculateClassDC,
  calculateEnhancedBulkLimit,
  hasFeat,
  FEAT_NAMES,
  getArmorProficiencyRank,
  getArmorProficiencyBonus,
} from '../utils/CharacterUtils';

import { ARMOR_CATEGORIES, normalizeArmor } from '../utils/InventoryUtils';
import { findWornArmor, deriveArmorClass } from '../utils/armorClass';

import {
  getStrikes,
  getActions,
  getReactions,
  getFreeActions,
} from '../utils/ActionsUtils';
import { bladeStrikes } from '../utils/bladeByrnie';
import { attachmentStrikes } from '../utils/shieldAttach';
import { shieldBashStrikes } from '../utils/shieldStrikes';
import { whetstonesByWeaponUid } from '../utils/whetstone';

import {
  calculateSpellStats,
  findScrollItems,
  extractScrollSpells,
  findWandItems,
  extractWandSpells,
  extractInnateSpells,
} from '../utils/SpellUtils';
import { canActivateSpellItem } from '../utils/traditionAccess';

import { calculateItemsBulk } from '../utils/InventoryUtils';

/**
 * Data layer hook for a single character.
 * Accepts the raw character object from CharacterContext and returns a
 * fully-computed model. Components should never access raw character
 * properties directly — use this hook's return value instead.
 *
 * @param {Object|null} character - Raw character object from CharacterContext
 * @returns {Object|null} - Computed character model, or null if no character
 */
export const useCharacter = (character) => {
  // Durable live-loadout overrides for this character (drop / hold / stow /
  // retrieve …). Read-only here; the Hands panel writes the same key. Empty
  // map (no SessionProvider, or untouched) ⇒ effective tree == authored tree,
  // so Bulk and inventory are byte-identical to before this layer existed.
  const [loadout]     = useSyncedState(`cnmh_loadout_${character?.id || 'none'}`, {});
  // Per-weapon chamber state (epic #672) — drives the loaded-chamber gate on
  // chambered ranged Strikes (Crescent Cross). Read-only here; useChambers
  // (Reload/Fire) is the sole writer. Empty map ⇒ every chamber unloaded.
  const [chambers]    = useSyncedState(`cnmh_chambers_${character?.id || 'none'}`, {});
  // Blade Byrnie transient dagger (#728 E4): when active, a derived +1 striking
  // dagger strike is injected. Read-only here; useBladeByrnie is the writer.
  const [blade]       = useSyncedState(`cnmh_blade_${character?.id || 'none'}`, { active: false });
  // Shield attachments (#1165 Track 2): attachmentUid -> hostShieldUid overlay.
  const [attached]    = useSyncedState(`cnmh_attached_${character?.id || 'none'}`, {});
  const [hp, setHp]   = useSyncedState(
    `cnmh_hp_${character?.id || 'none'}`,
    () => ({ current: character?.maxHp || 0, max: character?.maxHp || 0, temp: 0, dying: 0, wounded: 0, doomed: 0 })
  );
  const [heroPoints, setHeroPoints] = useSyncedState(`cnmh_heropoints_${character?.id || 'none'}`, 0);
  // Staff preparation (#957 S6a) — the single staff prepared today and its
  // charge count for the day. null ⇒ no staff prepared (so any held staff has 0
  // charges). Read-only here; DailyPrepModal / performDailyPrep is the writer.
  const [staffPrep] = useSyncedState(`cnmh_staffprep_${character?.id || 'none'}`, null);
  // Etch-time accessory-rune config (#1055 S4) — per-uid choices baked when a
  // rune is inscribed (currently just Dragon's Breath's depicted dragon type).
  // Read-only here; ItemModal's picker is the writer. Empty ⇒ no effect.
  const [runeConfig] = useSyncedState(`cnmh_runeconfig_${character?.id || 'none'}`, {});
  // Item-mode choices (#1093) — per-uid toggle state for items with a `modes`
  // block (Gloom Blade's light states, a hood up/down). Read-only here;
  // ItemModal's toggle is the writer. Empty ⇒ every item at its authored
  // default mode (defaults still apply — see applyItemModes).
  const [itemModeState] = useSyncedState(`cnmh_itemmode_${character?.id || 'none'}`, {});

  // Attunement overlay (uid ⇒ invested) — worn magic gear only contributes its
  // bonus spell slots (#1093) while invested; same gate useWornGear applies to
  // modifiers. Read-only here; the Attuned slots are the writer.
  const [investedMap] = useSyncedState(`cnmh_invested_${character?.id || 'none'}`, {});
  // Additive runtime inventory (crafted items, loot, purchases, GM grants).
  // Authored `character.inventory` arrives already resolved; acquired entries
  // are unresolved refs, so resolve them against the live catalog the same way
  // before merging. An empty/absent overlay ⇒ effective tree unchanged.
  const [acquired] = useSyncedState(`cnmh_acquired_${character?.id || 'none'}`, []);
  // Given-away overlay (#656) — uids handed to another PC, masked out of the
  // effective tree + Bulk. Empty/absent ⇒ no effect.
  const [removed] = useSyncedState(`cnmh_removed_${character?.id || 'none'}`, []);
  // Active conditions ({ id, value } entries, cnmh_conditions_) — read-only
  // here; StatsBlock's condition tracker is the sole writer. Feeds the Speed
  // spine (SP1, #1220) so the derived total reflects Encumbered et al.
  const [activeConditions] = useSyncedState(`cnmh_conditions_${character?.id || 'none'}`, []);
  // Active effects (#507) — the merged app + Foundry buff list, the same source
  // StatsBlock's effect engine reads. Used here for the Dexterity-cap
  // adjustment that feeds the AC derivation (caps can't ride the additive effect
  // rail, so the value must be applied at the derivation site) and for the
  // stat:'speed' channel of the Speed spine.
  const { effects: activeEffects } = useEffects(character?.id || 'none');
  const { items: catalogItems, spells: catalogSpells, effects: effectCatalog, runes: catalogRunes } = useContent();
  const resolvedAcquired = useMemo(
    () => resolveInventory(
      Array.isArray(acquired) ? acquired : [],
      itemCatalogMap(catalogItems || []),
      spellCatalogMap(catalogSpells || []),
      character?.level || 1,
      runeCatalogMap(catalogRunes || []),
    ),
    [acquired, catalogItems, catalogSpells, character?.level, catalogRunes],
  );

  const charMemo = useMemo(() => {
    if (!character) return null;

    // ── Identity ────────────────────────────────────────────────────────────
    const id           = character.id;
    const name         = character.name;
    const level        = character.level || 1;
    const ancestry     = character.ancestry;
    const background   = character.background;
    const characterClass = character.class;
    const keyAbility   = character.keyAbility;
    const size         = character.size;
    const maxHp        = character.maxHp || 0;
    const ac           = character.ac || 10;

    // ── Saves (pre-calculated in JSON) ─────────────────────────────────────
    const saves = {
      fortitude : character.saves?.fortitude || 0,
      reflex    : character.saves?.reflex    || 0,
      will      : character.saves?.will      || 0,
    };

    // ── Abilities ───────────────────────────────────────────────────────────
    const abilityScores = { ...(character.abilities || {}) };
    const abilityModifiers = {
      strength     : getAbilityModifier(character.abilities?.strength     || 10),
      dexterity    : getAbilityModifier(character.abilities?.dexterity    || 10),
      constitution : getAbilityModifier(character.abilities?.constitution || 10),
      intelligence : getAbilityModifier(character.abilities?.intelligence || 10),
      wisdom       : getAbilityModifier(character.abilities?.wisdom       || 10),
      charisma     : getAbilityModifier(character.abilities?.charisma     || 10),
    };

    // ── Effective inventory ─────────────────────────────────────────────────
    // The single source of truth for placement + state: authored (resolved)
    // tree plus the acquired overlay, minus anything given away, merged with the
    // live loadout. Bulk and the inventory passthrough both read this so a
    // dropped/retrieved/stowed/given item is consistent for everyone. With empty
    // overlays this equals the authored tree. Each entry's active item mode
    // (#1093) is applied here — before ANY derivation — so strikes, worn-gear
    // modifiers and the armor path all see the same moded item.
    const present = applyRemovedOverlay(
      [...(character.inventory || []), ...resolvedAcquired],
      removed,
    );
    const effectiveInventory = applyItemModes(
      buildEffectiveInventory(present, loadout),
      itemModeState,
    );
    // Skill item bonuses read the effective tree (not the authored inventory),
    // so a claimed/purchased item carrying `bonus: [skill, n]` — and a mode
    // that swaps the bonus — actually grants it.
    const charSkills = { ...character, inventory: effectiveInventory };

    // Senses (#1210 M4h): the authored senses string plus any granted by worn
    // gear carrying a `sense` block (the Bloodstained Bandana's bloodsense),
    // gated worn-and-invested like every other worn-gear reader. Falsy when
    // there are none, so StatsBlock hides the line.
    const gearSenses = wornSenses(
      effectiveInventory,
      (itemUid) => !!(investedMap || {})[itemUid],
    );
    const senses = [character.senses, ...gearSenses].filter(Boolean).join(', ') || null;

    // ── Skills ──────────────────────────────────────────────────────────────
    const skillModifiers = Object.fromEntries(
      Object.keys(SKILL_ABILITY_MAP).map(skillId => [
        skillId,
        getSkillModifier(charSkills, skillId),
      ])
    );

    // Proficiency ranks (0-4) per skill — for display labels (Trained/Expert/etc.)
    const rawSkills = character.skills || {};
    const skillProficiencies = Object.fromEntries(
      Object.keys(SKILL_ABILITY_MAP).map(skillId => [
        skillId,
        rawSkills[skillId]?.proficiency || 0,
      ])
    );

    // Item bonuses per skill (from inventory items with a bonus property)
    const itemBonuses = Object.fromEntries(
      Object.keys(SKILL_ABILITY_MAP).map(skillId => [
        skillId,
        getItemBonus(charSkills, skillId),
      ])
    );

    // Lore skills (array of { name, proficiency } from JSON)
    const loreSkills = Array.isArray(rawSkills.lore) ? rawSkills.lore : [];

    // ── Proficiencies & DC ──────────────────────────────────────────────────
    const proficiencies = character.proficiencies || {};
    const classDC = calculateClassDC(character);

    // Armor proficiency by category (AC2, #748): the rank + derived PF2e bonus
    // (0 untrained, else level + 2×rank) the AC recompute (#749) reads for the
    // equipped armor's category. Sourced from the already-synced
    // proficiencies.armor block; a character missing it resolves to untrained.
    const armorProficiencies = Object.fromEntries(
      ARMOR_CATEGORIES.map((cat) => [
        cat,
        {
          rank: getArmorProficiencyRank(character, cat),
          bonus: getArmorProficiencyBonus(character, cat),
        },
      ])
    );

    // Item-granted abilities (weapon strikes, item actions, scroll/wand/staff
    // spells) are gated on the item being held in a hand. The derivation utils
    // key off item state, so they read the effective tree — not the authored
    // inventory — via this state-aware view. Effective entries keep every
    // resolved field (name/scroll/wand/strikes/actions/noHandRequired) plus
    // the live `state`/`hand`, so it is a drop-in replacement.
    // Bake etch-time accessory-rune config (#1055 S4) onto the inscribed entry
    // so the derived free action (Dragon's Breath) carries the depicted dragon
    // type. Keyed by uid; only touches entries that actually hold an accessory
    // rune, so an empty overlay leaves the tree byte-identical.
    const configuredInventory = (runeConfig && Object.keys(runeConfig).length)
      ? effectiveInventory.map((e) => {
          const cfg = e && runeConfig[itemUidOf(e)];
          return cfg && e.runes && typeof e.runes.accessory === 'object'
            ? { ...e, runes: { ...e.runes, accessoryConfig: cfg } }
            : e;
        })
      : effectiveInventory;
    const charEff = { ...character, inventory: configuredInventory };

    // ── Armor Class (AC3, #749 / AC4, #750) ───────────────────────────────────
    // Derive base AC (10 + proficiency + capped Dex + armor item bonus) from the
    // worn armor — or the unarmored proficiency when nothing is worn. This is
    // accurate only when the character carries armor-proficiency data; without a
    // `proficiencies.armor` block we can't compute the proficiency term, so we
    // keep the authored `ac` scalar (deriving 10+Dex+0 there would understate a
    // character's real AC). deriveArmorClass also returns null — i.e. scalar
    // fallback — for a worn armor that hasn't been backfilled with the AC1
    // schema. Effect bonuses (Raise a Shield, conditions, the worn-gear magic
    // layer) still layer on top downstream; this is only the base value.
    const wornArmor = findWornArmor(effectiveInventory);
    const armorCategory = wornArmor
      ? normalizeArmor(wornArmor.armor)?.category || 'unarmored'
      : 'unarmored';
    const hasArmorProficiency = !!(character.proficiencies && character.proficiencies.armor);
    // Effect-imposed Dexterity cap (#507, e.g. Drakeheart Mutagen "cap of +2") —
    // composes with the worn armor's own cap (lowest wins) inside the derivation.
    const effectDexCap = dexCapFor(activeEffects, effectCatalog);
    const derivedAc = hasArmorProficiency
      ? deriveArmorClass({
          armor: wornArmor ? wornArmor.armor : null,
          dexMod: abilityModifiers.dexterity,
          proficiencyBonus: armorProficiencies[armorCategory]?.bonus || 0,
          effectDexCap,
        })
      : null;
    const acDerived = derivedAc != null;
    const armorClass = {
      value: acDerived ? derivedAc : ac,
      derived: acDerived,
      source: !acDerived ? 'scalar' : wornArmor ? 'armor' : 'unarmored',
      category: acDerived ? armorCategory : null,
      armorName: wornArmor ? wornArmor.name : null,
    };

    // ── Speed (SP1 #1220 / SP2 #1221) ────────────────────────────────────────
    // The derivation spine: authored base + condition penalties (Encumbered) +
    // effect stat:'speed' modifiers (mutagens, Drums of War) + untyped gear
    // penalties — the worn armor's speedPenalty (reduced 5 ft when Strength
    // meets armor.strength) and a held tower shield's — floored at 5 ft.
    // Exposed as an object ({ base, total, breakdown }); the sheet renders the
    // derived total and must NOT layer mod('speed') on top — that channel is
    // already inside this derivation. Worn-gear bonuses + Bulk encumbrance land
    // in SP3. Encounter reachable grids stay Foundry-authoritative
    // (cnmh_moveopts_) — this is display/accounting truth.
    const conditionMods = computeConditionEffects(
      hydrateConditions(Array.isArray(activeConditions) ? activeConditions : []),
      keyAbility,
      level,
    );
    const effectMods = computeEffectBonuses(activeEffects, effectCatalog);
    const speed = deriveSpeed({
      base: character.speed,
      modifiers: combineModifiers(conditionMods.speed, effectMods.speed),
      gearPenalties: [
        armorSpeedPenalty(wornArmor, abilityScores.strength),
        shieldSpeedPenalty(effectiveInventory),
      ].filter(Boolean),
    });

    // ── Bulk ────────────────────────────────────────────────────────────────
    const bulkStats = calculateEnhancedBulkLimit(character);
    const totalBulk = calculateItemsBulk(effectiveInventory);

    // ── Combat ──────────────────────────────────────────────────────────────
    const strikes     = [
      // Active whetstone effects alter their bound weapon's strikes (#1214).
      ...getStrikes(charEff, chambers, whetstonesByWeaponUid(activeEffects)),
      ...(blade?.active ? bladeStrikes(charEff) : []),
      // A shield attachment bound to a HELD shield contributes its own Strike.
      ...attachmentStrikes(charEff, attached),
      // Every held shield fights back (#1230): a derived Shield Bash — replaced
      // by the attachment's Strike above when one is bound — plus a Shield
      // Throw when the shield has the Thrown trait (Throwing rune).
      ...shieldBashStrikes(charEff, attached),
    ];
    const actions     = getActions(charEff);
    const reactions   = getReactions(charEff);
    const freeActions = getFreeActions(charEff);

    // ── Spellcasting ────────────────────────────────────────────────────────
    const spellcasting = character.spellcasting || {};
    // Apex (#967 R8): an invested apex item (the platinum power ring's grade
    // override) boosts the spellcasting attribute modifier to max(mod+1, +4),
    // flowing to both spell Atk and DC. `.some()` grants the benefit once no
    // matter how many apex items are invested (single-apex is also enforced at
    // the invest gate — AttunedArea).
    const apexInvested = effectiveInventory.some(
      (e) => e?.apex && !!(investedMap || {})[itemUidOf(e)],
    );
    const spellStats   = calculateSpellStats(character, { apex: apexInvested });

    // Effective daily slot totals (#1093): the authored spell_slots plus any
    // worn-and-invested bonusSlots gear (Ring of Wizardry). THE display/spend
    // source of truth — useCastingResources and the repertoire pips both read
    // this, never spell_slots directly, so they can't drift apart.
    const baseSlots = spellcasting.spell_slots || {};
    const bonusSlotRanks = wornBonusSlots(
      effectiveInventory,
      (itemUid) => !!(investedMap || {})[itemUid],
      spellcasting.tradition,
    );
    const spellSlotTotals = Object.keys(bonusSlotRanks).length
      ? Object.fromEntries(
          [...new Set([...Object.keys(baseSlots), ...Object.keys(bonusSlotRanks)])].map((r) => [
            r,
            (baseSlots[r] || 0) + (bonusSlotRanks[r] || 0),
          ])
        )
      : baseSlots;

    // Tradition gating (epic #645, S3): a scroll/wand spell is only castable if
    // it shares a tradition with the caster — wrong-tradition copies are hidden
    // from the castable lists entirely (the physical item still shows in
    // inventory). Innate spells are exempt and never routed through here.
    const scrollItems  = findScrollItems(charEff);
    const scrollSpells = extractScrollSpells(scrollItems)
      .filter((sp) => canActivateSpellItem(character, sp, { itemType: 'scroll' }));

    const wandItems    = findWandItems(charEff);
    const wandSpells   = extractWandSpells(wandItems)
      .filter((sp) => canActivateSpellItem(character, sp, { itemType: 'wand' }));

    const innateSpells = extractInnateSpells(character) || [];

    // The staff lives on a resolved inventory item's `.staff` block (the
    // ref/uid link IS the link — no fragile name matching, and artifact
    // gating may withhold it until the owner is high enough level). It is
    // castable only while that entry is held (or flagged noHandRequired).
    // Staff preparation (#957 S6a): staves have no charges by default. The
    // caster prepares ONE staff per day (cnmh_staffprep), which then carries the
    // charges stored in the overlay. The prepared staff is the "active" one; if
    // none is prepared we still surface the first held staff so its category
    // shows (with 0 charges + a prepare hint). charges.max is derived here so
    // StaffSpells / useCastingResources keep reading staff.charges.max unchanged.
    const staffItems  = effectiveInventory.filter((e) => e && e.staff);
    const preparedStaffId = staffPrep?.staffId ?? null;
    const staffItem   = staffItems.find((it) => itemUidOf(it) === preparedStaffId)
                        || staffItems[0] || null;
    const staffPrepared = !!staffItem && itemUidOf(staffItem) === preparedStaffId;
    const staffChargesMax = staffPrepared ? (staffPrep?.charges ?? 0) : 0;
    const staff       = staffItem
      ? { ...staffItem.staff, charges: { max: staffChargesMax, current: staffChargesMax } }
      : null;
    const staffActive = staff ? itemAbilitiesActive(staffItem) : false;
    const staves      = listStaves(effectiveInventory);
    // Tradition gating (epic #645, S4): cast a spell from a staff and you must
    // share its tradition — non-matching staff spells are hidden, same as
    // scrolls/wands. A staff whose spells are all off-tradition shows no
    // category button (hasStaff derives from the gated list below).
    const staffSpells = (staff?.spells || [])
      .filter((s) => canActivateSpellItem(character, s, { itemType: 'staff' }))
      .map((s) => ({
        ...s,
        fromStaff: true,
        staffName: staff?.name || staffItem?.name || 'Staff',
        active: staffActive,
      }));

    const eldPowers   = spellcasting.eldPowers || [];

    // The focus/devotion/ki/bloodline spell LIST — never the focus-point pool.
    // Some sheets store a pool at spellcasting.focus ({ max, current }); taking
    // the first *array* among the known locations skips that object so it can't
    // masquerade as a spell list downstream (a non-array here crashed
    // buildReactionSources' .filter). Mirrors FOCUS_SPELL_PATHS' priority.
    const focusSpells = [
      character.focus_spells,
      spellcasting.focus,
      character.champion?.devotion_spells,
      character.monk?.ki_spells,
      spellcasting.bloodline?.focus_spells,
    ].find(Array.isArray) || [];

    // ── Feature flags ────────────────────────────────────────────────────────
    // Centralises all "does this character have X?" checks so components
    // don't need to inspect raw JSON structure.
    const flags = {
      // Data-driven, not feat-gated (#1131): the authored familiar/companion
      // block is what every surface renders from, and other consumers
      // (ActionsList, TurnTrackerPanel) already key off it — a feat named
      // differently (Improved Familiar) or a feat without the data block would
      // otherwise split the surfaces (Command section without masthead button,
      // or a dead button with nothing to open).
      hasFamiliar              : !!character.familiar,
      hasAnimalCompanion       : !!character.animalCompanion,
      hasHeftyHauler           : hasFeat(character, FEAT_NAMES.HEFTY_HAULER),
      hasUntrainedImprovisation: hasFeat(character, FEAT_NAMES.UNTRAINED_IMPROVISATION),
      hasHarrowing             : hasFeat(character, FEAT_NAMES.HARROWER_DEDICATION),
      hasSpellcasting          : !!spellcasting.tradition,
      hasFocusSpells           : !!(
        character.champion?.devotion_spells ||
        spellcasting.focus ||
        character.monk?.ki_spells ||
        (character.focus_spells && character.focus_spells.length > 0)
      ),
      hasInnateSpells          : innateSpells.length > 0,
      // Gated by tradition: a character holding only wrong-tradition scrolls/
      // wands gets no category button (the list would be empty anyway).
      hasScrolls               : scrollSpells.length > 0,
      hasWands                 : wandSpells.length > 0,
      hasStaff                 : staffSpells.length > 0,
      staffActive              : staffActive,
      hasEldPowers             : eldPowers.length > 0,
      isThaumaturge            : character.class === 'Thaumaturge' && !!character.thaumaturge,
    };

    // ── Raw passthrough ──────────────────────────────────────────────────────
    // Structural/display data that components still need as-is.
    // All raw JSON access is funnelled through here so that the shape of
    // the player files is only known to this hook.
    const feats           = character.feats || [];
    const inventory       = effectiveInventory;
    const familiar        = character.familiar || null;
    const animalCompanion = character.animalCompanion || null;
    const thaumaturge     = character.thaumaturge || null;
    const champion        = character.champion || null;
    const monk            = character.monk || null;

    return {
      // Identity
      id,
      name,
      level,
      ancestry,
      background,
      characterClass,
      keyAbility,
      size,
      speed,
      senses,
      maxHp,
      ac,
      armorClass,
      saves,

      // Abilities
      abilityScores,
      abilityModifiers,

      // Skills
      skillModifiers,
      skillProficiencies,
      itemBonuses,
      loreSkills,

      // Proficiencies & DC
      proficiencies,
      armorProficiencies,
      classDC,

      // Bulk
      bulkStats,
      totalBulk,

      // Combat
      strikes,
      actions,
      reactions,
      freeActions,

      // Spellcasting
      spellcasting,
      spellSlotTotals,
      spellStats,
      scrollItems,
      scrollSpells,
      wandItems,
      wandSpells,
      innateSpells,
      staff,
      staffSpells,
      staves,
      staffPrepared,
      eldPowers,
      focusSpells,

      // Feature flags
      flags,

      // Raw passthrough
      feats,
      inventory,
      familiar,
      animalCompanion,
      thaumaturge,
      champion,
      monk,
    };
  }, [character, loadout, chambers, blade, attached, staffPrep, runeConfig, itemModeState, investedMap, resolvedAcquired, removed, activeConditions, activeEffects, effectCatalog]);

  // Combine the memoized computed character with the live sync state.
  // Wrapped in useMemo so downstream components don't re-render when neither
  // the character data nor the synced values have actually changed.
  return useMemo(
    () => charMemo ? { ...charMemo, hp, setHp, heroPoints, setHeroPoints } : null,
    [charMemo, hp, setHp, heroPoints, setHeroPoints]
  );
};
