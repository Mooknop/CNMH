import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

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
  };
});

import { __reset } from '../../hooks/useSyncedState';
import CombatLogPanel from './CombatLogPanel';
import { useEncounter } from '../../hooks/useEncounter';

const EncounterDriver = ({ onReady }) => {
  const enc = useEncounter();
  React.useEffect(() => { onReady(enc); }, [enc, onReady]);
  return null;
};

beforeEach(() => __reset());

describe('CombatLogPanel', () => {
  it('renders nothing when encounter is idle', () => {
    const { container } = render(<CombatLogPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders after encounter starts', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <CombatLogPanel />
      </>
    );
    act(() => drv.startEncounter([{ id: 'x', name: 'X' }]));
    expect(screen.getByRole('region', { name: 'Combat log' })).toBeInTheDocument();
  });

  it('toggle button collapses and expands the log', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <CombatLogPanel />
      </>
    );
    act(() => drv.startEncounter([{ id: 'x', name: 'X' }]));
    const toggle = screen.getByRole('button');
    // Start expanded
    expect(screen.getByRole('list', { name: 'Log entries' })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByRole('list', { name: 'Log entries' })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole('list', { name: 'Log entries' })).toBeInTheDocument();
  });

  it('shows log entries from the encounter', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <CombatLogPanel />
      </>
    );
    act(() => drv.startEncounter([{ id: 'x', name: 'X' }]));
    act(() => drv.appendLog({ type: 'round', text: 'Round 2 begins' }));
    expect(screen.getByText('Round 2 begins')).toBeInTheDocument();
  });

  it('shows the entry count in the toggle button', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <CombatLogPanel />
      </>
    );
    act(() => drv.startEncounter([{ id: 'x', name: 'X' }]));
    act(() => drv.appendLog({ type: 'note', text: 'Something happened' }));
    const toggle = screen.getByRole('button');
    expect(toggle.textContent).toContain('2'); // "Encounter started" + custom entry
  });
});
