// Snapshot integrity gate: verifies that the committed snapshot's item catalog
// and character inventories satisfy the structural invariants required by the
// resolution layer (ContentContext, SpellUtils, InventoryUtils). Runs the REAL
// src/utils functions so any regression in resolution logic is caught here.
import { sampleCharacters, items, spells } from './index';
import { itemCatalogMap, spellCatalogMap, resolveCharacterItems } from '../utils/contentUtils';
import {
  findScrollItems,
  findWandItems,
  extractScrollSpells,
  extractWandSpells,
} from '../utils/SpellUtils';
import { getItemBonus } from '../utils/CharacterUtils';
import { wornResistanceFor } from '../utils/wornGear';

const catalogMap = itemCatalogMap(items);
const spellMap = spellCatalogMap(spells);

const everyEntry = (list, fn) =>
  (Array.isArray(list) ? list : []).every(
    (e) => fn(e) && (!e.container || !e.container.contents || everyEntry(e.container.contents, fn))
  );
const collectRefs = (list, acc = []) => {
  (Array.isArray(list) ? list : []).forEach((e) => {
    if (e && e.ref != null) acc.push(String(e.ref));
    if (e && e.container && e.container.contents) collectRefs(e.container.contents, acc);
  });
  return acc;
};
// An inventory entry is a catalog reference — or a base-resolver scroll/wand
// (#812): `{ scroll|wand: { spellRef } }` with no ref, the shape the shop
// picker (#856) writes and GM reconciliation (#555) commits into the char doc.
// resolveInventoryItem derives the full item from the spell, so these carry no
// inline item data either.
const isCatalogRef = (e) => e && typeof e.ref === 'string' && !!e.ref;
const isBaseScrollWand = (e) =>
  e && e.ref == null &&
  (typeof e.scroll?.spellRef === 'string' || typeof e.wand?.spellRef === 'string');
const collectSpellRefs = (list, acc = []) => {
  (Array.isArray(list) ? list : []).forEach((e) => {
    if (isBaseScrollWand(e)) acc.push(String(e.scroll?.spellRef ?? e.wand?.spellRef));
    if (e && e.container && e.container.contents) collectSpellRefs(e.container.contents, acc);
  });
  return acc;
};

describe('bundled item catalog (Slice 3)', () => {
  it('has a non-empty catalog with unique, named, slug ids', () => {
    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    // Every item has a slug id and an authored name — except scrolls/wands,
    // whose name is derived from the embedded spell (#812 S5).
    expect(items.every((i) =>
      typeof i.id === 'string' && i.id &&
      ((typeof i.name === 'string' && i.name) || i.scroll || i.wand)
    )).toBe(true);
    // Catalog holds shared definitions only — never per-character data.
    expect(
      items.some((i) => i.quantity != null || i.invested != null || (i.container && i.container.contents))
    ).toBe(false);
  });

  it('every bundled character inventory is pure references (no inline items)', () => {
    sampleCharacters.forEach((c) => {
      expect(everyEntry(c.inventory, (e) => isCatalogRef(e) || isBaseScrollWand(e))).toBe(true);
    });
  });

  it('has no dangling references anywhere (incl. nested container contents)', () => {
    sampleCharacters.forEach((c) => {
      collectRefs(c.inventory).forEach((ref) =>
        expect(catalogMap.has(ref)).toBe(true)
      );
      // Base-resolver scroll/wand entries reference the SPELL catalog instead.
      collectSpellRefs(c.inventory).forEach((ref) =>
        expect(spellMap.has(ref)).toBe(true)
      );
    });
  });

  it('scrolls and wands are still detected after resolution, with named spells', () => {
    const resolvedChars = sampleCharacters.map((c) => resolveCharacterItems(c, items, spells));

    const allScrolls = resolvedChars.flatMap(findScrollItems);
    const allWands = resolvedChars.flatMap(findWandItems);
    expect(allScrolls.length).toBeGreaterThan(0);
    expect(allWands.length).toBeGreaterThan(0);
    expect(extractScrollSpells(allScrolls).every((s) => s.name && s.fromScroll)).toBe(true);
    expect(extractWandSpells(allWands).every((s) => s.name && s.fromWand)).toBe(true);

    // Izzy carries both a scroll and a wand — the canonical regression case.
    const izzy = resolvedChars.find((c) => c.id === 'IzzyUncut');
    expect(findScrollItems(izzy).length).toBeGreaterThan(0);
    expect(findWandItems(izzy).length).toBeGreaterThan(0);
  });

  it('spell catalog has unique, named, slug ids and a single deduped Cleanse Affliction', () => {
    expect(spells.length).toBeGreaterThan(0);
    expect(new Set(spells.map((s) => s.id)).size).toBe(spells.length);
    expect(
      spells.every((s) => typeof s.id === 'string' && s.id && typeof s.name === 'string' && s.name)
    ).toBe(true);
    // Cleanse Affliction was inlined in both a scroll and a wand — now one entry.
    expect(spells.filter((s) => s.name === 'Cleanse Affliction')).toHaveLength(1);
    const scroll = items.find((i) => i.id === 'scroll-of-cleanse-affliction');
    const wand = items.find((i) => i.id === 'wand-of-cleanse-affliction');
    expect(scroll.scroll.spellRef).toBe('cleanse-affliction');
    expect(wand.wand.spellRef).toBe('cleanse-affliction');
  });

  it('Xanderghul\'s Hammer is one catalog item: weapon + staff + artifact', () => {
    const hammer = items.find((i) => i.id === 'xanderghuls-flawless-hammer');
    expect(hammer.strikes).toBeTruthy();
    expect(Array.isArray(hammer.reactions)).toBe(true);
    expect(Array.isArray(hammer.staff && hammer.staff.spells)).toBe(true);
    expect(hammer.staff.spells.every((s) => typeof s.ref === 'string')).toBe(true);
    expect(Array.isArray(hammer.artifact && hammer.artifact.tiers)).toBe(true);

    // Jade is level 4 — every artifact tier (incl. the staff at L4) is unlocked.
    const jade = sampleCharacters.find((c) => c.id === 'JadeInferno');
    const rJade = resolveCharacterItems(jade, items, spells).inventory;
    const rHammer = rJade.find((e) => e.id === 'xanderghuls-flawless-hammer');
    expect(rHammer.strikes && rHammer.reactions && rHammer.staff).toBeTruthy();
    expect(rHammer.staff.spells).toHaveLength(8);
    expect(rHammer.staff.spells.every((s) => s.name && s.ref == null)).toBe(true);

    // A pre-tier owner: the staff is gated off until the artifact unlocks it.
    const lowLvl = resolveCharacterItems({ ...jade, level: 1 }, items, spells).inventory;
    const lowHammer = lowLvl.find((e) => e.id === 'xanderghuls-flawless-hammer');
    expect(lowHammer.staff).toBeUndefined();
    expect(lowHammer.strikes).toBeTruthy();
  });

  // #904 — the five Coda instrument staves: one catalog item each, grades via
  // level-keyed variants that carry their own (cumulative) staff spell list.
  // Holding a given grade resolves to that grade's list with every ref inlined.
  it('Coda instrument staves resolve to per-grade staff spell lists', () => {
    const STAVES = [
      'bagpipes-of-turmoil', 'entertainers-lute', 'drums-of-war',
      'pipes-of-compulsion', 'tricksters-mandolin',
    ];
    const GRADES = [
      { level: 4, type: 'Standard', charges: 2 },
      { level: 8, type: 'Greater', charges: 4 },
      { level: 12, type: 'Major', charges: 6 },
    ];
    const resolveStaff = (id, level) => {
      const owner = { id: 'tester', level: 20, inventory: [{ ref: id, level }] };
      return resolveCharacterItems(owner, items, spells).inventory[0].staff;
    };

    STAVES.forEach((id) => {
      // The base catalog item is a Standard-grade staff with a multi-grade
      // variants array.
      const cat = items.find((i) => i.id === id);
      expect(cat).toBeTruthy();
      expect(cat.staff.type).toBe('Standard');
      expect(cat.variants.map((v) => v.label)).toEqual(['Standard', 'Greater', 'Major']);

      const counts = GRADES.map((g) => {
        const st = resolveStaff(id, g.level);
        expect(st.type).toBe(g.type);
        expect(st.charges.max).toBe(g.charges);
        // Every staff spell is a real, inlined catalog spell (no dangling refs).
        expect(st.spells.length).toBeGreaterThan(0);
        expect(st.spells.every((s) => s.name && !s.name.startsWith('(unknown') && s.ref == null)).toBe(true);
        return st.spells.length;
      });
      // Grades are cumulative: Major ⊃ Greater ⊃ Standard.
      expect(counts[0]).toBeLessThan(counts[1]);
      expect(counts[1]).toBeLessThan(counts[2]);
    });
  });

  it('multi-level items have variants with numeric level and string label', () => {
    const multiLevel = items.filter((i) => Array.isArray(i.variants) && i.variants.length > 0);
    expect(multiLevel.length).toBeGreaterThan(0);
    multiLevel.forEach((item) => {
      item.variants.forEach((v) => {
        expect(typeof v.level).toBe('number');
        expect(typeof v.label).toBe('string');
        expect(v.label.length).toBeGreaterThan(0);
      });
    });
    // Spot-check the four recipe items added in the crafting initiative.
    const ids = multiLevel.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['antidote', 'antiplague', 'eagle-eye-elixir', 'elixir-of-life']));
  });

  // #907: a variant may carry `overrides` with variant-specific mechanical
  // fields. Only allowlisted keys are permitted; widen this list as later slices
  // make more fields variant-aware (S1 bonus, S2 container; S3 resistance).
  // #967 (R1): the power ring's grade ladder carries its mechanical contract —
  // itemBonus / ringSockets / cantripSlots / apex — per grade.
  const OVERRIDE_ALLOWLIST = ['bonus', 'container', 'resistance', 'itemBonus', 'ringSockets', 'cantripSlots', 'apex'];
  it('variant overrides use only allowlisted, well-formed keys', () => {
    items.forEach((item) => {
      (Array.isArray(item.variants) ? item.variants : []).forEach((v) => {
        if (v.overrides == null) return;
        expect(typeof v.overrides).toBe('object');
        Object.keys(v.overrides).forEach((k) => expect(OVERRIDE_ALLOWLIST).toContain(k));
        if (v.overrides.bonus !== undefined) {
          expect(Array.isArray(v.overrides.bonus)).toBe(true);
          expect(typeof v.overrides.bonus[0]).toBe('string');
          expect(typeof v.overrides.bonus[1]).toBe('number');
        }
        if (v.overrides.container !== undefined) {
          expect(typeof v.overrides.container.capacity).toBe('number');
          expect(typeof v.overrides.container.ignored).toBe('number');
        }
        // #911: a structured resistance — { amount: number, type: string } where
        // `type` is the damage descriptor (the `vs` token bridged by wornGear).
        if (v.overrides.resistance !== undefined) {
          expect(typeof v.overrides.resistance.amount).toBe('number');
          expect(typeof v.overrides.resistance.type).toBe('string');
          expect(v.overrides.resistance.type.length).toBeGreaterThan(0);
        }
        // #967 (R1): power-ring grade contract — all numeric except `apex`.
        if (v.overrides.itemBonus !== undefined) expect(typeof v.overrides.itemBonus).toBe('number');
        if (v.overrides.ringSockets !== undefined) expect(typeof v.overrides.ringSockets).toBe('number');
        if (v.overrides.cantripSlots !== undefined) expect(typeof v.overrides.cantripSlots).toBe('number');
        if (v.overrides.apex !== undefined) expect(typeof v.overrides.apex).toBe('boolean');
      });
    });
  });

  it('Cloak of Repute tiers resolve to the override bonus and drop the overrides key', () => {
    const owner = { id: 'tester', level: 20, inventory: [{ ref: 'cloak-of-repute', level: 9 }] };
    const resolvedGreater = resolveCharacterItems(owner, items, spells);
    const greater = resolvedGreater.inventory[0];
    expect(greater.bonus).toEqual(['diplomacy', 2]);
    expect(greater.overrides).toBeUndefined();
    // End-to-end: the sheet's skill bonus reads the override (+2, not the base +1).
    expect(getItemBonus(resolvedGreater, 'diplomacy')).toBe(2);
    // Standard tier keeps the base +1 bonus.
    const std = resolveCharacterItems(
      { ...owner, inventory: [{ ref: 'cloak-of-repute', level: 4 }] }, items, spells
    ).inventory[0];
    expect(std.bonus).toEqual(['diplomacy', 1]);
  });

  it('Sleeves of Storage Greater resolves to the override container capacity', () => {
    const owner = { id: 'tester', level: 20, inventory: [{ ref: 'sleeves-of-storage', level: 9 }] };
    const greater = resolveCharacterItems(owner, items, spells).inventory[0];
    expect(greater.container.capacity).toBe(40);
    expect(greater.container.ignored).toBe(40);
    expect(greater.overrides).toBeUndefined();
    // contents still resolve (container plumbing intact).
    expect(Array.isArray(greater.container.contents)).toBe(true);
    // Standard tier keeps the base 10-Bulk capacity.
    const std = resolveCharacterItems(
      { ...owner, inventory: [{ ref: 'sleeves-of-storage', level: 4 }] }, items, spells
    ).inventory[0];
    expect(std.container.capacity).toBe(10);
  });

  // #911 "Done when": a fire Energy Robe grants fire resistance 5 and a cold one
  // grants cold resistance 5 from the same base item via per-variant overrides.
  it('Energy Robe variants resolve to per-energy resistance and read through wornGear', () => {
    const owner = { id: 'tester', level: 20 };
    const resolve = (level) =>
      resolveCharacterItems({ ...owner, inventory: [{ ref: 'energy-robe', level }] }, items, spells)
        .inventory[0];

    const fire = resolve(7);
    expect(fire.resistance).toEqual({ amount: 5, type: 'fire' });
    expect(fire.overrides).toBeUndefined();
    const invested = () => true;
    expect(wornResistanceFor([fire], invested, 'fire')).toBe(5);
    expect(wornResistanceFor([fire], invested, 'cold')).toBe(0);

    // Same base item, cold variant ⇒ cold resistance, not fire.
    const cold = resolve(8);
    expect(cold.resistance).toEqual({ amount: 5, type: 'cold' });
    expect(wornResistanceFor([cold], invested, 'cold')).toBe(5);
    expect(wornResistanceFor([cold], invested, 'fire')).toBe(0);
  });

  it('Blu\'s orb is tagged Artifact but mechanically inert', () => {
    const orb = items.find((i) => i.id === 'mysterious-blue-orb');
    expect(orb.traits).toContain('Artifact');
    expect(orb.artifact).toEqual({ tiers: [] });
    expect(orb.strikes || orb.staff || orb.scroll || orb.wand || orb.actions).toBeFalsy();
  });
});
