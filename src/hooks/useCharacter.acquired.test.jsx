import { renderHook } from '@testing-library/react';
import { useCharacter } from './useCharacter';
import { useSyncedState } from './useSyncedState';
import { useContent } from '../contexts/ContentContext';

// Mock the live-state + content sources; keep the inventory pipeline
// (contentUtils.resolveInventory, effectiveInventory, InventoryUtils bulk) REAL
// so we exercise the actual acquired-overlay merge + bulk math.
vi.mock('./useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../contexts/ContentContext', () => ({ useContent: vi.fn() }));

vi.mock('../utils/CharacterUtils', () => ({
  getAbilityModifier: (s) => Math.floor((s - 10) / 2),
  getSkillModifier: () => 0,
  getItemBonus: () => 0,
  SKILL_ABILITY_MAP: { athletics: 'strength' },
  calculateClassDC: () => 10,
  calculateEnhancedBulkLimit: () => 10,
  hasFeat: () => false,
  FEAT_NAMES: {},
  getArmorProficiencyRank: () => 0,
  getArmorProficiencyBonus: () => 0,
}));
vi.mock('../utils/ActionsUtils', () => ({
  getStrikes: () => [], getActions: () => [], getReactions: () => [], getFreeActions: () => [],
}));
vi.mock('../utils/SpellUtils', () => ({
  calculateSpellStats: () => ({}), findScrollItems: () => [], extractScrollSpells: () => [],
  findWandItems: () => [], extractWandSpells: () => [], extractInnateSpells: () => [],
}));

const catalog = [{ id: 'longsword', name: 'Longsword', weight: 1 }];

// Key-aware: the acquired key returns the supplied overlay; everything else its
// default (loadout {}, hp seed, hero points 0).
const setAcquired = (acquired) => {
  useSyncedState.mockImplementation((key, def) => {
    if (key.startsWith('cnmh_acquired_')) return [acquired, vi.fn()];
    return [typeof def === 'function' ? def() : def, vi.fn()];
  });
};

// Key-aware mock that supplies BOTH overlays (#656 removed + acquired).
const setOverlays = ({ acquired = [], removed = [] }) => {
  useSyncedState.mockImplementation((key, def) => {
    if (key.startsWith('cnmh_acquired_')) return [acquired, vi.fn()];
    if (key.startsWith('cnmh_removed_')) return [removed, vi.fn()];
    return [typeof def === 'function' ? def() : def, vi.fn()];
  });
};

const character = { id: 'c1', level: 5, maxHp: 30, abilities: {}, inventory: [] };

beforeEach(() => {
  vi.clearAllMocks();
  useContent.mockReturnValue({ items: catalog, spells: [] });
});

describe('useCharacter — acquired inventory overlay', () => {
  it('resolves acquired ref entries into the effective inventory', () => {
    setAcquired([{ ref: 'longsword', uid: 'u1' }]);
    const { result } = renderHook(() => useCharacter(character));
    const names = result.current.inventory.map((i) => i.name);
    expect(names).toContain('Longsword');
    expect(result.current.inventory.find((i) => i.name === 'Longsword').uid).toBe('u1');
  });

  it('acquired items count toward Bulk', () => {
    setAcquired([{ ref: 'longsword', uid: 'u1' }]);
    const { result } = renderHook(() => useCharacter(character));
    expect(result.current.totalBulk).toBe(1); // longsword weight 1
  });

  it('merges acquired items alongside authored inventory', () => {
    setAcquired([{ ref: 'longsword', uid: 'u1' }]);
    const authored = { ...character, inventory: [{ name: 'Dagger', weight: 0.1, uid: 'a1' }] };
    const { result } = renderHook(() => useCharacter(authored));
    const names = result.current.inventory.map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['Dagger', 'Longsword']));
    expect(result.current.totalBulk).toBeCloseTo(1.1);
  });

  it('an empty overlay leaves the effective inventory untouched', () => {
    setAcquired([]);
    const authored = { ...character, inventory: [{ name: 'Dagger', weight: 0.1, uid: 'a1' }] };
    const { result } = renderHook(() => useCharacter(authored));
    expect(result.current.inventory).toHaveLength(1);
    expect(result.current.inventory[0].name).toBe('Dagger');
  });

  it('masks a given-away authored item via the removed overlay (#656)', () => {
    const authored = {
      ...character,
      inventory: [
        { name: 'Dagger', weight: 0.1, uid: 'a1' },
        { name: 'Shield', weight: 1, uid: 'a2' },
      ],
    };
    setOverlays({ removed: ['a2'] });
    const { result } = renderHook(() => useCharacter(authored));
    const names = result.current.inventory.map((i) => i.name);
    expect(names).toEqual(['Dagger']);
    expect(result.current.totalBulk).toBeCloseTo(0.1); // shield no longer counts
  });

  it('masks a given-away acquired item too (#656)', () => {
    setOverlays({ acquired: [{ ref: 'longsword', uid: 'u1' }], removed: ['u1'] });
    const { result } = renderHook(() => useCharacter(character));
    expect(result.current.inventory.find((i) => i.name === 'Longsword')).toBeUndefined();
  });

  it('resolves a purchased runestone against the rune catalog (#800)', () => {
    useContent.mockReturnValue({
      items: catalog,
      spells: [],
      runes: [{ id: 'flaming', name: 'Flaming', level: 8, price: 500, description: 'Deals extra fire damage on a hit.' }],
    });
    setAcquired([{ ref: 'runestone', runeRef: 'flaming', uid: 'u3' }]);
    const { result } = renderHook(() => useCharacter(character));
    const stone = result.current.inventory.find((i) => i.uid === 'u3');
    expect(stone.name).toBe('Flaming Runestone');
    expect(stone.runestone.rune.description).toBe('Deals extra fire damage on a hit.');
  });

  it('selects the matching variant when an acquired entry carries a level', () => {
    useContent.mockReturnValue({
      items: [{ id: 'potion', name: 'Potion', weight: 0.1, variants: [
        { level: 3, label: 'Lesser', price: 12 },
        { level: 6, label: 'Moderate', price: 50 },
      ] }],
      spells: [],
    });
    setAcquired([{ ref: 'potion', level: 6, uid: 'u2' }]);
    const { result } = renderHook(() => useCharacter(character));
    const potion = result.current.inventory.find((i) => i.name === 'Potion');
    expect(potion).toMatchObject({ label: 'Moderate', price: 50 });
  });
});
