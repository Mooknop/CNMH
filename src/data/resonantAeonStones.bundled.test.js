// Content-integrity gate for aeon-stone resonant powers (#928 content backfill).
// The resonant engine (utils/wayfinder.js) hoists an authored `resonant` block
// onto a stone only while it's slotted into an invested wayfinder. This asserts
// the backfilled blocks are well-formed and — critically — that every resonant
// innate-spell `ref` resolves to a real catalog spell (#622 no-inline-spells),
// since the generic no-inline gate doesn't walk `resonant.grantedSpells`.
import { items, spells } from './index';
import { itemGrantedSpells } from '../utils/itemGrantedSpells';

const stone = (id) => items.find((it) => it.id === id);
const spellIds = new Set(spells.map((s) => s.id));

describe('resonant aeon stones (#928 content)', () => {
  it('Pearly White Spindle carries a well-formed resonant void resistance', () => {
    const r = stone('aeon-stone-pearly-white-spindle')?.resonant?.resistance;
    expect(r).toEqual({ amount: 1, type: 'void' });
  });

  it.each([
    ['aeon-stone-clear-spindle', 'air-bubble'],
    ['aeon-stone-polished-pebble', 'grease'],
  ])('%s grants a resonant innate spell that resolves in the catalog', (id, ref) => {
    const grants = itemGrantedSpells(stone(id)?.resonant);
    expect(grants.map((g) => g.ref)).toContain(ref);
    expect(spellIds.has(ref)).toBe(true);
  });

  it('every resonant.grantedSpells ref across all items resolves to a catalog spell', () => {
    const unresolved = [];
    items.forEach((it) => {
      itemGrantedSpells(it.resonant).forEach((g) => {
        if (!spellIds.has(g.ref)) unresolved.push(`${it.id} → ${g.ref}`);
      });
    });
    expect(unresolved).toEqual([]);
  });
});
