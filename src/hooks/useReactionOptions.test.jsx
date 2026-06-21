import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReactionOptions } from './useReactionOptions';

let mockChar;
vi.mock('./useCharacter', () => ({
  useCharacter: () => mockChar,
}));

let mockTurnState;
vi.mock('./useTurnState', () => ({
  useTurnState: () => ({ turnState: mockTurnState }),
}));

let mockShield;
vi.mock('./useShield', () => ({
  useShield: () => mockShield,
}));

let mockOptionsFor;
vi.mock('./useCastingResources', () => ({
  useCastingResources: () => ({ optionsFor: (...a) => mockOptionsFor(...a) }),
}));

let mockGateFor;
vi.mock('./useFrequency', () => ({
  useFrequency: () => ({ gateFor: (...a) => mockGateFor(...a) }),
}));

vi.mock('./useEncounter', () => ({
  useEncounter: () => ({ encounter: { active: false, order: [] } }),
}));

let mockAttuned;
vi.mock('./useSyncedState', () => ({
  useSyncedState: () => [mockAttuned, vi.fn()],
}));

let mockReadied;
vi.mock('./useReadiedAction', () => ({
  useReadiedAction: () => ({ readied: mockReadied, declare: vi.fn(), clear: vi.fn() }),
}));

vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ spells: [] }),
}));

vi.mock('../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: {}, time: {} }),
}));

const character = { id: 'p1', name: 'Kestrel' };
const find = (opts, name) => opts.find((o) => o.reaction.name === name);

beforeEach(() => {
  mockChar = { reactions: [], staffSpells: [], focusSpells: [], inventory: [] };
  mockTurnState = { hasStartedFirstTurn: true, reactionAvailable: true, reactionSpent: false };
  mockShield = { raised: false, broken: false };
  mockOptionsFor = vi.fn(() => [{ enabled: true }]);
  mockGateFor = vi.fn(() => ({ available: true }));
  mockAttuned = '';
  mockReadied = null;
});

describe('useReactionOptions', () => {
  it('marks a plain reaction armed when the reaction is available', () => {
    mockChar.reactions = [{ name: 'Nimble Dodge', trigger: 'A creature targets you.' }];
    const { result } = renderHook(() => useReactionOptions(character));
    expect(find(result.current.options, 'Nimble Dodge')).toMatchObject({ live: true, liveReason: null });
  });

  it('blocks everything with "reaction spent" once spent', () => {
    mockChar.reactions = [{ name: 'Nimble Dodge' }];
    mockTurnState = { ...mockTurnState, reactionSpent: true };
    const { result } = renderHook(() => useReactionOptions(character));
    expect(find(result.current.options, 'Nimble Dodge')).toMatchObject({
      live: false,
      liveReason: 'reaction spent',
    });
  });

  it('blocks before the first turn', () => {
    mockChar.reactions = [{ name: 'Nimble Dodge' }];
    mockTurnState = { hasStartedFirstTurn: false, reactionAvailable: false, reactionSpent: false };
    const { result } = renderHook(() => useReactionOptions(character));
    expect(find(result.current.options, 'Nimble Dodge').liveReason).toBe('unavailable until your first turn');
  });

  it('Shield Block is live only with a raised, whole shield', () => {
    mockChar.reactions = [{ name: 'Shield Block' }];
    const blocked = renderHook(() => useReactionOptions(character));
    expect(find(blocked.result.current.options, 'Shield Block')).toMatchObject({
      live: false,
      liveReason: 'raise a shield first',
    });

    mockShield = { raised: true, broken: false };
    const armed = renderHook(() => useReactionOptions(character));
    expect(find(armed.result.current.options, 'Shield Block').live).toBe(true);
  });

  it('blocks a stowed item reaction (active: false)', () => {
    mockChar.reactions = [{ name: 'Reactive Strike', active: false }];
    const { result } = renderHook(() => useReactionOptions(character));
    expect(find(result.current.options, 'Reactive Strike')).toMatchObject({
      live: false,
      liveReason: 'not in hand',
    });
  });

  it('gates a staff reaction on charges via useCastingResources', () => {
    mockChar.staffSpells = [
      { name: 'Overselling Flourish', actions: 'Reaction', fromStaff: true, active: true, level: 2 },
    ];
    mockOptionsFor = vi.fn(() => [{ enabled: false, reason: 'Not enough staff charges' }]);
    const { result } = renderHook(() => useReactionOptions(character));
    const opt = find(result.current.options, 'Overselling Flourish');
    expect(opt).toMatchObject({ castSource: 'staff', live: false, liveReason: 'Not enough staff charges' });

    mockOptionsFor = vi.fn(() => [{ enabled: true }]);
    const ok = renderHook(() => useReactionOptions(character));
    expect(find(ok.result.current.options, 'Overselling Flourish').live).toBe(true);
  });

  it('gates a repertoire reaction spell on slots (castSource → slot)', () => {
    mockChar.spellcasting = {
      spells: [{ name: 'Feather Fall', actions: 'Reaction', level: 1 }],
    };
    mockOptionsFor = vi.fn(() => [{ enabled: false, reason: 'No rank-1 slots remaining' }]);
    const { result } = renderHook(() => useReactionOptions(character));
    const opt = find(result.current.options, 'Feather Fall');
    // Repertoire spells carry no source flag — castSource resolves to a slot cast.
    expect(opt).toMatchObject({ castSource: undefined, live: false, liveReason: 'No rank-1 slots remaining' });
    // optionsFor must be called for the slot cast (castSource undefined).
    expect(mockOptionsFor).toHaveBeenCalledWith(expect.objectContaining({ name: 'Feather Fall' }), undefined);
  });

  it('leaves a repertoire reaction spell live when its rank pool is untracked (empty options)', () => {
    mockChar.spellcasting = {
      spells: [{ name: 'Feather Fall', actions: 'Reaction', level: 1 }],
    };
    mockOptionsFor = vi.fn(() => []); // untracked rank ⇒ no gating, cast freely
    const { result } = renderHook(() => useReactionOptions(character));
    expect(find(result.current.options, 'Feather Fall')).toMatchObject({ live: true, liveReason: null });
  });

  it('gates an innate reaction spell (castSource → innate)', () => {
    mockChar.innateSpells = [{ name: 'Shield', actions: 'Reaction', innate: true, level: 1 }];
    mockOptionsFor = vi.fn(() => [{ type: 'innate', enabled: true }]);
    const { result } = renderHook(() => useReactionOptions(character));
    expect(find(result.current.options, 'Shield')).toMatchObject({ castSource: 'innate', live: true });
  });

  it('gates a wand reaction spell and blocks it when the wand is used (castSource → wand)', () => {
    mockChar.wandSpells = [
      { name: 'Gentle Landing', actions: 'Reaction', fromWand: true, active: true, level: 1 },
    ];
    mockOptionsFor = vi.fn(() => [{ enabled: false, reason: 'Wand already used today' }]);
    const { result } = renderHook(() => useReactionOptions(character));
    expect(find(result.current.options, 'Gentle Landing')).toMatchObject({
      castSource: 'wand',
      live: false,
      liveReason: 'Wand already used today',
    });
  });

  it('gates a scroll reaction spell and blocks it when no copies remain (castSource → scroll)', () => {
    mockChar.scrollSpells = [
      { name: 'Feather Fall', actions: 'Reaction', fromScroll: true, active: true, level: 1 },
    ];
    mockOptionsFor = vi.fn(() => [{ enabled: false, reason: 'No copies of this scroll remaining' }]);
    const { result } = renderHook(() => useReactionOptions(character));
    expect(find(result.current.options, 'Feather Fall')).toMatchObject({
      castSource: 'scroll',
      live: false,
      liveReason: 'No copies of this scroll remaining',
    });
  });

  it('blocks a stowed wand reaction spell (active: false) before pool gating', () => {
    mockChar.wandSpells = [
      { name: 'Gentle Landing', actions: 'Reaction', fromWand: true, active: false, level: 1 },
    ];
    mockOptionsFor = vi.fn(() => [{ enabled: true }]);
    const { result } = renderHook(() => useReactionOptions(character));
    expect(find(result.current.options, 'Gentle Landing')).toMatchObject({
      live: false,
      liveReason: 'not in hand',
    });
  });

  it('ignores non-reaction spells across every cast list', () => {
    mockChar.spellcasting = { spells: [{ name: 'Fireball', actions: 'Two Actions', level: 3 }] };
    mockChar.innateSpells = [{ name: 'Detect Magic', actions: 'Two Actions', innate: true }];
    mockChar.wandSpells = [{ name: 'Heal', actions: 'Single Action', fromWand: true, active: true }];
    const { result } = renderHook(() => useReactionOptions(character));
    expect(result.current.options).toHaveLength(0);
  });

  it('arms a reaction-cost eld power from the attuned source (verb stays Use, not a cast)', () => {
    mockAttuned = 'Storm';
    mockChar.eldPowers = [
      {
        source: 'Storm',
        powers: [{ name: 'Eld Bulwark', actions: 'Reaction', description: 'Ward an ally.' }],
      },
    ];
    const { result } = renderHook(() => useReactionOptions(character));
    const opt = find(result.current.options, 'Eld Bulwark');
    // Eld powers are frequency-gated, not pool-gated: no castSource, not isSpell.
    expect(opt).toMatchObject({ castSource: undefined, live: true, liveReason: null });
    expect(opt.reaction.fromEld).toBe(true);
    expect(opt.reaction.isSpell).toBeUndefined();
    expect(opt.reaction.frequencyRule).toEqual({ per: 'hour', uses: 1 });
  });

  it('blocks an eld power that is on cooldown via the frequency gate', () => {
    mockAttuned = 'Storm';
    mockChar.eldPowers = [
      { source: 'Storm', powers: [{ name: 'Eld Bulwark', actions: 'Reaction' }] },
    ];
    mockGateFor = vi.fn(() => ({ available: false, availableAtSecs: null }));
    const { result } = renderHook(() => useReactionOptions(character));
    expect(find(result.current.options, 'Eld Bulwark')).toMatchObject({
      live: false,
      liveReason: 'on cooldown',
    });
  });

  it('excludes eld powers from a non-attuned source', () => {
    mockAttuned = 'Storm';
    mockChar.eldPowers = [
      { source: 'Flame', powers: [{ name: 'Eld Flare', actions: 'Reaction' }] },
    ];
    const { result } = renderHook(() => useReactionOptions(character));
    expect(find(result.current.options, 'Eld Flare')).toBeUndefined();
  });

  it('excludes all eld powers when nothing is attuned', () => {
    mockAttuned = '';
    mockChar.eldPowers = [
      { source: 'Storm', powers: [{ name: 'Eld Bulwark', actions: 'Reaction' }] },
    ];
    const { result } = renderHook(() => useReactionOptions(character));
    expect(result.current.options).toHaveLength(0);
  });

  it('arms a readied action as a player-initiated reaction (#501)', () => {
    mockReadied = { actionName: 'Strike', trigger: 'enemy enters reach' };
    const { result } = renderHook(() => useReactionOptions(character));
    const opt = find(result.current.options, 'Strike');
    // Readied actions resolve as a "Use" (no castSource / not a spell) and carry
    // the trigger text + a readied marker for the bar.
    expect(opt).toMatchObject({ castSource: undefined, live: true, liveReason: null });
    expect(opt.reaction).toMatchObject({ readied: true, trigger: 'enemy enters reach' });
  });

  it('blocks a readied action once the reaction is spent', () => {
    mockReadied = { actionName: 'Strike' };
    mockTurnState = { ...mockTurnState, reactionSpent: true };
    const { result } = renderHook(() => useReactionOptions(character));
    expect(find(result.current.options, 'Strike')).toMatchObject({
      live: false,
      liveReason: 'reaction spent',
    });
  });

  it('adds no readied option when none is declared', () => {
    mockReadied = null;
    const { result } = renderHook(() => useReactionOptions(character));
    expect(result.current.options).toHaveLength(0);
  });
});
