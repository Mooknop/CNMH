import { describe, it, expect } from 'vitest';
import {
  RUNE_ICON_FAMILIES,
  GENERIC_RUNE_ICON,
  runeIconTier,
  resolveRuneIcon,
  runeIconsOf,
  fundamentalRuneId,
} from './runeIcons';
import seedRunes from '../data/snapshot/rune.json';

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
    // snagging is accessory-target — undrawn until the R6 wave.
    const icon = resolveRuneIcon('snagging');
    expect(icon.generic).toBe(true);
    expect(icon.layers).toEqual([GENERIC_RUNE_ICON]);
  });

  it('yields nothing for a missing id', () => {
    expect(resolveRuneIcon(null)).toBeNull();
    expect(resolveRuneIcon('')).toBeNull();
  });

  it('fundamental families are drawn across their full ladders', () => {
    // Numeric potency tiers are 1-based positions into the steps series.
    expect(resolveRuneIcon('weapon-potency-1').layers).toHaveLength(1);
    expect(resolveRuneIcon('weapon-potency-3').layers).toHaveLength(3);
    expect(resolveRuneIcon('armor-potency-2').layers).toHaveLength(2);
    expect(resolveRuneIcon('major-striking').layers).toHaveLength(3);
    expect(resolveRuneIcon('resilient').layers).toHaveLength(1);
    // Reinforcing rides its own six-step ladder, minor → supreme.
    expect(resolveRuneIcon('minor-reinforcing').layers).toHaveLength(1);
    expect(resolveRuneIcon('moderate-reinforcing').layers).toHaveLength(3);
    expect(resolveRuneIcon('supreme-reinforcing').layers).toHaveLength(6);
    expect(resolveRuneIcon('supreme-reinforcing').generic).toBe(false);
  });
});

describe('glyph waves — seed coverage (#1373 shields, #1374 armor/ring/weapon)', () => {
  // Every non-accessory rune in the bundled seed must resolve a DRAWN glyph
  // (accessory-target families arrive in R6 #1375). A newly-authored rune
  // landing on the generic fallback should be a conscious choice (draw its
  // family or accept the failure here), not silent.
  it('every non-accessory rune in the seed resolves a non-generic glyph', () => {
    const covered = seedRunes.filter((r) => r.target !== 'accessory');
    expect(covered.length).toBeGreaterThan(0);
    const fallbacks = covered.filter((r) => resolveRuneIcon(r.id).generic).map((r) => r.id);
    expect(fallbacks).toEqual([]);
  });

  it('tier ladders render progressively where the seed has tiers', () => {
    // Glyphed's below-base lesser is the odd ladder — pin it explicitly.
    expect(resolveRuneIcon('lesser-glyphed').layers).toHaveLength(1);
    expect(resolveRuneIcon('glyphed').layers).toHaveLength(2);
    expect(resolveRuneIcon('true-glyphed').layers).toHaveLength(5);
    // A base<greater<true family clamps true onto its last drawn step.
    expect(resolveRuneIcon('undead').layers).toHaveLength(1);
    expect(resolveRuneIcon('true-undead').layers).toHaveLength(3);
    // And a common base<greater<major ladder.
    expect(resolveRuneIcon('major-reverberating').layers).toHaveLength(3);
  });
});

describe('fundamentalRuneId', () => {
  it('potency maps a numeric tier onto the target family', () => {
    expect(fundamentalRuneId('potency', 1, 'weapon')).toBe('weapon-potency-1');
    expect(fundamentalRuneId('potency', 3, 'armor')).toBe('armor-potency-3');
    expect(fundamentalRuneId('potency', 2)).toBe('weapon-potency-2');
    expect(fundamentalRuneId('potency', 0)).toBeNull();
    expect(fundamentalRuneId('potency', undefined)).toBeNull();
  });

  it('striking / resilient store their base tier as the family word', () => {
    expect(fundamentalRuneId('striking', 'striking')).toBe('striking');
    expect(fundamentalRuneId('striking', 'greater')).toBe('greater-striking');
    expect(fundamentalRuneId('resilient', 'major')).toBe('major-resilient');
    expect(fundamentalRuneId('striking', '')).toBeNull();
  });

  it('reinforcing always carries a tier word', () => {
    expect(fundamentalRuneId('reinforcing', 'minor')).toBe('minor-reinforcing');
    expect(fundamentalRuneId('reinforcing', 'supreme')).toBe('supreme-reinforcing');
  });
});

describe('runeIconsOf', () => {
  const flaming = { id: 'flaming', name: 'Flaming' };
  const frost = { id: 'frost', name: 'Frost' };

  it('collects a weapon\'s resolved property-rune docs in slot order, fundamentals after', () => {
    const item = { runes: { potency: 2, property: [flaming, frost] } };
    expect(runeIconsOf(item)).toEqual([
      flaming,
      frost,
      { id: 'weapon-potency-2', name: '+2 Weapon Potency' },
    ]);
  });

  it('skips unresolved string refs and empty slots', () => {
    const item = { runes: { potency: 2, property: ['flaming', null, frost] } };
    expect(runeIconsOf(item)).toEqual([
      frost,
      { id: 'weapon-potency-2', name: '+2 Weapon Potency' },
    ]);
  });

  it('weapon fundamentals (potency + striking) trail the property runes', () => {
    // Property runes are an item's distinctive marks; the near-universal
    // fundamentals fold into the tile's +n chip rather than displacing them.
    const item = { strikes: {}, runes: { potency: 1, striking: 'greater', property: [flaming] } };
    expect(runeIconsOf(item)).toEqual([
      flaming,
      { id: 'weapon-potency-1', name: '+1 Weapon Potency' },
      { id: 'greater-striking', name: 'Greater Striking' },
    ]);
  });

  it('an armor block flips potency to the armor family and adds resilient', () => {
    const item = { armor: true, runes: { potency: 2, resilient: 'resilient' } };
    expect(runeIconsOf(item)).toEqual([
      { id: 'armor-potency-2', name: '+2 Armor Potency' },
      { id: 'resilient', name: 'Resilient' },
    ]);
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
      .toEqual([flaming, { id: 'greater-resilient', name: 'Greater Resilient' }]);
    expect(runeIconsOf({ powerRing: true, runes: { property: [frost] } })).toEqual([frost]);
  });
});
