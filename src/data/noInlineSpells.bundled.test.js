// Epic #622 lockdown gate (Slice 6 / #629): NO inline spell objects remain in
// any in-scope location of the bundled snapshot. Every spell exists once in the
// `spell[]` catalog; every consumer references it by `spellRef` (scroll/wand
// blocks, repertoire, innate, focus) or `ref` (staff spell lists). An entry
// that carries neither IS an inline spell — the thing this epic eliminated.
// Per-entry overrides alongside the ref are fine; only the ref's presence is
// asserted. eldPowers are out of scope (a distinct Eld/impulse subsystem with
// no level/tradition). A failure here means a regression reintroduced an inline
// spell — re-point it at the catalog instead.
import { sampleCharacters, items } from './index';
import { FOCUS_SPELL_PATHS } from '../utils/contentUtils';

const deepGet = (obj, path) =>
  path.reduce((cur, k) => (cur != null && typeof cur === 'object' ? cur[k] : undefined), obj);

// Walk every in-scope spell slot and return a human-readable path for each
// entry missing its catalog reference. Empty array ⇒ fully migrated.
const collectInlineSpellViolations = () => {
  const v = [];

  // Items: scroll/wand blocks (spellRef) + staff spell lists (ref).
  items.forEach((it) => {
    ['scroll', 'wand'].forEach((slot) => {
      const block = it[slot];
      if (block && typeof block === 'object' && block.spellRef == null) {
        v.push(`item ${it.id}.${slot} has no spellRef`);
      }
    });
    if (it.staff && Array.isArray(it.staff.spells)) {
      it.staff.spells.forEach((s, i) => {
        if (s && typeof s === 'object' && s.ref == null) {
          v.push(`item ${it.id}.staff.spells[${i}] has no ref`);
        }
      });
    }
  });

  // Characters: repertoire, innate (feats[].innate + ancestry_spells), focus.
  sampleCharacters.forEach((c) => {
    const checkList = (arr, label) => {
      (Array.isArray(arr) ? arr : []).forEach((e, i) => {
        if (e && typeof e === 'object' && e.spellRef == null) {
          v.push(`character ${c.id}.${label}[${i}] has no spellRef`);
        }
      });
    };

    checkList(c.spellcasting && c.spellcasting.spells, 'spellcasting.spells');
    (Array.isArray(c.feats) ? c.feats : []).forEach((f, fi) => {
      checkList(f && f.innate, `feats[${fi}].innate`);
    });
    checkList(c.ancestry_spells, 'ancestry_spells');
    FOCUS_SPELL_PATHS.forEach((path) => {
      checkList(deepGet(c, path), path.join('.'));
    });
  });

  return v;
};

describe('no inline spells in bundled content (#622 lockdown)', () => {
  it('every scroll/wand/staff/repertoire/innate/focus entry references the catalog', () => {
    expect(collectInlineSpellViolations()).toEqual([]);
  });

  it('no character carries a legacy top-level .staff block', () => {
    const legacy = sampleCharacters.filter((c) => c.staff != null).map((c) => c.id);
    expect(legacy).toEqual([]);
  });
});
