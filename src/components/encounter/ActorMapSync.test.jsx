import React from 'react';
import { render, act } from '@testing-library/react';

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
    __set: (key, value) => {
      store[key] = value;
      subs.forEach((f) => f());
    },
    __get: (key) => store[key],
  };
});

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));

import { __reset, __set, __get } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';

import ActorMapSync from './ActorMapSync';

const CHARACTERS = [
  { id: 'Pellias',   name: 'Pellias'   },
  { id: 'Ashka',     name: 'Ashka'     },
  { id: 'IzzyUncut', name: 'IzzyUncut' },
];

const FOUNDRY_ENCOUNTER = {
  active: true,
  phase: 'in-progress',
  round: 1,
  currentTurnIndex: 0,
  order: [
    { entryId: 'e1', kind: 'enemy', foundryActorId: 'Actor.aaa', name: 'Pellias',  initiative: 20 },
    { entryId: 'e2', kind: 'enemy', foundryActorId: 'Actor.bbb', name: 'Ashka',    initiative: 15 },
    { entryId: 'e3', kind: 'enemy', foundryActorId: 'Actor.ccc', name: 'Goblin 1', initiative: 12 },
  ],
  log: [],
  foundryCombatId: 'combat-xyz',
};

beforeEach(() => {
  __reset();
  useContent.mockReturnValue({ characters: CHARACTERS });
});

describe('ActorMapSync', () => {
  it('renders nothing', () => {
    const { container } = render(<ActorMapSync />);
    expect(container.firstChild).toBeNull();
  });

  it('name-matches Foundry combatants to characters on mount', () => {
    act(() => { __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER); });
    render(<ActorMapSync />);
    const map = __get('cnmh_actormap_global');
    expect(map['Actor.aaa']).toBe('Pellias');
    expect(map['Actor.bbb']).toBe('Ashka');
  });

  it('leaves unmatched enemies (Goblin 1) undecided', () => {
    act(() => { __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER); });
    render(<ActorMapSync />);
    expect(__get('cnmh_actormap_global')['Actor.ccc']).toBeUndefined();
  });

  it('does not overwrite an existing charId assignment', () => {
    act(() => {
      __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER);
      __set('cnmh_actormap_global', { 'Actor.aaa': 'IzzyUncut' });
    });
    render(<ActorMapSync />);
    // Actor.aaa was already mapped; auto-match must not clobber it
    expect(__get('cnmh_actormap_global')['Actor.aaa']).toBe('IzzyUncut');
  });

  it('does not overwrite a null sentinel ("Not a PC" set by GM)', () => {
    act(() => {
      __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER);
      // Actor.aaa name matches Pellias, but GM explicitly said "not a PC"
      __set('cnmh_actormap_global', { 'Actor.aaa': null });
    });
    render(<ActorMapSync />);
    expect(__get('cnmh_actormap_global')['Actor.aaa']).toBeNull();
  });

  it('does nothing when there is no encounter order', () => {
    render(<ActorMapSync />);
    const map = __get('cnmh_actormap_global') || {};
    expect(Object.keys(map)).toHaveLength(0);
  });
});
