import { renderHook } from '@testing-library/react';
import { useCharacter } from './useCharacter';
import { useSyncedState } from './useSyncedState';
import { useContent } from '../contexts/ContentContext';

// Item modes (#1093): the cnmh_itemmode overlay flips an item between its
// authored states inside useCharacter's effective inventory. Live-state +
// content are mocked; the inventory pipeline and itemModes util stay REAL.
vi.mock('./useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../contexts/ContentContext', () => ({ useContent: vi.fn() }));

vi.mock('../utils/ActionsUtils', () => ({
  getStrikes: () => [], getActions: () => [], getReactions: () => [], getFreeActions: () => [],
}));
vi.mock('../utils/SpellUtils', () => ({
  calculateSpellStats: () => ({}), findScrollItems: () => [], extractScrollSpells: () => [],
  findWandItems: () => [], extractWandSpells: () => [], extractInnateSpells: () => [],
}));

// Key-aware synced-state mock: supplies the item-mode + invested overlays;
// everything else resolves to its default.
const setOverlays = ({ modes = {}, invested = {} } = {}) => {
  useSyncedState.mockImplementation((key, def) => {
    if (key.startsWith('cnmh_itemmode_')) return [modes, vi.fn()];
    if (key.startsWith('cnmh_invested_')) return [invested, vi.fn()];
    return [typeof def === 'function' ? def() : def, vi.fn()];
  });
};
const setItemModes = (modeState) => setOverlays({ modes: modeState });

const gloomBlade = {
  uid: 'gloom-1',
  name: 'Gloom Blade',
  runes: {},
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
  name: 'Clandestine Cloak',
  bonus: ['stealth', 0],
  modes: {
    default: 'down',
    options: [
      { id: 'down', label: 'Hood down', overrides: { bonus: null, modifiers: [] } },
      { id: 'up', label: 'Hood up', overrides: { bonus: ['stealth', 1], modifiers: [{ stat: 'deception', kind: 'item', amount: 1 }] } },
    ],
  },
};

const character = {
  id: 'c1',
  level: 5,
  maxHp: 30,
  abilities: { dexterity: 10 },
  skills: { stealth: { proficiency: 0 } },
  inventory: [gloomBlade, cloak],
};

beforeEach(() => {
  vi.clearAllMocks();
  useContent.mockReturnValue({ items: [], spells: [] });
});

describe('useCharacter — item modes overlay (#1093)', () => {
  it('applies authored defaults with an empty overlay', () => {
    setItemModes({});
    const { result } = renderHook(() => useCharacter(character));
    const blade = result.current.inventory.find((i) => i.uid === 'gloom-1');
    expect(blade.runes).toEqual({ potency: 2, striking: 'striking' });
    expect(blade.activeModeId).toBe('dim');
  });

  it('applies the player-chosen mode from the overlay', () => {
    setItemModes({ 'gloom-1': 'bright' });
    const { result } = renderHook(() => useCharacter(character));
    const blade = result.current.inventory.find((i) => i.uid === 'gloom-1');
    expect(blade.runes).toEqual({ potency: 1 });
    expect(blade.activeModeId).toBe('bright');
  });

  it('worn+invested bonusSlots gear raises spellSlotTotals (#1093 Ring of Wizardry)', () => {
    const ring = {
      uid: 'ring-1',
      name: 'Ring of Wizardry (Type I)',
      traits: ['Invested', 'Magical'],
      bonusSlots: { tradition: 'arcane', ranks: { 1: 2 } },
    };
    const caster = {
      ...character,
      inventory: [ring],
      spellcasting: { tradition: 'arcane', spell_slots: { 1: 3, 2: 2 } },
    };

    setOverlays({ invested: { 'ring-1': true } });
    const invested = renderHook(() => useCharacter(caster)).result.current;
    expect(invested.spellSlotTotals).toEqual({ 1: 5, 2: 2 });

    setOverlays({ invested: {} });
    const uninvested = renderHook(() => useCharacter(caster)).result.current;
    expect(uninvested.spellSlotTotals).toEqual({ 1: 3, 2: 2 });
  });

  it('mode-swapped skill bonus flows into itemBonuses/skillModifiers', () => {
    setItemModes({ 'cloak-1': 'up' });
    const up = renderHook(() => useCharacter(character)).result.current;
    expect(up.itemBonuses.stealth).toBe(1);
    expect(up.skillModifiers.stealth).toBe(1);

    setItemModes({});
    const down = renderHook(() => useCharacter(character)).result.current;
    expect(down.itemBonuses.stealth).toBe(0);
  });
});
