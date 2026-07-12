import { describe, it, expect } from 'vitest';
import items from './snapshot/item.json';
import effects from './snapshot/effect.json';
import { consumableMeta } from '../utils/consumables';

const byId = Object.fromEntries(items.map((i) => [i.id, i]));
const eById = Object.fromEntries(effects.map((e) => [e.id, e]));

describe('T2d alchemy smoke (#1096 PR-B)', () => {
  it('the wired consumables each resolve their effect doc', () => {
    const wired = ['bestial-mutagen-greater', 'darkvision-elixir-greater', 'cheetahs-elixir-greater',
      'sea-touch-elixir-moderate', 'sense-dulling-hood-lesser', 'glow-rod'];
    for (const id of wired) {
      const meta = consumableMeta(byId[id]);
      expect(meta.kind).toBe('effect');
      expect(eById[meta.effectId]).toBeTruthy();
    }
  });

  it("Bestial Mutagen (Greater)'s effect applies the item bonus and mutagen drawbacks", () => {
    const mods = eById['bestial-mutagen-greater'].modifiers;
    expect(mods).toContainEqual({ stat: 'athletics', kind: 'item', amount: 3 });
    expect(mods).toContainEqual({ stat: 'reflex', kind: 'item', amount: -2 });
    expect(mods).toContainEqual({ stat: 'stealth', kind: 'item', amount: -2 });
  });

  it('Sense-Dulling Hood applies its −1 Perception penalty', () => {
    expect(eById['sense-dulling-hood-lesser'].modifiers).toContainEqual({ stat: 'perception', kind: 'item', amount: -1 });
  });

  it('Elixir of Life gains a Moderate variant (transform maps elixir-of-life-moderate → base+variant)', () => {
    const labels = byId['elixir-of-life'].variants.map((v) => v.label);
    expect(labels).toContain('Moderate');
    const mod = byId['elixir-of-life'].variants.find((v) => v.label === 'Moderate');
    expect(mod).toMatchObject({ level: 9, price: 150 });
  });

  it('the injury poisons are catalogued as descriptive items (afflictions run at the table)', () => {
    for (const id of ['cytillesh-oil', 'shadow-essence', 'blisterwort']) {
      expect(byId[id].traits).toContain('Poison');
      expect(consumableMeta(byId[id])).toBeNull(); // no self-use block — weapon-applied
    }
  });
});
