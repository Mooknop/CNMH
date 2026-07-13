// Snapshot integrity gate: verifies that the committed snapshot's item catalog
// and character inventories satisfy the structural invariants required by the
// resolution layer (ContentContext, SpellUtils, InventoryUtils). Runs the REAL
// src/utils functions so any regression in resolution logic is caught here.
import { sampleCharacters, items, spells, effects } from './index';
import { itemCatalogMap, spellCatalogMap, resolveCharacterItems } from '../utils/contentUtils';
import {
  findScrollItems,
  findWandItems,
  extractScrollSpells,
  extractWandSpells,
} from '../utils/SpellUtils';
import { getItemBonus } from '../utils/CharacterUtils';
import { wornResistanceFor, itemModifiers } from '../utils/wornGear';
import { computeEffectBonuses, conditionalModifiersFor } from '../utils/EffectUtils';

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

  // #935 (S4) — while-playing bonuses: every playingEffect ref (base and Major
  // override) resolves to a real effect def with modifiers, and holding a given
  // grade resolves the item to that grade's ref.
  it('Coda staves carry playing-effect refs that resolve per grade', () => {
    const CODA_STAVES = [
      'bagpipes-of-turmoil', 'entertainers-lute', 'drums-of-war',
      'pipes-of-compulsion', 'tricksters-mandolin',
    ];
    const effectIds = new Set(effects.map((e) => e.id));
    CODA_STAVES.forEach((id) => {
      const cat = items.find((i) => i.id === id);
      expect(typeof cat.playingEffect).toBe('string');
      expect(effectIds.has(cat.playingEffect)).toBe(true);

      const major = cat.variants.find((v) => v.label === 'Major');
      expect(major.overrides.playingEffect).toBe(`${cat.playingEffect}-major`);
      expect(effectIds.has(major.overrides.playingEffect)).toBe(true);

      // Both defs carry effect-engine modifiers; the Major def is the +2 tier.
      const base = effects.find((e) => e.id === cat.playingEffect);
      const majorDef = effects.find((e) => e.id === major.overrides.playingEffect);
      [base, majorDef].forEach((def) => expect(def.modifiers.length).toBeGreaterThan(0));
      expect(base.modifiers.some((m) => m.kind === 'item' && m.amount === 1)).toBe(true);
      expect(majorDef.modifiers.some((m) => m.kind === 'item' && m.amount === 2)).toBe(true);

      // Resolution: Standard keeps the base ref, Major swaps to the +2 ref.
      const resolve = (level) => resolveCharacterItems(
        { id: 'tester', level: 20, inventory: [{ ref: id, level }] }, items, spells
      ).inventory[0];
      expect(resolve(4).playingEffect).toBe(cat.playingEffect);
      const rMajor = resolve(12);
      expect(rMajor.playingEffect).toBe(`${cat.playingEffect}-major`);
      expect(rMajor.overrides).toBeUndefined();
    });

    // The Drums of War also grant a status Speed bonus while playing.
    const drums = effects.find((e) => e.id === 'coda-drums-playing');
    expect(drums.modifiers).toContainEqual({ stat: 'speed', kind: 'status', amount: 5 });
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
  // #935 (S4): a Coda staff's Major grade overrides `playingEffect` — the ref
  // into the effect catalog its while-playing bonuses come from — to the +2 def.
  // #1210 (M4h): a graded sense-granting item (the Bloodstained Bandana) carries
  // its per-grade `sense: { name, precision?, rangeFt? }` block as an override.
  // #914: a tier-gated item-granted innate spell — only the qualifying variant
  // (Ring of Observation Moderate/Greater) carries the `grantedSpells` grant.
  // #912: a variant-tiered worn-gear `modifiers` array (Backfire Mantle's Reflex-
  // vs-spells hint scales +1 → +2 across grades).
  const OVERRIDE_ALLOWLIST = ['bonus', 'container', 'resistance', 'itemBonus', 'ringSockets', 'cantripSlots', 'apex', 'playingEffect', 'sense', 'grantedSpells', 'modifiers'];
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
        // #1210 (M4h): a sense block — a non-empty `name`, with optional string
        // precision and numeric range.
        if (v.overrides.sense !== undefined) {
          expect(typeof v.overrides.sense.name).toBe('string');
          expect(v.overrides.sense.name.length).toBeGreaterThan(0);
          if (v.overrides.sense.precision !== undefined) expect(typeof v.overrides.sense.precision).toBe('string');
          if (v.overrides.sense.rangeFt !== undefined) expect(typeof v.overrides.sense.rangeFt).toBe('number');
        }
        // #914: a tier-gated item-granted spell list — each grant is { ref, … }
        // where `ref` is a catalog spell id (#622).
        if (v.overrides.grantedSpells !== undefined) {
          expect(Array.isArray(v.overrides.grantedSpells)).toBe(true);
          v.overrides.grantedSpells.forEach((g) => {
            expect(typeof g.ref).toBe('string');
            expect(g.ref.length).toBeGreaterThan(0);
          });
        }
        // #912: a variant-tiered worn-gear modifiers list — each is a
        // { stat, amount } bonus modifier (kind/vs optional).
        if (v.overrides.modifiers !== undefined) {
          expect(Array.isArray(v.overrides.modifiers)).toBe(true);
          v.overrides.modifiers.forEach((m) => {
            expect(typeof m.stat).toBe('string');
            expect(typeof m.amount).toBe('number');
          });
        }
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

  it('Ring of Observation tiers gate the item-granted invisibility grant (#914)', () => {
    const at = (level) => resolveCharacterItems(
      { id: 'tester', level: 20, inventory: [{ ref: 'ring-of-observation', level }] }, items, spells
    ).inventory[0];
    // Lesser (L3): no spell grant.
    expect(at(3).grantedSpells).toBeUndefined();
    // Moderate (L7): invisibility, rank 2, once/day; the overrides key is dropped.
    const mod = at(7);
    expect(mod.overrides).toBeUndefined();
    expect(mod.grantedSpells).toEqual([
      { ref: 'invisibility', tradition: 'arcane', rank: 2, frequency: 'once per day' },
    ]);
    // Greater (L10): heightened to 4th-rank invisibility.
    expect(at(10).grantedSpells).toEqual([
      { ref: 'invisibility', tradition: 'arcane', rank: 4, frequency: 'once per day' },
    ]);
  });

  it('specific magic weapons carry their intrinsic damage riders (#1439)', () => {
    const riders = (id) => (items.find((i) => i.id === id)?.strikes?.[0]?.riders) || [];
    // Unconditional flat extra damage (Monarch-style intrinsic rider, #1085).
    expect(riders('storm-hammer')).toContainEqual(expect.objectContaining({ dice: '1', type: 'electricity' }));
    expect(riders('alicorn-lance')).toContainEqual(expect.objectContaining({ dice: '1', type: 'spirit' }));
    // Conditional riders carry a note (player-applied toggle); crit-gated via `on`.
    expect(riders('hunters-bow')).toContainEqual(expect.objectContaining({ dice: '1d6', on: ['criticalSuccess'] }));
    expect(riders('gloom-blade')).toContainEqual(expect.objectContaining({ dice: '1d6', type: 'precision' }));
    // End-to-end pass-through is covered by strikeUtils' Monarch intrinsic-rider test.
  });

  it('Serpent Dagger carries an on-crit save (#1439)', () => {
    const sd = items.find((i) => i.id === 'serpent-dagger');
    const melee = (Array.isArray(sd.strikes) ? sd.strikes : [sd.strikes]).find((s) => s.type === 'melee');
    expect(melee.onCritSave).toMatchObject({ defense: 'fortitude', dc: 19 });
    expect(melee.onCritSave.conditions.failure).toContainEqual(
      expect.objectContaining({ id: 'sickened', value: 1 }),
    );
  });

  it('alchemical bombs carry item-level no-save on-crit conditions (#1439 tail)', () => {
    const cond = (id) => items.find((i) => i.id === id)?.onCritConditions || [];
    expect(cond('necrotic-bomb')).toContainEqual(expect.objectContaining({ id: 'sickened', value: 1 }));
    expect(cond('mud-bomb')).toContainEqual(expect.objectContaining({ id: 'dazzled' }));
    expect(cond('pressure-bomb')).toContainEqual(expect.objectContaining({ id: 'prone' }));
    expect(cond('redpitch-bomb')).toContainEqual(expect.objectContaining({ id: 'clumsy', value: 1 }));
    expect(cond('tallow-bomb')).toContainEqual(expect.objectContaining({ id: 'sickened', value: 1 }));
  });

  it('alchemical bottles carry item-level on-hit conditions (#1439 tail)', () => {
    const cond = (id) => items.find((i) => i.id === id)?.onHitConditions || [];
    expect(cond('bottled-lightning')).toContainEqual(expect.objectContaining({ id: 'off-guard' }));
    expect(cond('ghost-charge')).toContainEqual(expect.objectContaining({ id: 'enfeebled', value: 1 }));
    expect(cond('peshpine-grenade')).toContainEqual(expect.objectContaining({ id: 'stupefied', value: 1 }));
  });

  it('activated-ability items carry a save block (#1439)', () => {
    const act = (id) => items.find((i) => i.id === id)?.activatedSave;
    expect(act('sparkblade')).toMatchObject({ name: 'Lightning Arc', save: { defense: 'reflex', dc: 19, basic: true } });
    expect(act('sparkblade').save.damage).toMatchObject({ dice: '2d4+4', type: 'electricity' });
    expect(act('caterwaul-sling')).toMatchObject({ save: { defense: 'fortitude', dc: 21, basic: true } });
    expect(act('caterwaul-sling').save.conditions.failure).toContainEqual(expect.objectContaining({ id: 'deafened' }));
    expect(act('spoiling-buckler')).toMatchObject({ name: 'Tumbling Tumbleweed', save: { defense: 'reflex', dc: 19 } });
  });

  it('spell-grant activation items carry grantedSpells to real catalog spells (#914/#1439)', () => {
    const spellIds = new Set(spells.map((s) => s.id));
    const g = (id) => items.find((i) => i.id === id)?.grantedSpells || [];
    expect(g('vigilant-eye')).toContainEqual(expect.objectContaining({ ref: 'detect-magic' }));
    expect(g('spectacles-of-understanding')).toContainEqual(expect.objectContaining({ ref: 'translate', rank: 2, frequency: 'once per day' }));
    expect(g('cape-of-illumination')).toContainEqual(expect.objectContaining({ ref: 'light' }));
    // Refs resolve (#622).
    ['vigilant-eye', 'spectacles-of-understanding', 'cape-of-illumination'].forEach((id) =>
      g(id).forEach((grant) => expect(spellIds.has(grant.ref)).toBe(true)));
    // A base-level grant rides every tier (survives applyVariant).
    const resolved = resolveCharacterItems(
      { id: 't', level: 20, inventory: [{ ref: 'cape-of-illumination', level: 11 }] }, items, spells,
    ).inventory[0];
    expect(resolved.grantedSpells).toContainEqual(expect.objectContaining({ ref: 'light' }));
  });

  it('on-hit penalty throwables carry reminders + on-crit conditions (#1439 tail)', () => {
    const item = (id) => items.find((i) => i.id === id);
    expect(item('frost-vial').onHitNotes[0]).toMatch(/Speed/i);
    expect(item('sulfur-bomb').onHitNotes[0]).toMatch(/Perception/i);
    expect(item('sulfur-bomb').onCritConditions).toContainEqual(expect.objectContaining({ id: 'sickened', value: 1 }));
    expect(item('glue-bomb').onHitNotes[0]).toMatch(/Speed/i);
    expect(item('glue-bomb').onCritConditions).toContainEqual(expect.objectContaining({ id: 'immobilized' }));
  });

  it('worn items carry conditional save-hint modifiers (#912)', () => {
    // Aeon Stone (Polished Pebble): a conditional Fortitude hint (vs Grapple/Swallow).
    const pebble = items.find((i) => i.id === 'aeon-stone-polished-pebble');
    expect(pebble.modifiers).toContainEqual(
      expect.objectContaining({ stat: 'fort', amount: 1, vs: 'Grapple or Swallow' }),
    );
    // It is CONDITIONAL — never netted into the base Fortitude save.
    const effects = [{ id: 'peb', effectId: 'peb' }];
    const catalog = [{ id: 'peb', modifiers: itemModifiers(pebble) }];
    expect(computeEffectBonuses(effects, catalog).fort.total).toBe(0);
    expect(conditionalModifiersFor(effects, 'fort', catalog)).toContainEqual(
      expect.objectContaining({ vs: 'Grapple or Swallow' }),
    );

    // Backfire Mantle: variant-tiered Reflex-vs-spells hint via overrides.modifiers,
    // resolving alongside the existing splash-resistance override.
    const at = (level) => resolveCharacterItems(
      { id: 'tester', level: 20, inventory: [{ ref: 'backfire-mantle', level }] }, items, spells,
    ).inventory[0];
    const std = at(3);
    expect(std.overrides).toBeUndefined();
    expect(std.modifiers).toContainEqual(expect.objectContaining({ stat: 'reflex', amount: 1 }));
    expect(std.resistance).toEqual({ amount: 3, type: 'splash' });
    expect(at(8).modifiers).toContainEqual(expect.objectContaining({ stat: 'reflex', amount: 2 }));
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
