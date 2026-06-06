import { renderHook, act } from '@testing-library/react';

// useSyncedState → useState so we can test the hook in isolation.
// To seed state we wrap the hook inside a helper that provides initial values
// via the mock's init parameter override.
const initialStates = {};
vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) => {
      const override = initialStates[key];
      return ReactLib.useState(override !== undefined ? override : (typeof init === 'function' ? init() : init));
    },
  };
});

import { useGrantedActions } from './useGrantedActions';

const makeGrant = (id, name = 'Enthusiastic Strike') => ({
  id,
  action: { name, cost: 1, description: 'Test action', traits: ['Concentrate'] },
  source: 'Infectious Enthusiasm',
  grantedBy: 'char-a',
  expireAt: { round: 2, entryId: 'e-caster', boundary: 'turn-start' },
  ts: 1000,
});

describe('useGrantedActions', () => {
  beforeEach(() => {
    // Clear initial state overrides between tests
    Object.keys(initialStates).forEach((k) => delete initialStates[k]);
  });

  it('starts with an empty array', () => {
    const { result } = renderHook(() => useGrantedActions('char-a'));
    expect(result.current.grantedActions).toEqual([]);
  });

  it('returns seeded grants from initial state', () => {
    const grant = makeGrant('g-1');
    initialStates['cnmh_grantedactions_char-b'] = [grant];

    const { result } = renderHook(() => useGrantedActions('char-b'));
    expect(result.current.grantedActions).toHaveLength(1);
    expect(result.current.grantedActions[0].id).toBe('g-1');
  });

  it('removeGrantedAction removes the entry with the matching id', () => {
    const g1 = makeGrant('g-1');
    const g2 = makeGrant('g-2');
    initialStates['cnmh_grantedactions_char-c'] = [g1, g2];

    const { result } = renderHook(() => useGrantedActions('char-c'));
    expect(result.current.grantedActions).toHaveLength(2);

    act(() => result.current.removeGrantedAction('g-1'));

    expect(result.current.grantedActions).toHaveLength(1);
    expect(result.current.grantedActions[0].id).toBe('g-2');
  });

  it('removeGrantedAction is a no-op when id does not match any grant', () => {
    const g1 = makeGrant('g-1');
    initialStates['cnmh_grantedactions_char-d'] = [g1];

    const { result } = renderHook(() => useGrantedActions('char-d'));
    act(() => result.current.removeGrantedAction('nonexistent'));
    expect(result.current.grantedActions).toHaveLength(1);
  });

  it('removeGrantedAction works correctly when the array is empty', () => {
    const { result } = renderHook(() => useGrantedActions('char-e'));
    act(() => result.current.removeGrantedAction('g-1'));
    expect(result.current.grantedActions).toHaveLength(0);
  });

  it('uses the charId to key the synced state', () => {
    const gA = makeGrant('g-a');
    const gB = makeGrant('g-b');
    initialStates['cnmh_grantedactions_char-x'] = [gA];
    initialStates['cnmh_grantedactions_char-y'] = [gB];

    const { result: rX } = renderHook(() => useGrantedActions('char-x'));
    const { result: rY } = renderHook(() => useGrantedActions('char-y'));

    expect(rX.current.grantedActions[0].id).toBe('g-a');
    expect(rY.current.grantedActions[0].id).toBe('g-b');
  });

  it('can remove multiple grants in sequence', () => {
    const grants = ['g-1', 'g-2', 'g-3'].map((id) => makeGrant(id));
    initialStates['cnmh_grantedactions_char-f'] = grants;

    const { result } = renderHook(() => useGrantedActions('char-f'));
    act(() => result.current.removeGrantedAction('g-2'));
    expect(result.current.grantedActions.map((g) => g.id)).toEqual(['g-1', 'g-3']);

    act(() => result.current.removeGrantedAction('g-3'));
    expect(result.current.grantedActions.map((g) => g.id)).toEqual(['g-1']);
  });
});
