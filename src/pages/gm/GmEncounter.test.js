import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

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
    __get: (key) => store[key],
  };
});

jest.mock('../../contexts/ContentContext', () => ({ useContent: jest.fn() }));

const { __reset, __set, __get } = require('../../hooks/useSyncedState');
const { useContent } = require('../../contexts/ContentContext');

import GmEncounter from './GmEncounter';

const CHARACTERS = [
  { id: 'Pellias',   name: 'Pellias'   },
  { id: 'Ashka',     name: 'Ashka'     },
  { id: 'IzzyUncut', name: 'IzzyUncut' },
];

const FOUNDRY_ENCOUNTER = {
  active: true,
  phase: 'in-progress',
  round: 2,
  currentTurnIndex: 1,
  order: [
    { entryId: 'e1', kind: 'enemy', foundryActorId: 'Actor.aaa', name: 'Pellias',  initiative: 20 },
    { entryId: 'e2', kind: 'enemy', foundryActorId: 'Actor.bbb', name: 'Ashka',    initiative: 15 },
    { entryId: 'e3', kind: 'enemy', foundryActorId: 'Actor.ccc', name: 'Goblin 1', initiative: 12 },
  ],
  log: [],
  foundryCombatId: 'combat-abc123',
};

beforeEach(() => {
  __reset();
  useContent.mockReturnValue({ characters: CHARACTERS });
});

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
    // Use getAllByText since character names also appear in the assignment selects
    expect(screen.getAllByText('Pellias').length).toBeGreaterThan(0);
    expect(screen.getByTestId('order-row-e3').querySelector('.gm-encounter-name').textContent).toBe('Goblin 1');
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

  it('auto-matches combatants to characters by name on first encounter load', () => {
    act(() => { __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER); });
    render(<GmEncounter />);
    const map = __get('cnmh_actormap_global');
    expect(map['Actor.aaa']).toBe('Pellias');
    expect(map['Actor.bbb']).toBe('Ashka');
    // Goblin 1 has no matching character — not assigned
    expect(map['Actor.ccc']).toBeUndefined();
  });

  it('shows a character select for each combatant with a foundryActorId', () => {
    act(() => { __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER); });
    render(<GmEncounter />);
    expect(screen.getByLabelText('assign-e1')).toBeInTheDocument();
    expect(screen.getByLabelText('assign-e3')).toBeInTheDocument();
  });

  it('manual assignment updates the actormap', () => {
    act(() => { __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER); });
    render(<GmEncounter />);
    // Assign Goblin 1's actor to IzzyUncut
    fireEvent.change(screen.getByLabelText('assign-e3'), { target: { value: 'IzzyUncut' } });
    expect(__get('cnmh_actormap_global')['Actor.ccc']).toBe('IzzyUncut');
  });

  it('"Not a PC" option removes the assignment from the actormap', () => {
    act(() => {
      __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER);
      __set('cnmh_actormap_global', { 'Actor.aaa': 'Pellias' });
    });
    render(<GmEncounter />);
    fireEvent.change(screen.getByLabelText('assign-e1'), { target: { value: '' } });
    expect(__get('cnmh_actormap_global')['Actor.aaa']).toBeUndefined();
  });

  it('does not show select for entries without a foundryActorId', () => {
    act(() => {
      __set('cnmh_encounter_global', {
        ...FOUNDRY_ENCOUNTER,
        order: [{ entryId: 'e9', kind: 'enemy', name: 'Mystery', initiative: 5 }],
      });
    });
    render(<GmEncounter />);
    expect(screen.queryByLabelText('assign-e9')).toBeNull();
  });
});
