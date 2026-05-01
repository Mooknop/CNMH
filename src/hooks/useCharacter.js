// src/hooks/useCharacter.js
// Data layer hook — all reads from player data and derived calculations go through here.
// Components should call useCharacter(character) and destructure what they need.
// Never import directly from utils in components; use this hook instead.

import { useMemo } from 'react';

import {
  getAbilityModifier,
  getSkillModifier,
  getItemBonus,
  SKILL_ABILITY_MAP,
  calculateClassDC,
  calculateEnhancedBulkLimit,
  hasFeat,
} from '../utils/CharacterUtils';

import {
  getStrikes,
  getActions,
  getReactions,
  getFreeActions,
} from '../utils/ActionsUtils';

import {
  calculateSpellStats,
  findScrollItems,
  extractScrollSpells,
  findWandItems,
  extractWandSpells,
  extractInnateSpells,
  findGemItems,
  extractGemSpells,
} from '../utils/SpellUtils';

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
  return useMemo(() => {
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
    const speed        = character.speed;
    const senses       = character.senses;
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

    // ── Skills ──────────────────────────────────────────────────────────────
    const skillModifiers = Object.fromEntries(
      Object.keys(SKILL_ABILITY_MAP).map(skillId => [
        skillId,
        getSkillModifier(character, skillId),
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
        getItemBonus(character, skillId),
      ])
    );

    // Lore skills (array of { name, proficiency } from JSON)
    const loreSkills = Array.isArray(rawSkills.lore) ? rawSkills.lore : [];

    // ── Proficiencies & DC ──────────────────────────────────────────────────
    const proficiencies = character.proficiencies || {};
    const classDC = calculateClassDC(character);

    // ── Bulk ────────────────────────────────────────────────────────────────
    const bulkStats = calculateEnhancedBulkLimit(character);
    const totalBulk = calculateItemsBulk(character.inventory || []);

    // ── Combat ──────────────────────────────────────────────────────────────
    const strikes     = getStrikes(character);
    const actions     = getActions(character);
    const reactions   = getReactions(character);
    const freeActions = getFreeActions(character);

    // ── Spellcasting ────────────────────────────────────────────────────────
    const spellcasting = character.spellcasting || {};
    const spellStats   = calculateSpellStats(character);

    const scrollItems  = findScrollItems(character);
    const scrollSpells = extractScrollSpells(scrollItems);

    const wandItems    = findWandItems(character);
    const wandSpells   = extractWandSpells(wandItems);

    const gemItems     = findGemItems(character);
    const gemSpells    = extractGemSpells(gemItems);

    const innateSpells = extractInnateSpells(character);

    const staff       = character.staff || null;
    const staffSpells = staff?.spells || [];

    const eldPowers   = spellcasting.eldPowers || [];

    const focusSpells = (
      character.focus_spells ||
      spellcasting.focus ||
      character.champion?.devotion_spells ||
      character.monk?.ki_spells ||
      []
    );

    // ── Feature flags ────────────────────────────────────────────────────────
    // Centralises all "does this character have X?" checks so components
    // don't need to inspect raw JSON structure.
    const flags = {
      hasFamiliar              : hasFeat(character, 'Familiar'),
      hasAnimalCompanion       : hasFeat(character, 'Animal Companion'),
      hasHeftyHauler           : hasFeat(character, 'Hefty Hauler'),
      hasUntrainedImprovisation: hasFeat(character, 'Untrained Improvisation'),
      hasHarrowing             : !!(character.feats?.some(f => f.name === 'Harrower Dedication')),
      hasSpellcasting          : !!spellcasting.tradition,
      hasFocusSpells           : !!(
        character.champion?.devotion_spells ||
        spellcasting.focus ||
        character.monk?.ki_spells ||
        (character.focus_spells && character.focus_spells.length > 0)
      ),
      hasInnateSpells          : innateSpells.length > 0,
      hasScrolls               : scrollItems.length > 0,
      hasWands                 : wandItems.length > 0,
      hasGems                  : gemItems.length > 0,
      hasStaff                 : !!(staff?.name),
      hasEldPowers             : eldPowers.length > 0,
      isThaumaturge            : character.class === 'Thaumaturge' && !!character.thaumaturge,
    };

    // ── Raw passthrough ──────────────────────────────────────────────────────
    // Structural/display data that components still need as-is.
    // All raw JSON access is funnelled through here so that the shape of
    // the player files is only known to this hook.
    const feats           = character.feats || [];
    const inventory       = character.inventory || [];
    const familiar        = flags.hasFamiliar ? (character.familiar || null) : null;
    const animalCompanion = flags.hasAnimalCompanion ? (character.animalCompanion || null) : null;
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
      spellStats,
      scrollItems,
      scrollSpells,
      wandItems,
      wandSpells,
      gemItems,
      gemSpells,
      innateSpells,
      staff,
      staffSpells,
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
  }, [character]);
};
