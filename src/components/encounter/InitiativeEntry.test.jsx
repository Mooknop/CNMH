import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Shared synced-state store so InitiativeEntry's useEncounter and a sibling
// "control" useEncounter (acting as the GM panel) read/write the same record.
// Mirrors the pattern from HandsPanel.test.js.
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
    __reset: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
});

// useCharacter is the data hook InitiativeEntry reads its skill modifiers from.
// Return null when no character is passed (every pre-existing test) so the
// Harmless Bystander toggle stays hidden; return the carried modifiers when one
// is. hasFeat (real, from CharacterUtils) reads the raw character.feats prop.
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { skillModifiers: c.skillModifiers || {} } : null),
}));

import { __reset, useSyncedState } from '../../hooks/useSyncedState';
import InitiativeEntry from './InitiativeEntry';
import { useEncounter } from '../../hooks/useEncounter';

const izzy = {
  id: 'IzzyUncut',
  name: 'Izzy',
  feats: [{ name: 'Harmless Bystander' }],
  skillModifiers: { deception: 11, perception: 9 },
};

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

  it('shows no Harmless Bystander toggle for a character without the feat', () => {
    let drv;
    const { rerender } = render(
      <>
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="Pellias" character={{ id: 'Pellias', name: 'Pellias', feats: [] }} />
      </>
    );
    startWith(drv, [{ id: 'Pellias', name: 'Pellias' }]);
    rerender(
      <>
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="Pellias" character={{ id: 'Pellias', name: 'Pellias', feats: [] }} />
      </>
    );
    expect(screen.queryByLabelText('harmless-bystander-toggle')).toBeNull();
    expect(screen.getByLabelText('initiative-input')).toBeInTheDocument();
  });

  it('Harmless Bystander toggle computes initiative as d20 + Deception and flags the declaration', () => {
    let drv;
    const renderTree = () => (
      <>
        <Driver onReady={(e) => (drv = e)} />
        <InitiativeEntry charId="IzzyUncut" character={izzy} />
      </>
    );
    const { rerender } = render(renderTree());
    startWith(drv, [{ id: 'IzzyUncut', name: 'Izzy' }]);
    rerender(renderTree());

    // Toggle on → the total field is replaced by a d20 field.
    fireEvent.click(screen.getByLabelText('harmless-bystander-toggle'));
    expect(screen.getByLabelText('d20-input')).toBeInTheDocument();
    expect(screen.queryByLabelText('initiative-input')).toBeNull();

    // Entering a d20 writes d20 + Deception(11) as the order initiative.
    fireEvent.change(screen.getByLabelText('d20-input'), { target: { value: '14' } });
    expect(drv.encounter.order[0].initiative).toBe(25);
    expect(screen.getByLabelText('initiative-breakdown')).toHaveTextContent('d20 14 + Deception +11 = 25');

    // Toggling off restores the total field and clears the computed initiative.
    fireEvent.click(screen.getByLabelText('harmless-bystander-toggle'));
    expect(screen.getByLabelText('initiative-input')).toBeInTheDocument();
    expect(drv.encounter.order[0].initiative).toBeNull();
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
