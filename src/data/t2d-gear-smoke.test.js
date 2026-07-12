import { describe, it, expect } from 'vitest';
import items from './snapshot/item.json';
import spells from './snapshot/spell.json';
import rune from './snapshot/rune.json';
import { resolveActionRoll } from '../utils/rollResolution';
import { buildDamageProfile } from '../utils/damage';
import { getStrikes } from '../utils/strikeUtils';
import { resolveScroll } from '../utils/spellItems';
import { resolveRuneIcon } from '../utils/runeIcons';

const byId = Object.fromEntries(items.map((i) => [i.id, i]));
const spById = Object.fromEntries(spells.map((s) => [s.id, s]));
const rById = Object.fromEntries(rune.map((r) => [r.id, r]));

describe('T2d gear smoke (#1096 PR-A)', () => {
  it('the Bloodletting Kukri deals crit-only persistent bleed', () => {
    const char = { id: 'c', level: 6, proficiencies: { martial: 2 }, abilities: { strength: 14, dexterity: 16 },
      inventory: [{ ...byId['bloodletting-kukri'], uid: 'k1' }] };
    const strike = getStrikes(char).find((s) => (s.name || '').includes('Bloodletting'));
    const bleed = (strike.riders || []).find((r) => r.persistent?.type === 'bleed');
    expect(bleed).toBeTruthy();
    expect(bleed.on).toEqual(['criticalSuccess']);
    expect(strike.damage).toMatch(/^2d6/); // +1 striking scales 1d6 → 2d6 (+Str)
  });

  it("Electric Eelskin's Unleash Charge is a fixed-DC basic-Reflex action with two damage types", () => {
    const act = byId['electric-eelskin'].actions[0];
    const rp = resolveActionRoll(act, { id: 'c', level: 10 });
    expect(rp).toMatchObject({ mode: 'target-save', dc: 29, defense: 'reflex' });
    const dp = buildDamageProfile(act, { id: 'c', level: 10 });
    expect(dp.expression).toBe('2d12');
    expect((dp.riders || []).some((r) => r.type === 'sonic')).toBe(true);
  });

  it('Horrid Figurine visages send fixed-DC saves (Fort and Will)', () => {
    const [naus, fear] = byId['horrid-figurine'].actions;
    expect(resolveActionRoll(naus, { id: 'c', level: 8 })).toMatchObject({ mode: 'target-save', dc: 24, defense: 'fortitude' });
    expect(resolveActionRoll(fear, { id: 'c', level: 8 })).toMatchObject({ mode: 'target-save', dc: 24, defense: 'will' });
  });

  it('disintegrate is a spell-attack (AC) 12d10 spell; scroll hydrates', () => {
    const dis = spById['disintegrate'];
    expect(dis.defense).toBe('AC');
    expect(dis.damageData.base).toBe('12d10');
    const sc = byId['scroll-of-disintegrate'];
    const r = resolveScroll(spById[sc.scroll.spellRef], sc.scroll);
    expect(r.name).toBe('Scroll of Disintegrate');
  });

  it('the fluid-form staff lists its 8 polymorph spells, all in the catalog', () => {
    const refs = byId['fluid-form-staff-greater'].staff.spells.map((s) => s.ref);
    expect(refs).toHaveLength(8);
    expect(refs.every((r) => spById[r])).toBe(true);
  });

  it('slick-greater reuses the existing slick glyph family (no generic fallback)', () => {
    expect(rById['slick-greater']).toBeTruthy();
    const icon = resolveRuneIcon('slick-greater');
    expect(icon.generic).toBe(false);
    expect(icon.family).toBe('slick');
  });
});
