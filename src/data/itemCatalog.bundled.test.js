// Slice 3 gate: the authoritative, CI-run guarantee that converting the
// bundled sheets to catalog + refs is lossless. Runs the REAL src/utils
// resolution + bulk + spell functions (the build script only mirrors them).
import { sampleCharacters, items, spells } from './index';
import { itemCatalogMap, resolveCharacterItems } from '../utils/contentUtils';
import { calculateItemsBulk } from '../utils/InventoryUtils';
import {
  findScrollItems,
  findWandItems,
  extractScrollSpells,
  extractWandSpells,
} from '../utils/SpellUtils';
import preCatalog from './__fixtures__/preCatalogInventories.json';

const catalogMap = itemCatalogMap(items);

// Resolution restamps item-level id; the original sheets only sporadically
// carried one, so strip it (recursively through container contents) before
// comparing shapes. `uid` (Slice 1 stable per-entry id) is likewise added
// metadata the pre-catalog fixture predates — strip it too. The nested
// scroll/wand/staff spell `id` is the same story: it was always a cosmetic,
// often-duplicated value ("spell-1") and is now the spell-catalog slug — strip
// it the same way. Everything else must match exactly.
const stripSpellId = (s) => {
  if (!s || typeof s !== 'object') return s;
  const c = { ...s };
  delete c.id;
  return c;
};
const stripIds = (list) =>
  (Array.isArray(list) ? list : []).map((it) => {
    if (!it || typeof it !== 'object') return it;
    const out = { ...it };
    delete out.id;
    delete out.uid;
    if (out.scroll && typeof out.scroll === 'object') out.scroll = stripSpellId(out.scroll);
    if (out.wand && typeof out.wand === 'object') out.wand = stripSpellId(out.wand);
    if (out.staff && Array.isArray(out.staff.spells)) {
      out.staff = { ...out.staff, spells: out.staff.spells.map(stripSpellId) };
    }
    if (out.container && Array.isArray(out.container.contents)) {
      out.container = { ...out.container, contents: stripIds(out.container.contents) };
    }
    return out;
  });

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

describe('bundled item catalog (Slice 3)', () => {
  it('has a non-empty catalog with unique, named, slug ids', () => {
    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.every((i) => typeof i.id === 'string' && i.id && typeof i.name === 'string' && i.name)).toBe(true);
    // Catalog holds shared definitions only — never per-character data.
    expect(
      items.some((i) => i.quantity != null || i.invested != null || (i.container && i.container.contents))
    ).toBe(false);
  });

  it('every bundled character inventory is pure references (no inline items)', () => {
    sampleCharacters.forEach((c) => {
      expect(everyEntry(c.inventory, (e) => e && typeof e.ref === 'string' && e.ref)).toBe(true);
    });
  });

  it('has no dangling references anywhere (incl. nested container contents)', () => {
    sampleCharacters.forEach((c) => {
      collectRefs(c.inventory).forEach((ref) =>
        expect(catalogMap.has(ref)).toBe(true)
      );
    });
  });

  it('resolves every character back to its pre-conversion inventory (ignoring restamped id)', () => {
    sampleCharacters.forEach((c) => {
      const original = preCatalog[c.id];
      expect(Array.isArray(original)).toBe(true);
      // Resolve via the character so artifact tiers gate on its level and
      // spell refs inline from the catalog (mirrors ContentContext).
      const resolved = resolveCharacterItems(c, items, spells).inventory;
      expect(stripIds(resolved)).toEqual(stripIds(original));
    });
  });

  it('preserves total Bulk exactly for every character (golden parity vs fixture)', () => {
    sampleCharacters.forEach((c) => {
      const original = preCatalog[c.id];
      const resolved = resolveCharacterItems(c, items, spells).inventory;
      expect(calculateItemsBulk(resolved)).toBe(calculateItemsBulk(original));
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

  it('Xanderghul’s Hammer is one catalog item: weapon + staff + artifact', () => {
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

  it('Blu’s orb is tagged Artifact but mechanically inert', () => {
    const orb = items.find((i) => i.id === 'mysterious-blue-orb');
    expect(orb.traits).toContain('Artifact');
    expect(orb.artifact).toEqual({ tiers: [] });
    expect(orb.strikes || orb.staff || orb.scroll || orb.wand || orb.actions).toBeFalsy();
  });
});
