import { describe, it, expect } from 'vitest';
import items from './snapshot/item.json';
import spells from './snapshot/spell.json';
import rune from './snapshot/rune.json';
import { resolveActionRoll } from '../utils/rollResolution';
import { buildDamageProfile } from '../utils/damage';
import { getStrikes } from '../utils/strikeUtils';
import { resolveWand } from '../utils/spellItems';

const byId = Object.fromEntries(items.map((i) => [i.id, i]));
const spById = Object.fromEntries(spells.map((s) => [s.id, s]));
const rById = Object.fromEntries(rune.map((r) => [r.id, r]));

describe('T2c content smoke (#1095)', () => {
  it('Horn of Blasting activations resolve as fixed-DC basic-Fort damage', () => {
    const horn = byId['horn-of-blasting'];
    const char = { id: 'c', level: 9 };
    for (const act of horn.actions) {
      const rp = resolveActionRoll(act, char);
      expect(rp).toMatchObject({ mode: 'target-save', dc: 28, defense: 'fortitude' });
      const dp = buildDamageProfile(act, char);
      expect(dp.typeLabel).toBe('sonic');
    }
    expect(buildDamageProfile(horn.actions[0], char).expression).toBe('3d6');
    expect(buildDamageProfile(horn.actions[1], char).expression).toBe('8d6');
  });

  it('the Dragon Bane naginata carries a vs-dragon damage rider', () => {
    // contentUtils inflates runes.property string ids → rune docs before getStrikes;
    // simulate that here so the rider translation runs.
    const item = byId['naginata-dragon-bane'];
    const inflated = { ...item, uid: 'n1', runes: { ...item.runes, property: item.runes.property.map((id) => rById[id]) } };
    const char = { id: 'c', level: 6, proficiencies: { martial: 2 }, abilities: { strength: 16, dexterity: 12 },
      inventory: [inflated] };
    const strike = getStrikes(char).find((s) => (s.name || '').includes('Naginata'));
    expect(strike).toBeTruthy();
    const bane = (strike.riders || []).find((r) => r.appliesVsTrait === 'dragon');
    expect(bane).toBeTruthy();
    expect(bane.dice).toBe('1d6');
  });

  it('bane-dragon rune has a vsTrait rider; invisibility-greater is an armor rune', () => {
    expect(rById['bane-dragon'].rider).toMatchObject({ dice: '1d6', vsTrait: 'dragon' });
    expect(rById['invisibility-greater'].armorRune).toBe(true);
  });

  it('wand-of-lightning-bolt hydrates to a rank-3 wand', () => {
    const w = byId['wand-of-lightning-bolt'];
    const r = resolveWand(spById[w.wand.spellRef], w.wand);
    expect(r.name).toBe('Wand of Lightning Bolt');
    expect(r.level).toBe(7); // wand of a 3rd-rank spell = item level 7
  });

  it('lightning-bolt is a basic-Reflex 4d12 electricity spell', () => {
    const lb = spById['lightning-bolt'];
    expect(lb.defense).toBe('basic Reflex');
    expect(lb.damageData).toMatchObject({ base: '4d12', type: 'electricity' });
  });
});
