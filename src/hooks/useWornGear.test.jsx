import { renderHook } from '@testing-library/react';

// Drive investment from a controllable set rather than the synced overlay.
let investedSet = new Set();
vi.mock('./useInvested', () => ({
  __esModule: true,
  useInvested: () => ({ isInvested: (uid) => investedSet.has(uid) }),
}));

import { useWornGear } from './useWornGear';

const setup = (inventory) =>
  renderHook(() => useWornGear('hero', inventory)).result.current.wornEffects;

beforeEach(() => {
  investedSet = new Set();
});

const acRune = (overrides = {}) => ({
  uid: 'u1',
  name: 'Armor Potency (+1)',
  traits: ['Invested', 'Magical'],
  modifiers: [{ stat: 'ac', kind: 'item', amount: 1 }],
  ...overrides,
});

describe('useWornGear', () => {
  it('emits a synthetic { entry, def } per worn invested modifier item', () => {
    investedSet.add('u1');
    const out = setup([acRune()]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      entry: { id: 'worn-u1', effectId: 'worn-u1' },
      def: {
        id: 'worn-u1',
        name: 'Armor Potency (+1)',
        modifiers: [{ stat: 'ac', kind: 'item', amount: 1 }],
      },
    });
  });

  it('carries multiple supported stats through (resilient saves)', () => {
    investedSet.add('u2');
    const out = setup([
      {
        uid: 'u2',
        name: 'Resilient',
        traits: ['Invested'],
        modifiers: [
          { stat: 'fort', kind: 'item', amount: 1 },
          { stat: 'reflex', kind: 'item', amount: 1 },
          { stat: 'will', kind: 'item', amount: 1 },
        ],
      },
    ]);
    expect(out[0].def.modifiers).toHaveLength(3);
  });

  it('does not contribute when an investable item is not invested', () => {
    // u1 absent from investedSet
    expect(setup([acRune()])).toEqual([]);
  });

  it('contributes a worn non-investable item without requiring investment', () => {
    const out = setup([acRune({ traits: ['Magical'] })]);
    expect(out).toHaveLength(1);
  });

  it('ignores items that are not worn', () => {
    investedSet.add('u1');
    expect(setup([acRune({ state: 'held1' })])).toEqual([]);
    expect(setup([acRune({ state: 'dropped' })])).toEqual([]);
  });

  it('treats an unset state as worn', () => {
    investedSet.add('u1');
    expect(setup([acRune({ state: undefined })])).toHaveLength(1);
  });

  it('drops unsupported stats (skills wait for W2) and keeps the rest', () => {
    investedSet.add('u1');
    const out = setup([
      acRune({
        modifiers: [
          { stat: 'ac', kind: 'item', amount: 1 },
          { stat: 'stealth', kind: 'item', amount: 1 },
        ],
      }),
    ]);
    expect(out[0].def.modifiers).toEqual([{ stat: 'ac', kind: 'item', amount: 1 }]);
  });

  it('skips items whose modifiers are all unsupported or malformed', () => {
    investedSet.add('u1');
    expect(setup([acRune({ modifiers: [{ stat: 'stealth', amount: 1 }] })])).toEqual([]);
    expect(setup([acRune({ modifiers: [{ stat: 'ac', amount: 'x' }] })])).toEqual([]);
    expect(setup([acRune({ modifiers: undefined })])).toEqual([]);
  });

  it('is resilient to a non-array inventory', () => {
    expect(setup(undefined)).toEqual([]);
    expect(setup(null)).toEqual([]);
  });

  describe('etched armor (runes block, #727)', () => {
    // A worn invested armor with potency + resilient + a skill property rune.
    const runedChain = (overrides = {}) => ({
      uid: 'armor1',
      name: 'Chain Shirt',
      traits: ['Invested', 'Magical'],
      runes: {
        potency: 1,
        resilient: 'resilient',
        property: [{ id: 'slick', modifiers: [{ stat: 'acrobatics', kind: 'item', amount: 1 }] }],
      },
      ...overrides,
    });

    it('derives potency AC + resilient saves through the armor-rune resolver', () => {
      investedSet.add('armor1');
      const out = setup([runedChain()]);
      expect(out).toHaveLength(1);
      // Skill (acrobatics) is dropped until W2; the supported stats remain.
      expect(out[0].def.modifiers).toEqual([
        { stat: 'ac', kind: 'item', amount: 1 },
        { stat: 'fort', kind: 'item', amount: 1 },
        { stat: 'reflex', kind: 'item', amount: 1 },
        { stat: 'will', kind: 'item', amount: 1 },
      ]);
    });

    it('does not contribute a runed armor that is worn but not invested', () => {
      expect(setup([runedChain()])).toEqual([]);
    });

    it('contributes nothing when the only rune yields unsupported stats (skills)', () => {
      investedSet.add('armor1');
      const out = setup([runedChain({ runes: { property: [{ id: 'slick', modifiers: [{ stat: 'acrobatics', kind: 'item', amount: 1 }] }] } })]);
      expect(out).toEqual([]);
    });
  });
});
