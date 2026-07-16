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
  const __set = (key, value) => {
    store[key] = value;
    subs.forEach((f) => f());
  };
  return {
    __esModule: true,
    useSyncedState,
    __set,
    __store: store,
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

let mockEncounter = { active: false };
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter }),
}));

vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'thorn', name: 'Thorn' }] }),
}));

import { __reset, __set, __store } from '../../hooks/useSyncedState';
import ObjectivesStrip from './ObjectivesStrip';

beforeEach(() => {
  __reset();
  mockEncounter = { active: false };
});

describe('ObjectivesStrip', () => {
  it('renders nothing with no active tracks', () => {
    const { container } = render(<ObjectivesStrip />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a chip per track with pool, threshold, and FAILING state', () => {
    __store['cnmh_vpchallenge_global'] = {
      'vpc-1': {
        id: 'vpc-1', name: 'Assuage the Locals', threshold: 3,
        targetIds: ['thorn'], mode: 'once', actionCost: 0, createdAt: 1,
      },
      'vpc-2': {
        id: 'vpc-2', name: 'Ritual Stability', threshold: null,
        startValue: 6, min: 0, failAt: 0, adjust: -6,
        targetIds: ['thorn'], mode: 'perRound', actionCost: 1, createdAt: 2,
      },
    };
    render(<ObjectivesStrip />);

    const crowd = screen.getByLabelText('Assuage the Locals objective');
    expect(crowd).toHaveTextContent('0 / 3 VP');
    expect(crowd).not.toHaveAttribute('data-failing');

    const meter = screen.getByLabelText('Ritual Stability objective');
    expect(meter).toHaveTextContent('0 VP');
    expect(meter).toHaveAttribute('data-failing', 'true');
    expect(screen.getByText('FAILING')).toBeInTheDocument();
  });

  it('folds party results into the pool', () => {
    __store['cnmh_vpchallenge_global'] = {
      'vpc-1': { id: 'vpc-1', name: 'Crowd', threshold: 3, targetIds: ['thorn'], createdAt: 1 },
    };
    render(<ObjectivesStrip />);
    act(() => __set('cnmh_vpresult_thorn', { 'vpc-1': [{ round: 0, vp: 2, at: 1 }] }));
    expect(screen.getByLabelText('Crowd objective')).toHaveTextContent('2 / 3 VP');
  });

  it('influence chips show the round only — never points', () => {
    __store['cnmh_vpchallenge_global'] = {
      'inf-1': {
        id: 'inf-1', kind: 'influence', name: 'Nualia', threshold: null,
        roundsTotal: 10, sceneRound: 4, adjust: 5,
        targetIds: ['thorn'], mode: 'perRound', actionCost: 1, createdAt: 1,
      },
    };
    render(<ObjectivesStrip />);
    const chip = screen.getByLabelText('Nualia objective');
    expect(chip).toHaveTextContent('Round 4 / 10');
    expect(chip).not.toHaveTextContent('VP');
    expect(chip).not.toHaveTextContent('5');

    // Combat rounds take over when an encounter is live.
    mockEncounter = { active: true, round: 2 };
    act(() => __set('cnmh_vpchallenge_global', { ...__store['cnmh_vpchallenge_global'] }));
    expect(screen.getByLabelText('Nualia objective')).toHaveTextContent('Round 2 / 10');
  });
});
