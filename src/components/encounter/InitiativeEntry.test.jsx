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
    // Mount-only seed of the scout bonus key, as in the previous test.
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

  it('does NOT render once the encounter has moved to in-progress (app-only)', () => {
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

// ── Foundry-linked path: d20 + skill → per-player cnmh_initroll_<charId> ──
describe('InitiativeEntry — Foundry-linked', () => {
  const vask = {
    id: 'Vask',
    name: 'Vask',
    feats: [],
    skillModifiers: { perception: 7, stealth: 10, deception: 2 },
  };

  // A bridge-pushed setup-phase encounter: foundryCombatId set, PC already in the
  // order with a null initiative (not yet rolled).
  const foundryEncounter = (charId, name) => ({
    active: true,
    phase: 'setup',
    round: 0,
    currentTurnIndex: 0,
    foundryCombatId: 'combat-1',
    order: [{ entryId: `cbt-${charId}`, kind: 'pc', charId, name, initiative: null }],
    log: [],
    saveRequests: [],
  });

  // Seeds the shared synced store with a Foundry-linked encounter on mount.
  const Seeder = ({ value }) => {
    const [, set] = useSyncedState('cnmh_encounter_global', null);
    React.useEffect(() => { set(value); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  };

  // Captures the live cnmh_initroll_<charId> and raw encounter for assertions.
  let captured;
  const Reader = ({ charId }) => {
    const [roll] = useSyncedState(`cnmh_initroll_${charId}`, null);
    const [enc]  = useSyncedState('cnmh_encounter_global', null);
    captured = { roll, enc };
    return null;
  };

  // Mount-only seed of the scout bonus key (as in the tests above).
  const ScoutSetter = ({ value }) => {
    const [, set] = useSyncedState('cnmh_scoutbonus_global', null);
    React.useEffect(() => { set(value); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  };

  beforeEach(() => { captured = undefined; });

  // Render the seeded tree, then rerender so InitiativeEntry reads the now-populated
  // store (the Seeder's mount effect lands after the first render, as in the
  // ScoutSetter tests above).
  const renderFoundry = (extra = null) => {
    const tree = () => (
      <>
        {extra}
        <Seeder value={foundryEncounter('Vask', 'Vask')} />
        <Reader charId="Vask" />
        <InitiativeEntry charId="Vask" character={vask} />
      </>
    );
    const { rerender } = render(tree());
    rerender(tree());
    return { rerender, tree };
  };

  it('shows the d20 + skill entry (not the app-only total field)', () => {
    renderFoundry();
    expect(screen.getByLabelText('d20-input')).toBeInTheDocument();
    expect(screen.getByLabelText('initiative-skill-select')).toBeInTheDocument();
    expect(screen.queryByLabelText('initiative-input')).toBeNull();
  });

  it('d20 + default Perception writes the total to cnmh_initroll_<charId>, not the order', () => {
    renderFoundry();
    fireEvent.change(screen.getByLabelText('d20-input'), { target: { value: '15' } });
    expect(screen.getByLabelText('initiative-breakdown'))
      .toHaveTextContent('d20 15 + Perception +7 = 22');

    fireEvent.click(screen.getByLabelText('submit-initiative'));
    expect(captured.roll).toMatchObject({ d20: 15, mod: 7, total: 22, skill: 'perception' });
    // The encounter order is left untouched — the bridge owns it.
    expect(captured.enc.order[0].initiative).toBeNull();
  });

  it('skill selection changes the modifier used', () => {
    renderFoundry();
    fireEvent.change(screen.getByLabelText('initiative-skill-select'), { target: { value: 'stealth' } });
    fireEvent.change(screen.getByLabelText('d20-input'), { target: { value: '15' } });
    expect(screen.getByLabelText('initiative-breakdown'))
      .toHaveTextContent('d20 15 + Stealth +10 = 25');

    fireEvent.click(screen.getByLabelText('submit-initiative'));
    expect(captured.roll).toMatchObject({ mod: 10, total: 25, skill: 'stealth' });
  });

  it('folds the Scout +1 circumstance bonus into the total', () => {
    renderFoundry(<ScoutSetter value="someone-else" />);
    fireEvent.change(screen.getByLabelText('d20-input'), { target: { value: '15' } });
    expect(screen.getByLabelText('initiative-breakdown'))
      .toHaveTextContent('d20 15 + Perception +7 + Scout +1 = 23');

    fireEvent.click(screen.getByLabelText('submit-initiative'));
    expect(captured.roll).toMatchObject({ mod: 8, total: 23, skill: 'perception' });
  });

  it('Harmless Bystander forces Deception and folds it in', () => {
    const izzyFoundry = {
      id: 'Vask', // keep charId aligned with the seeded order entry
      name: 'Izzy',
      feats: [{ name: 'Harmless Bystander' }],
      skillModifiers: { perception: 7, stealth: 10, deception: 11 },
    };
    const tree = () => (
      <>
        <Seeder value={foundryEncounter('Vask', 'Izzy')} />
        <Reader charId="Vask" />
        <InitiativeEntry charId="Vask" character={izzyFoundry} />
      </>
    );
    const { rerender } = render(tree());
    rerender(tree());

    fireEvent.click(screen.getByLabelText('harmless-bystander-toggle'));
    // Skill select is forced to Deception and locked.
    expect(screen.getByLabelText('initiative-skill-select')).toHaveValue('deception');
    expect(screen.getByLabelText('initiative-skill-select')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('d20-input'), { target: { value: '14' } });
    expect(screen.getByLabelText('initiative-breakdown'))
      .toHaveTextContent('d20 14 + Deception +11 = 25');
    fireEvent.click(screen.getByLabelText('submit-initiative'));
    expect(captured.roll).toMatchObject({ total: 25, skill: 'deception' });
  });

  it('shows a submitted state and allows re-entry until combat starts', () => {
    renderFoundry();
    fireEvent.change(screen.getByLabelText('d20-input'), { target: { value: '15' } });
    fireEvent.click(screen.getByLabelText('submit-initiative'));

    // Submitted view replaces the input with a confirmation + breakdown.
    expect(screen.getByLabelText('initiative-submitted')).toBeInTheDocument();
    expect(screen.queryByLabelText('d20-input')).toBeNull();

    // Re-enter restores the input, seeded with the prior d20.
    fireEvent.click(screen.getByText('Re-enter'));
    expect(screen.getByLabelText('d20-input')).toHaveValue(15);
  });
});
