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

vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ spells: [] }),
}));

const character = { id: 'p1', name: 'Kestrel' };
const find = (opts, name) => opts.find((o) => o.reaction.name === name);

beforeEach(() => {
  mockChar = { reactions: [], staffSpells: [], focusSpells: [], inventory: [] };
  mockTurnState = { hasStartedFirstTurn: true, reactionAvailable: true, reactionSpent: false };
  mockShield = { raised: false, broken: false };
  mockOptionsFor = vi.fn(() => [{ enabled: true }]);
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
});
