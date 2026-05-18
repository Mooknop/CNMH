// Slice 1 gate: every bundled inventory entry (top-level AND every entry
// nested in container contents, recursively) carries a unique, non-empty,
// stable `uid`, and resolution preserves it. uid is what the durable
// live-loadout layer (cnmh_loadout_<characterId>, later slices) keys on, so a
// missing/duplicate uid would silently corrupt placement+state. Runs the REAL
// src/utils resolution (the build script only mirrors it).
import { sampleCharacters, items } from './index';
import { resolveCharacterItems } from '../utils/contentUtils';

const walk = (list, fn) =>
  (Array.isArray(list) ? list : []).forEach((e) => {
    if (!e || typeof e !== 'object') return;
    fn(e);
    if (e.container && Array.isArray(e.container.contents)) {
      walk(e.container.contents, fn);
    }
  });

describe('bundled inventory entry uids (Slice 1)', () => {
  it('every character has at least one inventory entry', () => {
    expect(sampleCharacters.length).toBeGreaterThan(0);
    sampleCharacters.forEach((c) => {
      expect(Array.isArray(c.inventory)).toBe(true);
      expect(c.inventory.length).toBeGreaterThan(0);
    });
  });

  it('every authored entry (incl. nested) has a non-empty string uid, unique per character', () => {
    sampleCharacters.forEach((c) => {
      const uids = [];
      walk(c.inventory, (e) => uids.push(e.uid));
      expect(uids.length).toBeGreaterThan(0);
      uids.forEach((u) => {
        expect(typeof u).toBe('string');
        expect(u.trim()).not.toBe('');
      });
      expect(new Set(uids).size).toBe(uids.length); // no duplicates within a character
    });
  });

  it('uids are globally unique across all bundled characters', () => {
    const all = [];
    sampleCharacters.forEach((c) => walk(c.inventory, (e) => all.push(e.uid)));
    expect(new Set(all).size).toBe(all.length);
  });

  it('resolution preserves uid on every resolved entry (incl. nested container contents)', () => {
    sampleCharacters.forEach((c) => {
      const resolved = resolveCharacterItems(c, items);
      const authored = [];
      walk(c.inventory, (e) => authored.push(e.uid));
      const out = [];
      walk(resolved.inventory, (e) => out.push(e.uid));
      // Same uids, same order — resolution carries them through verbatim.
      expect(out).toEqual(authored);
      out.forEach((u) => expect(typeof u).toBe('string'));
    });
  });
});
