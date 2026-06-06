import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Shared synced-state store so InitiativeEntry's useEncounter and a sibling
// "control" useEncounter (acting as the GM panel) read/write the same record.
// Mirrors the pattern from HandsPanel.test.js.
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
    __reset: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
});

const { __reset } = require('../../hooks/useSyncedState');
import InitiativeEntry from './InitiativeEntry';
import { useEncounter } from '../../hooks/useEncounter';

// Helper component to drive encounter mutations alongside the InitiativeEntry.
const Driver = ({ onReady }) => {
  const enc = useEncounter();
  React.useEffect(() => {
    onReady(enc);
  }, [enc, onReady]);
  return null;
};

beforeEach(() => __reset());

const startWith = (drv, characters) => act(() => drv.startEncounter(characters));

describe('InitiativeEntry', () => {
  it('renders nothing outside the setup phase', () => {
    render(<InitiativeEntry charId="Pellias" />);
    expect(screen.queryByLabelText('initiative-input')).toBeNull();
  });

  it('renders nothing if the local character is not in the order (e.g. enemy-only encounter)', () => {
    let drv;
    render(
      <>
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="UnknownCharacter" />
      </>
    );
    startWith(drv, [{ id: 'Pellias', name: 'Pellias' }]);
    // Setup phase is active for Pellias but not for UnknownCharacter — banner hidden.
    expect(screen.queryByLabelText('initiative-input')).toBeNull();
  });

  it('renders during setup and writes initiative back through useEncounter', () => {
    let drv;
    const { rerender } = render(
      <>
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="Pellias" />
      </>
    );
    startWith(drv, [{ id: 'Pellias', name: 'Pellias' }]);
    rerender(
      <>
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="Pellias" />
      </>
    );
    const input = screen.getByLabelText('initiative-input');
    fireEvent.change(input, { target: { value: '17' } });
    expect(drv.encounter.order[0].initiative).toBe(17);
  });

  it('shows Scout bonus reminder when scout bonus key is set and character is not the scout', () => {
    // Use a Driver-style component to seed the scout bonus key inside React.
    const { useSyncedState } = require('../../hooks/useSyncedState');
    const ScoutSetter = ({ value }) => {
      const [, set] = useSyncedState('cnmh_scoutbonus_global', null);
      React.useEffect(() => { set(value); }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return null;
    };

    let drv;
    const { rerender } = render(
      <>
        <ScoutSetter value="scout-char-99" />
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="Pellias" />
      </>
    );
    startWith(drv, [{ id: 'Pellias', name: 'Pellias' }]);
    rerender(
      <>
        <ScoutSetter value="scout-char-99" />
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="Pellias" />
      </>
    );
    expect(screen.getByText(/\+1 circumstance bonus to initiative/)).toBeInTheDocument();
  });

  it('does not show Scout reminder when the character is the scout', () => {
    const { useSyncedState } = require('../../hooks/useSyncedState');
    const ScoutSetter = ({ value }) => {
      const [, set] = useSyncedState('cnmh_scoutbonus_global', null);
      React.useEffect(() => { set(value); }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return null;
    };

    let drv;
    const { rerender } = render(
      <>
        <ScoutSetter value="Pellias" />
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="Pellias" />
      </>
    );
    startWith(drv, [{ id: 'Pellias', name: 'Pellias' }]);
    rerender(
      <>
        <ScoutSetter value="Pellias" />
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="Pellias" />
      </>
    );
    expect(screen.queryByText(/\+1 circumstance bonus to initiative/)).not.toBeInTheDocument();
  });

  it('does NOT render once the encounter has moved to in-progress', () => {
    let drv;
    const { rerender } = render(
      <>
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="Pellias" />
      </>
    );
    startWith(drv, [{ id: 'Pellias', name: 'Pellias' }]);
    rerender(
      <>
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="Pellias" />
      </>
    );
    const entryId = drv.encounter.order[0].entryId;
    act(() => drv.setInitiative(entryId, 12));
    act(() => drv.beginRound1());
    rerender(
      <>
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="Pellias" />
      </>
    );
    expect(screen.queryByLabelText('initiative-input')).toBeNull();
  });
});
