import { renderHook } from '@testing-library/react';

// Drive investment from a controllable set rather than the synced overlay.
let investedSet = new Set();
vi.mock('./useInvested', () => ({
  __esModule: true,
  useInvested: () => ({ isInvested: (uid) => investedSet.has(uid) }),
}));

// Drive the wayfinder-slot overlay (#928) rather than the synced store.
let slotsMap = {};
vi.mock('./useSyncedState', () => ({
  __esModule: true,
  useSyncedState: () => [slotsMap, () => {}],
}));

import { useWornGear } from './useWornGear';

const setup = (inventory) =>
  renderHook(() => useWornGear('hero', inventory)).result.current.wornEffects;

beforeEach(() => {
  investedSet = new Set();
  slotsMap = {};
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

  it('keeps skill stats (W2, #731) and drops genuinely-unknown ones', () => {
    investedSet.add('u1');
    const out = setup([
      acRune({
        modifiers: [
          { stat: 'ac', kind: 'item', amount: 1 },
          { stat: 'stealth', kind: 'item', amount: 1 },
          { stat: 'made-up', kind: 'item', amount: 1 },
        ],
      }),
    ]);
    expect(out[0].def.modifiers).toEqual([
      { stat: 'ac', kind: 'item', amount: 1 },
      { stat: 'stealth', kind: 'item', amount: 1 },
    ]);
  });

  it('skips items whose modifiers are all unsupported or malformed', () => {
    investedSet.add('u1');
    expect(setup([acRune({ modifiers: [{ stat: 'made-up', amount: 1 }] })])).toEqual([]);
    expect(setup([acRune({ modifiers: [{ stat: 'stealth', amount: 'x' }] })])).toEqual([]);
    expect(setup([acRune({ modifiers: undefined })])).toEqual([]);
  });

  it('is resilient to a non-array inventory', () => {
    expect(setup(undefined)).toEqual([]);
    expect(setup(null)).toEqual([]);
  });

  // ── special damage modifiers: resistance/weakness/immunity (#922) ──
  describe('special damage modifiers (#922)', () => {
    it('contributes a worn invested item whose only modifier is a resistance', () => {
      investedSet.add('robe');
      const out = setup([{
        uid: 'robe',
        name: 'Energy Robe (Fire)',
        traits: ['Invested', 'Magical'],
        modifiers: [{ stat: 'resistance', amount: 5, vs: 'fire' }],
      }]);
      expect(out).toHaveLength(1);
      expect(out[0].def.modifiers).toEqual([{ stat: 'resistance', amount: 5, vs: 'fire' }]);
    });

    it('carries weakness and immunity (amount-less) modifiers through too', () => {
      investedSet.add('w');
      investedSet.add('i');
      const weak = setup([{ uid: 'w', name: 'Weak', traits: ['Invested'], modifiers: [{ stat: 'weakness', amount: 5, vs: 'cold' }] }]);
      expect(weak[0].def.modifiers).toEqual([{ stat: 'weakness', amount: 5, vs: 'cold' }]);
      const imm = setup([{ uid: 'i', name: 'Ward', traits: ['Invested'], modifiers: [{ stat: 'immunity', vs: 'poison' }] }]);
      expect(imm[0].def.modifiers).toEqual([{ stat: 'immunity', vs: 'poison' }]);
    });

    it('appends special modifiers alongside the bonus stats on one item', () => {
      investedSet.add('u1');
      const out = setup([
        acRune({ modifiers: [
          { stat: 'ac', kind: 'item', amount: 1 },
          { stat: 'resistance', amount: 5, vs: 'acid' },
        ] }),
      ]);
      expect(out[0].def.modifiers).toEqual([
        { stat: 'ac', kind: 'item', amount: 1 },
        { stat: 'resistance', amount: 5, vs: 'acid' },
      ]);
    });

    it('drops a special modifier missing its vs (malformed)', () => {
      investedSet.add('u1');
      expect(setup([acRune({ modifiers: [{ stat: 'resistance', amount: 5 }] })])).toEqual([]);
    });

    it('still gates a resistance-only item on investment', () => {
      // robe absent from investedSet
      expect(setup([{ uid: 'robe', name: 'Energy Robe', traits: ['Invested'], modifiers: [{ stat: 'resistance', amount: 5, vs: 'fire' }] }])).toEqual([]);
    });
  });

  // ── resonant powers gated on wayfinder slotting (#928) ──
  describe('resonant power / wayfinder slotting (#928)', () => {
    const wayfinder = { uid: 'wf', id: 'wayfinder', name: 'Wayfinder', traits: ['Invested', 'Magical'] };
    const pearly = {
      uid: 'st', id: 'aeon-stone-pearly-white-spindle', name: 'Aeon Stone (Pearly White Spindle)',
      traits: ['Invested', 'Magical'], resonant: { resistance: { amount: 1, type: 'void' } },
    };

    it('surfaces a slotted stone’s resonant resistance when active', () => {
      investedSet.add('wf');
      investedSet.add('st');
      slotsMap = { wf: 'st' };
      const out = setup([wayfinder, pearly]);
      const stoneEntry = out.find((o) => o.def.id === 'worn-st');
      expect(stoneEntry).toBeTruthy();
      expect(stoneEntry.def.modifiers).toEqual([{ stat: 'resistance', amount: 1, vs: 'void' }]);
    });

    it('does not surface the resonant power while merely invested (not slotted)', () => {
      investedSet.add('wf');
      investedSet.add('st');
      slotsMap = {}; // no binding
      expect(setup([wayfinder, pearly])).toEqual([]);
    });

    it('does not surface the resonant power when the wayfinder is not invested', () => {
      investedSet.add('st'); // wayfinder uninvested
      slotsMap = { wf: 'st' };
      expect(setup([wayfinder, pearly])).toEqual([]);
    });
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

    it('derives potency AC + resilient saves + the property skill bonus (W2)', () => {
      investedSet.add('armor1');
      const out = setup([runedChain()]);
      expect(out).toHaveLength(1);
      // Slick's Acrobatics bonus now rides along with the fundamental-rune stats.
      expect(out[0].def.modifiers).toEqual([
        { stat: 'ac', kind: 'item', amount: 1 },
        { stat: 'fort', kind: 'item', amount: 1 },
        { stat: 'reflex', kind: 'item', amount: 1 },
        { stat: 'will', kind: 'item', amount: 1 },
        { stat: 'acrobatics', kind: 'item', amount: 1 },
      ]);
    });

    it('does not contribute a runed armor that is worn but not invested', () => {
      expect(setup([runedChain()])).toEqual([]);
    });

    it('contributes a skill-only property rune (Shadow → Stealth) once invested (W2)', () => {
      investedSet.add('armor1');
      const out = setup([runedChain({ runes: { property: [{ id: 'shadow', modifiers: [{ stat: 'stealth', kind: 'item', amount: 1 }] }] } })]);
      expect(out).toHaveLength(1);
      expect(out[0].def.modifiers).toEqual([{ stat: 'stealth', kind: 'item', amount: 1 }]);
    });
  });
});

// ── Accessory-runed hosts (#1033 S1): an inscribed item is invested magic ────
describe('useWornGear — accessory runes (#1033)', () => {
  const menacingCloak = {
    uid: 'k1',
    name: 'Cloak',
    accessoryTags: ['clothing'],
    runes: {
      accessory: {
        id: 'menacing', name: 'Menacing', type: 'property', target: 'accessory',
        modifiers: [{ stat: 'intimidation', kind: 'item', amount: 1 }],
      },
    },
  };

  it('contributes the rune modifiers only once the host is invested', () => {
    expect(setup([menacingCloak])).toHaveLength(0); // inscribed but not invested
    investedSet.add('k1');
    const out = setup([menacingCloak]);
    expect(out).toHaveLength(1);
    expect(out[0].def.modifiers).toEqual([{ stat: 'intimidation', kind: 'item', amount: 1 }]);
  });
});
