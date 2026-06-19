import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Shared synced-state store so useInitiativeRoll reads the seeded per-PC keys.
vi.mock('../../hooks/useSyncedState', () => {
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
    __set: (key, value) => { store[key] = value; subs.forEach((f) => f()); },
  };
});

const sendUpdate = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({ useSession: () => ({ sendUpdate }) }));

import { __reset, __set } from '../../hooks/useSyncedState';
import GmInitiativePanel from './GmInitiativePanel';

const PCS = [
  { charId: 'Pellias', entryId: 'cbt-pellias', name: 'Pellias' },
  { charId: 'Vask',    entryId: 'cbt-vask',    name: 'Vask' },
];

beforeEach(() => {
  __reset();
  sendUpdate.mockClear();
});

describe('GmInitiativePanel', () => {
  it('lists each expected PC with submitted/waiting state and an N / M count', () => {
    act(() => {
      __set('cnmh_initroll_Pellias', { d20: 15, mod: 7, total: 22, skill: 'perception', ts: 1 });
    });
    render(<GmInitiativePanel pcs={PCS} />);

    expect(screen.getByLabelText('initiative-rolled-count')).toHaveTextContent('1 / 2 in');
    expect(screen.getByTestId('init-status-Pellias')).toHaveTextContent('22');
    expect(screen.getByTestId('init-status-Vask')).toHaveTextContent('waiting');
  });

  it('updates the count reactively as a roll arrives', () => {
    render(<GmInitiativePanel pcs={PCS} />);
    expect(screen.getByLabelText('initiative-rolled-count')).toHaveTextContent('0 / 2 in');

    act(() => {
      __set('cnmh_initroll_Vask', { d20: 9, mod: 5, total: 14, skill: 'stealth', ts: 2 });
    });
    expect(screen.getByLabelText('initiative-rolled-count')).toHaveTextContent('1 / 2 in');
    expect(screen.getByTestId('init-status-Vask')).toHaveTextContent('14');
  });

  it('"Start anyway" commits with whatever rolls are in (missing PCs omitted) + rollNpcs', () => {
    act(() => {
      __set('cnmh_initroll_Pellias', { d20: 15, mod: 7, total: 22, skill: 'perception', ts: 1 });
    });
    render(<GmInitiativePanel pcs={PCS} />);

    fireEvent.click(screen.getByLabelText('start-anyway'));
    expect(sendUpdate).toHaveBeenCalledWith('global', 'initcommit', {
      rolls: [{ entryId: 'cbt-pellias', initiative: 22 }],
      rollNpcs: true,
    });
  });

  it('"Reopen initiative" clears every PC\'s submitted roll', () => {
    render(<GmInitiativePanel pcs={PCS} />);
    fireEvent.click(screen.getByLabelText('reopen-initiative'));
    expect(sendUpdate).toHaveBeenCalledWith('Pellias', 'initroll', null);
    expect(sendUpdate).toHaveBeenCalledWith('Vask', 'initroll', null);
  });

  it('renders an empty-state message with no PC combatants', () => {
    render(<GmInitiativePanel pcs={[]} />);
    expect(screen.getByLabelText('initiative-rolled-count')).toHaveTextContent('0 / 0 in');
    expect(screen.getByText(/No PC combatants yet/i)).toBeInTheDocument();
  });
});
