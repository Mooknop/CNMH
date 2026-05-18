// Slice 3 gate: the authoritative, CI-run guarantee that converting the
// bundled sheets to catalog + refs is lossless. Runs the REAL src/utils
// resolution + bulk + spell functions (the build script only mirrors them).
import { sampleCharacters, items } from './index';
import { itemCatalogMap, resolveInventory, resolveCharacterItems } from '../utils/contentUtils';
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
// metadata the pre-catalog fixture predates — strip it too. Everything else
// must match exactly.
const stripIds = (list) =>
  (Array.isArray(list) ? list : []).map((it) => {
    if (!it || typeof it !== 'object') return it;
    const out = { ...it };
    delete out.id;
    delete out.uid;
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
      const resolved = resolveInventory(c.inventory, catalogMap);
      expect(stripIds(resolved)).toEqual(stripIds(original));
    });
  });

  it('preserves total Bulk exactly for every character (golden parity vs fixture)', () => {
    sampleCharacters.forEach((c) => {
      const original = preCatalog[c.id];
      const resolved = resolveCharacterItems(c, items).inventory;
      expect(calculateItemsBulk(resolved)).toBe(calculateItemsBulk(original));
    });
  });

  it('scrolls and wands are still detected after resolution, with named spells', () => {
    const resolvedChars = sampleCharacters.map((c) => resolveCharacterItems(c, items));

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
});
