import { describe, it, expect } from 'vitest';
import { itemModesOf, activeItemMode, applyItemModes } from './itemModes';

const gloomBlade = {
  uid: 'gloom-1',
  id: 'gloom-blade',
  name: 'Gloom Blade',
  runes: { potency: 2, striking: 'striking' },
  modes: {
    label: 'Light',
    default: 'dim',
    options: [
      { id: 'bright', label: 'Bright light', overrides: { runes: { potency: 1 } } },
      { id: 'dim', label: 'Dim / darkness', overrides: { runes: { potency: 2, striking: 'striking' } } },
    ],
  },
};

const cloak = {
  uid: 'cloak-1',
  id: 'clandestine-cloak',
  name: 'Clandestine Cloak',
  modes: {
    label: 'Hood',
    default: 'down',
    options: [
      { id: 'down', label: 'Hood down', overrides: { modifiers: [] } },
      {
        id: 'up',
        label: 'Hood up',
        overrides: {
          modifiers: [
            { stat: 'stealth', kind: 'item', amount: 1 },
            { stat: 'deception', kind: 'item', amount: 1 },
            { stat: 'diplomacy', kind: 'item', amount: -1 },
            { stat: 'intimidation', kind: 'item', amount: -1 },
          ],
        },
      },
    ],
  },
};

describe('itemModesOf', () => {
  it('returns the block with well-formed options', () => {
    expect(itemModesOf(gloomBlade).options).toHaveLength(2);
  });

  it('rejects missing, non-object, and single-option blocks', () => {
    expect(itemModesOf(null)).toBeNull();
    expect(itemModesOf({})).toBeNull();
    expect(itemModesOf({ modes: [] })).toBeNull();
    expect(itemModesOf({ modes: { options: [{ id: 'only' }] } })).toBeNull();
  });

  it('drops malformed options (and the block when fewer than two survive)', () => {
    const item = { modes: { options: [{ id: 'a' }, { notAnId: true }, null, { id: 'b' }] } };
    expect(itemModesOf(item).options.map((o) => o.id)).toEqual(['a', 'b']);
    expect(itemModesOf({ modes: { options: [{ id: 'a' }, {}] } })).toBeNull();
  });
});

describe('activeItemMode', () => {
  it('prefers the stored choice for the item uid', () => {
    expect(activeItemMode(gloomBlade, { 'gloom-1': 'bright' }).id).toBe('bright');
  });

  it('falls back to the authored default when unchosen or stale', () => {
    expect(activeItemMode(gloomBlade, {}).id).toBe('dim');
    expect(activeItemMode(gloomBlade, { 'gloom-1': 'gone' }).id).toBe('dim');
  });

  it('falls back to the first option when the default is missing/bad', () => {
    const item = { ...cloak, modes: { ...cloak.modes, default: 'nope' } };
    expect(activeItemMode(item, {}).id).toBe('down');
  });

  it('is null for mode-less items', () => {
    expect(activeItemMode({ name: 'Dagger' }, {})).toBeNull();
  });
});

describe('applyItemModes', () => {
  it('applies the default mode with an empty overlay', () => {
    const [applied] = applyItemModes([gloomBlade], {});
    expect(applied.runes).toEqual({ potency: 2, striking: 'striking' });
    expect(applied.activeModeId).toBe('dim');
  });

  it('applies the chosen mode overrides onto the entry', () => {
    const [applied] = applyItemModes([gloomBlade], { 'gloom-1': 'bright' });
    expect(applied.runes).toEqual({ potency: 1 });
    expect(applied.activeModeId).toBe('bright');
    // the block survives so the toggle UI can render options
    expect(applied.modes.options).toHaveLength(2);
  });

  it('swaps whole fields — a mode granting nothing authors the empty value', () => {
    const [down] = applyItemModes([cloak], {});
    const [up] = applyItemModes([cloak], { 'cloak-1': 'up' });
    expect(down.modifiers).toEqual([]);
    expect(up.modifiers).toHaveLength(4);
  });

  it('returns the same array identity when nothing has modes', () => {
    const inventory = [{ name: 'Dagger' }, { name: 'Rope' }];
    expect(applyItemModes(inventory, {})).toBe(inventory);
    expect(applyItemModes(null, {})).toBeNull();
  });

  it('leaves mode-less entries untouched alongside moded ones', () => {
    const dagger = { name: 'Dagger' };
    const out = applyItemModes([dagger, gloomBlade], {});
    expect(out[0]).toBe(dagger);
    expect(out[1].activeModeId).toBe('dim');
  });
});
