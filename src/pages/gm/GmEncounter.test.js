import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Shared synced-state store so GmEncounter + (a future TurnTrackerPanel) +
// useEncounter all read/write the same record across renders.
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

jest.mock('../../contexts/ContentContext', () => ({ useContent: jest.fn() }));

const { useContent } = require('../../contexts/ContentContext');
const { __reset } = require('../../hooks/useSyncedState');

import GmEncounter from './GmEncounter';
import { useEncounter } from '../../hooks/useEncounter';

const party = [
  { id: 'Pellias', name: 'Pellias' },
  { id: 'AshkaBGosh', name: 'Ashka' },
];

const setContent = () => useContent.mockReturnValue({ characters: party });

beforeEach(() => {
  __reset();
  setContent();
});
afterEach(() => jest.restoreAllMocks());

// Test harness that mounts GmEncounter and ALSO exposes the live useEncounter
// hook value so individual tests can assert encounter-state mutations.
let captured;
const Inspector = () => {
  captured = useEncounter();
  return null;
};

const renderPanel = () =>
  render(
    <>
      <GmEncounter />
      <Inspector />
    </>
  );

describe('GmEncounter', () => {
  it('idle phase: only Start Encounter renders', () => {
    renderPanel();
    expect(screen.getByLabelText('start-encounter')).toBeInTheDocument();
    expect(screen.queryByLabelText('begin-round-1')).toBeNull();
    expect(screen.queryByLabelText('end-encounter')).toBeNull();
  });

  it('Start Encounter seeds pc entries and enters setup phase', () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('start-encounter'));
    expect(captured.encounter.phase).toBe('setup');
    expect(captured.encounter.order.map((e) => e.charId)).toEqual(['Pellias', 'AshkaBGosh']);
    // Both pc rows render.
    expect(screen.getByText('Pellias')).toBeInTheDocument();
    expect(screen.getByText('Ashka')).toBeInTheDocument();
  });

  it('GM can add an enemy with initiative; the row shows up with kind=enemy', () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('start-encounter'));
    fireEvent.change(screen.getByLabelText('enemy-name'), { target: { value: 'Goblin 1' } });
    fireEvent.change(screen.getByLabelText('enemy-initiative'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('add-enemy'));
    const enemy = captured.encounter.order.find((e) => e.kind === 'enemy');
    expect(enemy).toMatchObject({ name: 'Goblin 1', initiative: 14 });
    expect(screen.getByText('Goblin 1')).toBeInTheDocument();
  });

  it('per-row remove deletes a setup entry', () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('start-encounter'));
    const pellias = captured.encounter.order.find((e) => e.charId === 'Pellias');
    fireEvent.click(screen.getByLabelText(`remove-${pellias.entryId}`));
    expect(captured.encounter.order.find((e) => e.charId === 'Pellias')).toBeUndefined();
  });

  it('Begin Round 1 is disabled until every entry has a numeric initiative', () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('start-encounter'));
    const begin = screen.getByLabelText('begin-round-1');
    expect(begin).toBeDisabled();
    // Set initiatives through the hook (the per-player input lives in
    // InitiativeEntry.test.js; here we only exercise the panel.)
    act(() => {
      captured.encounter.order.forEach((e, i) =>
        captured.setInitiative(e.entryId, i === 0 ? 20 : 12)
      );
    });
    expect(screen.getByLabelText('begin-round-1')).not.toBeDisabled();
    fireEvent.click(screen.getByLabelText('begin-round-1'));
    expect(captured.encounter.phase).toBe('in-progress');
    expect(captured.encounter.round).toBe(1);
  });

  it('Next Turn / Begin Next Round advance the tracker; current row is highlighted', () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('start-encounter'));
    act(() => {
      captured.encounter.order.forEach((e, i) =>
        captured.setInitiative(e.entryId, i === 0 ? 20 : 12)
      );
    });
    fireEvent.click(screen.getByLabelText('begin-round-1'));
    fireEvent.click(screen.getByLabelText('next-turn'));
    expect(captured.encounter.currentTurnIndex).toBe(1);
    fireEvent.click(screen.getByLabelText('begin-next-round'));
    expect(captured.encounter.round).toBe(2);
    expect(captured.encounter.currentTurnIndex).toBe(0);
    // Current row markup
    const currentRow = screen.getByTestId(`order-row-${captured.encounter.order[0].entryId}`);
    expect(currentRow.className).toMatch(/is-current/);
  });

  it('End Encounter is behind a typed-confirm and wipes back to idle', () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText('start-encounter'));
    fireEvent.click(screen.getByLabelText('end-encounter'));
    // Modal is up; until we type END, Confirm is disabled.
    const confirmBtn = screen.getByRole('button', { name: 'End encounter' });
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'END' } });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(captured.encounter.phase).toBe('idle');
    expect(captured.encounter.order).toHaveLength(0);
    expect(captured.encounter.log).toHaveLength(0);
  });
});
