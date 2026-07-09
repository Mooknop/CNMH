// First behavioral tests for useReactionResolver (#1319). The hook is the
// shared "press a reaction → resolve it" flow: open() must both arm the local
// UseAbilityModal (using) and declare this PC on every device's stage via
// cnmh_reactors_global; close() must clear both. Runs against the REAL
// provider stack + in-memory session bus so useReactors/useSyncedState run
// unmodified.
import { act } from '@testing-library/react';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { useReactionResolver } from './useReactionResolver';

beforeEach(() => window.localStorage.clear());

const aria = { id: 'pc-1', name: 'Aria' };
const aoo = { name: 'Attack of Opportunity', trigger: 'A creature within reach uses a move action' };
const premonition = { name: 'Premonition of Clarity' };
const otherDeclaration = { pcId: 'pc-2', label: 'Shield Block', status: 'resolving' };

const reactorWrites = (session) => session.sent.filter((s) => s.stateType === 'reactors');
const lastReactors = (session) => reactorWrites(session).at(-1);

describe('useReactionResolver', () => {
  it('starts with nothing resolving', () => {
    const { result, session } = renderHookWithProviders(() => useReactionResolver(aria));
    expect(result.current.using).toBeNull();
    expect(reactorWrites(session)).toHaveLength(0);
  });

  it('open arms the modal and declares this PC on cnmh_reactors_global', () => {
    const { result, session } = renderHookWithProviders(() => useReactionResolver(aria));

    act(() => result.current.open(aoo, 'wand-of-omens'));

    expect(result.current.using).toEqual({ ability: aoo, castSource: 'wand-of-omens' });
    const write = lastReactors(session);
    expect(write.characterId).toBe('global');
    expect(write.value).toEqual([
      { pcId: 'pc-1', label: 'Attack of Opportunity', status: 'resolving' },
    ]);
  });

  it('open preserves other PCs’ declarations already on the stage', () => {
    const { result, session } = renderHookWithProviders(() => useReactionResolver(aria), {
      session: { state: { global: { reactors: [otherDeclaration] } } },
    });

    act(() => result.current.open(aoo));

    expect(lastReactors(session).value).toEqual([
      otherDeclaration,
      { pcId: 'pc-1', label: 'Attack of Opportunity', status: 'resolving' },
    ]);
  });

  it('re-pressing replaces this PC’s declaration instead of stacking a duplicate', () => {
    const { result, session } = renderHookWithProviders(() => useReactionResolver(aria));

    act(() => result.current.open(aoo));
    act(() => result.current.open(premonition));

    expect(result.current.using.ability).toBe(premonition);
    expect(lastReactors(session).value).toEqual([
      { pcId: 'pc-1', label: 'Premonition of Clarity', status: 'resolving' },
    ]);
  });

  it('close clears the modal and removes only this PC’s declaration', () => {
    const { result, session } = renderHookWithProviders(() => useReactionResolver(aria), {
      session: { state: { global: { reactors: [otherDeclaration] } } },
    });

    act(() => result.current.open(aoo));
    act(() => result.current.close());

    expect(result.current.using).toBeNull();
    expect(lastReactors(session).value).toEqual([otherDeclaration]);
  });

  it('close without a prior declaration leaves the stage as it was', () => {
    const { result, session } = renderHookWithProviders(() => useReactionResolver(aria), {
      session: { state: { global: { reactors: [otherDeclaration] } } },
    });

    act(() => result.current.close());

    expect(lastReactors(session).value).toEqual([otherDeclaration]);
  });

  it('without a character it still resolves locally but never touches the shared stage', () => {
    const { result, session } = renderHookWithProviders(() => useReactionResolver(undefined));

    act(() => result.current.open(aoo));
    expect(result.current.using).toEqual({ ability: aoo, castSource: undefined });

    act(() => result.current.close());
    expect(result.current.using).toBeNull();
    expect(reactorWrites(session)).toHaveLength(0);
  });

  it('a remote peer clearing the stage does not close the local modal', () => {
    const { result, session } = renderHookWithProviders(() => useReactionResolver(aria));

    act(() => result.current.open(aoo));
    act(() => session.push('global', 'reactors', []));

    expect(result.current.using).toEqual({ ability: aoo, castSource: undefined });
  });
});
