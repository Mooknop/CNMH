import React from 'react';
import { render, screen, act } from '@testing-library/react';

jest.mock('../../hooks/useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => {
      subs.add(force);
      return () => subs.delete(force);
    }, []);
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
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
    __set: (key, value) => {
      store[key] = value;
      subs.forEach((f) => f());
    },
  };
});

const { __reset, __set } = require('../../hooks/useSyncedState');

import GmEncounter from './GmEncounter';

const FOUNDRY_ENCOUNTER = {
  active: true,
  phase: 'in-progress',
  round: 2,
  currentTurnIndex: 1,
  order: [
    { entryId: 'e1', kind: 'pc',    charId: 'Pellias', name: 'Pellias',  initiative: 20 },
    { entryId: 'e2', kind: 'pc',    charId: 'Ashka',   name: 'Ashka',    initiative: 15 },
    { entryId: 'e3', kind: 'enemy',                    name: 'Goblin 1', initiative: 12 },
  ],
  log: [],
  foundryCombatId: 'combat-abc123',
};

beforeEach(() => __reset());

describe('GmEncounter (read-only Foundry mirror)', () => {
  it('idle with no Foundry link: shows waiting message, no order list', () => {
    render(<GmEncounter />);
    expect(screen.getByText(/Waiting for combat/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('encounter-order')).toBeNull();
  });

  it('Foundry-linked encounter: shows "Live" message', () => {
    act(() => { __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER); });
    render(<GmEncounter />);
    expect(screen.getByText(/Live — controlled by Foundry VTT/i)).toBeInTheDocument();
  });

  it('in-progress: shows round number and current actor name', () => {
    act(() => { __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER); });
    render(<GmEncounter />);
    expect(screen.getByText(/Round 2/)).toBeInTheDocument();
    expect(screen.getByText(/current:/i).closest('div').textContent).toMatch(/Ashka/);
  });

  it('renders all order entries; current row gets is-current class', () => {
    act(() => { __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER); });
    render(<GmEncounter />);
    expect(screen.getByText('Pellias')).toBeInTheDocument();
    expect(screen.getByText('Goblin 1')).toBeInTheDocument();
    expect(screen.getByTestId('order-row-e2').className).toMatch(/is-current/);
  });

  it('setup phase: shows phase status without round/current-actor', () => {
    act(() => {
      __set('cnmh_encounter_global', { ...FOUNDRY_ENCOUNTER, phase: 'setup', round: 0, currentTurnIndex: 0 });
    });
    render(<GmEncounter />);
    expect(screen.getByText(/setup/i)).toBeInTheDocument();
    expect(screen.queryByText(/Round/)).toBeNull();
  });

  it('no authoring controls rendered', () => {
    render(<GmEncounter />);
    expect(screen.queryByLabelText('start-encounter')).toBeNull();
    expect(screen.queryByLabelText('begin-round-1')).toBeNull();
    expect(screen.queryByLabelText('add-enemy')).toBeNull();
    expect(screen.queryByLabelText('end-encounter')).toBeNull();
    expect(screen.queryByLabelText('next-turn')).toBeNull();
  });
});
