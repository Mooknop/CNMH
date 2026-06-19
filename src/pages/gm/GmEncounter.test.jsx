import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

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
vi.mock('../../components/gm/ExplorationTimeControl', () => ({ default: () => null }));
// These tests cover the read-only Foundry actor-mirror, not the play-mode
// marquee; stub PlayModeControl so its context deps (clock, etc.) aren't needed.
vi.mock('../../components/gm/PlayModeControl', () => ({ default: () => null }));

import { __reset, __set, __get } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';

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

  it('Foundry-linked setup: renders the initiative panel listing expected PCs (#494)', () => {
    act(() => {
      __set('cnmh_encounter_global', {
        ...FOUNDRY_ENCOUNTER,
        phase: 'setup', round: 0, currentTurnIndex: 0,
        order: [
          { entryId: 'e1', kind: 'pc',    charId: 'Pellias', foundryActorId: 'Actor.aaa', name: 'Pellias',  initiative: null },
          { entryId: 'e2', kind: 'enemy', foundryActorId: 'Actor.ccc', name: 'Goblin 1', initiative: null },
        ],
      });
    });
    render(<GmEncounter />);
    expect(screen.getByLabelText('initiative-setup-panel')).toBeInTheDocument();
    expect(screen.getByTestId('init-status-Pellias')).toHaveTextContent('waiting');
    expect(screen.getByLabelText('initiative-rolled-count')).toHaveTextContent('0 / 1 in');
  });

  it('does not render the initiative panel once in-progress', () => {
    act(() => { __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER); });
    render(<GmEncounter />);
    expect(screen.queryByLabelText('initiative-setup-panel')).toBeNull();
  });

  it('no authoring controls rendered', () => {
    render(<GmEncounter />);
    expect(screen.queryByLabelText('start-encounter')).toBeNull();
    expect(screen.queryByLabelText('begin-round-1')).toBeNull();
    expect(screen.queryByLabelText('add-enemy')).toBeNull();
    expect(screen.queryByLabelText('end-encounter')).toBeNull();
    expect(screen.queryByLabelText('next-turn')).toBeNull();
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

  it('"Not a PC" stores a null sentinel so auto-match cannot re-add it on refresh', () => {
    act(() => {
      __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER);
      __set('cnmh_actormap_global', { 'Actor.aaa': 'Pellias' });
    });
    render(<GmEncounter />);
    fireEvent.change(screen.getByLabelText('assign-e1'), { target: { value: '' } });
    expect(__get('cnmh_actormap_global')['Actor.aaa']).toBeNull();
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

  it('PC rows show a reaction availability badge; enemy rows do not', () => {
    act(() => {
      __set('cnmh_encounter_global', {
        ...FOUNDRY_ENCOUNTER,
        order: [
          { entryId: 'e1', kind: 'pc',    charId: 'Pellias', name: 'Pellias',  initiative: 20 },
          { entryId: 'e2', kind: 'enemy', foundryActorId: 'Actor.ccc', name: 'Goblin 1', initiative: 12 },
        ],
      });
      __set('cnmh_turnstate_Pellias', {
        hasStartedFirstTurn: true,
        reactionAvailable: true,
        reactionSpent: false,
      });
    });
    render(<GmEncounter />);
    expect(screen.getByLabelText('Pellias reaction available')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Goblin 1 reaction/)).toBeNull();

    // The badge tracks the live turn state — spending the reaction flips it.
    act(() => {
      __set('cnmh_turnstate_Pellias', {
        hasStartedFirstTurn: true,
        reactionAvailable: true,
        reactionSpent: true,
      });
    });
    expect(screen.getByLabelText('Pellias reaction spent')).toBeInTheDocument();
  });

  it('lists linked companions/familiars and spawns one on click (#362)', () => {
    act(() => {
      __set('cnmh_minionactors_global', {
        'Ashka-companion': {
          foundryActorId: 'Actor.zev', name: 'Zevira', role: 'companion',
          ownerCharId: 'Ashka', onScene: false,
        },
      });
    });
    render(<GmEncounter />);

    expect(screen.getByLabelText('minion-spawn-list')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /spawn zevira/i });
    fireEvent.click(btn);
    expect(__get('cnmh_spawnminion_global')).toMatchObject({ ownerCharId: 'Ashka', role: 'companion' });
  });

  it('renders a GM-added summon row with HP, and Dismiss removes it (#261)', () => {
    act(() => {
      __set('cnmh_encounter_global', FOUNDRY_ENCOUNTER);
      __set('cnmh_summons_global', [
        {
          entryId: 'sum-1', kind: 'summon', name: 'Skeletal Champion',
          casterId: 'IzzyUncut', sustainId: 's1',
          bestiary: { hp: { current: 42, max: 60 } },
        },
      ]);
    });
    render(<GmEncounter />);

    const row = screen.getByTestId('order-row-sum-1');
    expect(row.className).toMatch(/is-summon/);
    expect(screen.getByLabelText('Skeletal Champion hp').textContent).toBe('42/60');

    fireEvent.click(screen.getByLabelText('Dismiss Skeletal Champion'));
    expect(__get('cnmh_summons_global')).toEqual([]);
    expect(screen.queryByTestId('order-row-sum-1')).toBeNull();
  });
});
