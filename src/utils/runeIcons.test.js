import { describe, it, expect } from 'vitest';
import {
  RUNE_ICON_FAMILIES,
  GENERIC_RUNE_ICON,
  runeIconTier,
  resolveRuneIcon,
  runeIconsOf,
} from './runeIcons';

describe('runeIconTier', () => {
  it('a bare family id is its own base tier', () => {
    expect(runeIconTier('flaming')).toEqual({ family: 'flaming', affix: '' });
  });

  it('strips a tier suffix (flaming-greater)', () => {
    expect(runeIconTier('flaming-greater')).toEqual({ family: 'flaming', affix: 'greater' });
  });

  it('strips a tier prefix (greater-striking)', () => {
    expect(runeIconTier('greater-striking')).toEqual({ family: 'striking', affix: 'greater' });
  });

  it('maps a numeric suffix to its tier (dragons-breath-3)', () => {
    expect(runeIconTier('dragons-breath-3')).toEqual({ family: 'dragons-breath', affix: '3' });
  });

  it('keeps a compound family intact around the affix', () => {
    expect(runeIconTier('clothing-fire-resistant-greater')).toEqual({
      family: 'clothing-fire-resistant',
      affix: 'greater',
    });
    expect(runeIconTier('supreme-reinforcing')).toEqual({ family: 'reinforcing', affix: 'supreme' });
  });
});

describe('resolveRuneIcon', () => {
  it('base tier renders only the first layer', () => {
    const icon = resolveRuneIcon('flaming');
    expect(icon.generic).toBe(false);
    expect(icon.layers).toEqual(RUNE_ICON_FAMILIES.flaming.steps.slice(0, 1));
  });

  it('greater tier stacks the second layer on the first (cumulative)', () => {
    const icon = resolveRuneIcon('flaming-greater');
    expect(icon.layers).toEqual(RUNE_ICON_FAMILIES.flaming.steps.slice(0, 2));
  });

  it('a tier beyond the drawn steps clamps to the last layer', () => {
    // Default ladder puts "true" at index 3; flaming has only 2 steps drawn.
    const icon = resolveRuneIcon('flaming-true');
    expect(icon.layers).toEqual(RUNE_ICON_FAMILIES.flaming.steps);
  });

  it('an undrawn family falls back to the generic mark', () => {
    const icon = resolveRuneIcon('fearsome');
    expect(icon.generic).toBe(true);
    expect(icon.layers).toEqual([GENERIC_RUNE_ICON]);
  });

  it('yields nothing for a missing id', () => {
    expect(resolveRuneIcon(null)).toBeNull();
    expect(resolveRuneIcon('')).toBeNull();
  });
});

describe('runeIconsOf', () => {
  const flaming = { id: 'flaming', name: 'Flaming' };
  const frost = { id: 'frost', name: 'Frost' };

  it('collects a weapon\'s resolved property-rune docs in slot order', () => {
    const item = { runes: { potency: 2, property: [flaming, frost] } };
    expect(runeIconsOf(item)).toEqual([flaming, frost]);
  });

  it('skips unresolved string refs and empty slots', () => {
    const item = { runes: { potency: 2, property: ['flaming', null, frost] } };
    expect(runeIconsOf(item)).toEqual([frost]);
  });

  it('includes a runestone\'s held rune', () => {
    const item = { runestone: { runeRef: 'flaming', rune: flaming } };
    expect(runeIconsOf(item)).toEqual([flaming]);
  });

  it('yields nothing for unruned items and blank stones', () => {
    expect(runeIconsOf({ name: 'Rope' })).toEqual([]);
    expect(runeIconsOf({ runestone: { runeRef: null, rune: null } })).toEqual([]);
    expect(runeIconsOf(null)).toEqual([]);
  });

  it('a shield leads with its reinforcing tier, synthesized to the catalog id (#1372)', () => {
    const item = {
      shield: { bonus: 2 },
      runes: { reinforcing: 'greater', property: [frost] },
    };
    expect(runeIconsOf(item)).toEqual([
      { id: 'greater-reinforcing', name: 'Greater Reinforcing' },
      frost,
    ]);
  });

  it('includes an inscribed accessory rune (doc only — string refs skipped)', () => {
    const presentable = { id: 'presentable', name: 'Presentable' };
    expect(runeIconsOf({ runes: { accessory: presentable } })).toEqual([presentable]);
    expect(runeIconsOf({ runes: { accessory: 'presentable' } })).toEqual([]);
  });

  it('armor and ring property runes ride the same runes.property path', () => {
    // Same storage shape for every target (#1372) — no target branching.
    expect(runeIconsOf({ armor: {}, runes: { resilient: 'greater', property: [flaming] } }))
      .toEqual([flaming]);
    expect(runeIconsOf({ powerRing: true, runes: { property: [frost] } })).toEqual([frost]);
  });
});
