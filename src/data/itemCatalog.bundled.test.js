// Snapshot integrity gate: verifies that the committed snapshot's item catalog
// and character inventories satisfy the structural invariants required by the
// resolution layer (ContentContext, SpellUtils, InventoryUtils). Runs the REAL
// src/utils functions so any regression in resolution logic is caught here.
import { sampleCharacters, items, spells } from './index';
import { itemCatalogMap, resolveCharacterItems } from '../utils/contentUtils';
import {
  findScrollItems,
  findWandItems,
  extractScrollSpells,
  extractWandSpells,
} from '../utils/SpellUtils';

const catalogMap = itemCatalogMap(items);

// Resolution restamps item-level id; strip it (recursively through container
// contents) before shape comparisons. Strip uid + nested spell/staff ids the
// same way — those are stable per-entry or catalog-slug values that vary.
const stripSpellId = (s) => {
  if (!s || typeof s !== 'object') return s;
  const c = { ...s };
  delete c.id;
  delete c.effects;
  delete c.grants;
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

describe('bundled item catalog (snapshot)', () => {
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

  it('spell catalog has unique, named, slug ids', () => {
    expect(spells.length).toBeGreaterThan(0);
    expect(new Set(spells.map((s) => s.id)).size).toBe(spells.length);
    expect(
      spells.every((s) => typeof s.id === 'string' && s.id && typeof s.name === 'string' && s.name)
    ).toBe(true);
  });

  it('Xanderghul\'s Hammer is a melee weapon with reactions', () => {
    // Staff and artifact blocks were present in the original bundled data but
    // are absent from the DO snapshot (snapshotted 2026-06-02). If these
    // blocks are restored in the DO, update this test accordingly.
    const hammer = items.find((i) => i.id === 'xanderghuls-flawless-hammer');
    expect(hammer).toBeTruthy();
    expect(hammer.strikes).toBeTruthy();
    expect(Array.isArray(hammer.reactions)).toBe(true);
  });
});
