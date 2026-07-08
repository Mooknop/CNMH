// useCharacter — apex spellcasting boost wiring (#967 R8). An invested item
// whose resolved doc carries `apex: true` (the platinum power ring grade) makes
// spellStats derive from the apex-adjusted attribute; the boost math itself is
// covered in SpellUtils.test.js.

import { renderHook } from '@testing-library/react';
import { useCharacter } from './useCharacter';
import { useSyncedState } from './useSyncedState';
import { useContent } from '../contexts/ContentContext';
import { calculateSpellStats } from '../utils/SpellUtils';

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
  calculateSpellStats: vi.fn(() => ({ spellAttackMod: 5, spellDC: 15 })),
  findScrollItems: () => [], extractScrollSpells: () => [],
  findWandItems: () => [], extractWandSpells: () => [], extractInnateSpells: () => [],
}));

// Key-aware: the invested key returns the supplied map; everything else its default.
const setInvested = (invested) => {
  useSyncedState.mockImplementation((key, def) => {
    if (key.startsWith('cnmh_invested_')) return [invested, vi.fn()];
    return [typeof def === 'function' ? def() : def, vi.fn()];
  });
};

const platinumRing = { uid: 'pr1', name: 'Power Ring', powerRing: true, apex: true, itemBonus: 2, weight: 0 };
const ironRing     = { uid: 'ir1', name: 'Power Ring', powerRing: true, apex: false, itemBonus: 1, weight: 0 };

const character = (inventory) => ({
  id: 'c1', level: 17, maxHp: 100, abilities: { charisma: 20 },
  spellcasting: { ability: 'charisma', proficiency: 2 },
  inventory,
});

beforeEach(() => {
  vi.clearAllMocks();
  useContent.mockReturnValue({ items: [], spells: [] });
});

describe('useCharacter — apex spellcasting boost (#967 R8)', () => {
  it('an invested apex item feeds calculateSpellStats the apex flag', () => {
    setInvested({ pr1: true });
    const char = character([platinumRing]);
    renderHook(() => useCharacter(char));
    expect(calculateSpellStats).toHaveBeenCalledWith(char, { apex: true });
  });

  it('an apex item that is NOT invested grants nothing', () => {
    setInvested({});
    const char = character([platinumRing]);
    renderHook(() => useCharacter(char));
    expect(calculateSpellStats).toHaveBeenCalledWith(char, { apex: false });
  });

  it('an invested non-apex grade grants nothing', () => {
    setInvested({ ir1: true });
    const char = character([ironRing]);
    renderHook(() => useCharacter(char));
    expect(calculateSpellStats).toHaveBeenCalledWith(char, { apex: false });
  });
});
