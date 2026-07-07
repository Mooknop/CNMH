import { describe, it, expect } from 'vitest';
import {
  catalystMeta,
  isCatalyst,
  catalystTargetSpell,
  catalystAddActions,
  catalystSummary,
  eligibleCatalystsFor,
  sumCatalystActions,
} from './catalyst';
import { items, spells } from '../data';

const blueSalt = () => items.find((i) => i.id === 'blue-salt-crystal');
const phoenix = () => items.find((i) => i.id === 'phoenix-tail-feather');

describe('catalyst spine', () => {
  it('reads the catalyst block + traits', () => {
    expect(isCatalyst(blueSalt())).toBe(true);
    expect(isCatalyst({ traits: ['Catalyst'] })).toBe(true);
    expect(isCatalyst({ name: 'Potion', traits: ['Consumable'] })).toBe(false);
    expect(catalystMeta({ catalyst: {} })).toBeNull(); // no catalystFor
  });

  it('exposes target spell + added actions', () => {
    expect(catalystTargetSpell(blueSalt())).toBe('drown');
    expect(catalystAddActions(blueSalt())).toBe(0);
    expect(catalystTargetSpell(phoenix())).toBe('blazing-dive');
    expect(catalystAddActions(phoenix())).toBe(1);
  });

  it('summary falls back to the description', () => {
    expect(catalystSummary(blueSalt())).toMatch(/persistent acid/);
    expect(catalystSummary({ name: 'x', description: 'desc' })).toBe('desc');
  });

  describe('eligibleCatalystsFor', () => {
    const inv = [
      blueSalt(),
      phoenix(),
      { name: 'Sword', traits: ['Weapon'] },
    ];

    it('matches held catalysts to the spell being cast', () => {
      expect(eligibleCatalystsFor(inv, 'drown', {}).map((c) => c.id)).toEqual(['blue-salt-crystal']);
      expect(eligibleCatalystsFor(inv, 'blazing-dive', {}).map((c) => c.id)).toEqual(['phoenix-tail-feather']);
      expect(eligibleCatalystsFor(inv, 'fireball', {})).toEqual([]);
      expect(eligibleCatalystsFor(inv, null, {})).toEqual([]);
    });

    it('excludes a fully-consumed catalyst', () => {
      expect(eligibleCatalystsFor(inv, 'drown', { 'Blue Salt Crystal': 1 })).toEqual([]);
    });

    it('finds catalysts stowed in containers', () => {
      const bag = [{ name: 'Backpack', container: { contents: [blueSalt()] } }];
      expect(eligibleCatalystsFor(bag, 'drown', {}).map((c) => c.id)).toEqual(['blue-salt-crystal']);
    });
  });

  it('sumCatalystActions totals added actions', () => {
    expect(sumCatalystActions([blueSalt(), phoenix()])).toBe(1);
    expect(sumCatalystActions([])).toBe(0);
  });

  describe('seed content', () => {
    it('every catalyst targets a real catalog spell (catches typos)', () => {
      const spellIds = new Set(spells.map((s) => s.id));
      const catalysts = items.filter(isCatalyst);
      expect(catalysts.length).toBeGreaterThanOrEqual(30);
      catalysts.forEach((c) => {
        expect(spellIds.has(catalystTargetSpell(c))).toBe(true);
      });
    });

    it('imports the official catalyst set (M3b) verbatim, no 3rd-party tag', () => {
      const official = ['thunderbird-tuft-lesser', 'demon-bone-tiles-pusk', 'healers-gel-lesser', 'noxious-incense', 'dragon-eye'];
      official.forEach((id) => {
        const c = items.find((i) => i.id === id);
        expect(c, id).toBeTruthy();
        expect(isCatalyst(c)).toBe(true);
        // official items carry Catalyst but never the 3rd-party pack tag
        expect(c.traits).not.toContain('3rd Party');
      });
      // sample rider shape: Thunderbird Tuft (Lesser) → Shocking Grasp, +1 action
      const tuft = items.find((i) => i.id === 'thunderbird-tuft-lesser');
      expect(catalystTargetSpell(tuft)).toBe('shocking-grasp');
      expect(catalystAddActions(tuft)).toBe(1);
    });

    it('imports blazing dive alongside the Phoenix Tail Feather', () => {
      const bd = spells.find((s) => s.id === 'blazing-dive');
      expect(bd).toBeTruthy();
      expect(bd.level).toBe(3);
      expect(bd.traits).toEqual(expect.arrayContaining(['Fire']));
    });
  });
});
