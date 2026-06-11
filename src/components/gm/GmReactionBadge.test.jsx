import React from 'react';
import { render, screen, act } from '@testing-library/react';

vi.mock('../../hooks/useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => {
      store[key] = typeof u === 'function' ? u(store[key]) : u;
      subs.forEach((f) => f());
    };
    return [store[key], set];
  };
  return {
    __esModule: true,
    useSyncedState,
    __set: (key, value) => { store[key] = value; subs.forEach((f) => f()); },
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

import { __set, __reset } from '../../hooks/useSyncedState';
import GmReactionBadge from './GmReactionBadge';

const KEY = 'cnmh_turnstate_Pellias';

beforeEach(() => __reset());

describe('GmReactionBadge', () => {
  it('shows unavailable when no turn state exists yet', () => {
    render(<GmReactionBadge charId="Pellias" name="Pellias" />);
    const badge = screen.getByLabelText('Pellias reaction unavailable');
    expect(badge).toHaveClass('gm-reaction-badge--unavailable');
  });

  it('shows unavailable before the PC starts their first turn', () => {
    __set(KEY, { hasStartedFirstTurn: false, reactionAvailable: false, reactionSpent: false });
    render(<GmReactionBadge charId="Pellias" name="Pellias" />);
    expect(screen.getByLabelText('Pellias reaction unavailable')).toBeInTheDocument();
  });

  it('shows available once the reaction is up', () => {
    __set(KEY, { hasStartedFirstTurn: true, reactionAvailable: true, reactionSpent: false });
    render(<GmReactionBadge charId="Pellias" name="Pellias" />);
    expect(screen.getByLabelText('Pellias reaction available')).toHaveClass('gm-reaction-badge--available');
  });

  it('shows spent after the reaction is used', () => {
    __set(KEY, { hasStartedFirstTurn: true, reactionAvailable: true, reactionSpent: true });
    render(<GmReactionBadge charId="Pellias" name="Pellias" />);
    expect(screen.getByLabelText('Pellias reaction spent')).toHaveClass('gm-reaction-badge--spent');
  });

  it('updates live when the synced turn state changes', () => {
    __set(KEY, { hasStartedFirstTurn: true, reactionAvailable: true, reactionSpent: false });
    render(<GmReactionBadge charId="Pellias" name="Pellias" />);
    expect(screen.getByLabelText('Pellias reaction available')).toBeInTheDocument();

    act(() => {
      __set(KEY, { hasStartedFirstTurn: true, reactionAvailable: true, reactionSpent: true });
    });
    expect(screen.getByLabelText('Pellias reaction spent')).toBeInTheDocument();
  });
});
