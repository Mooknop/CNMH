import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Shared synced-state store — mirrors InitiativeEntry.test.js pattern.
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
  };
});

const mockSendUpdate = jest.fn();
jest.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate }),
}));

const { __reset } = require('../../hooks/useSyncedState');
import TurnTrackerPanel from './TurnTrackerPanel';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';

const pellias = { id: 'Pellias', name: 'Pellias' };
const ashka = { id: 'Ashka', name: 'Ashka' };

const EncounterDriver = ({ onReady }) => {
  const enc = useEncounter();
  React.useEffect(() => { onReady(enc); }, [enc, onReady]);
  return null;
};

const TurnDriver = ({ charId, onReady }) => {
  const ts = useTurnState(charId);
  React.useEffect(() => { onReady(ts); }, [ts, onReady]);
  return null;
};

beforeEach(() => {
  __reset();
  mockSendUpdate.mockClear();
});

describe('TurnTrackerPanel', () => {
  it('renders nothing when encounter is idle', () => {
    const { container } = render(
      <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows setup message during setup phase', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias, ashka]));
    expect(screen.getByText(/Waiting for all players/)).toBeInTheDocument();
  });

  it('shows round and current actor when in-progress', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias, ashka]));
    const [p, a] = drv.encounter.order;
    act(() => drv.setInitiative(p.entryId, 20));
    act(() => drv.setInitiative(a.entryId, 10));
    act(() => drv.beginRound1());
    expect(screen.getByText('Round 1')).toBeInTheDocument();
    expect(screen.getByText(/Pellias's turn/)).toBeInTheDocument();
  });

  it('shows 3 action pips and reaction icon when it is my turn', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias]));
    const [p] = drv.encounter.order;
    act(() => drv.setInitiative(p.entryId, 15));
    act(() => drv.beginRound1());
    expect(screen.getByRole('group', { name: 'Turn controls' })).toBeInTheDocument();
    expect(screen.getByLabelText('Actions spent')).toBeInTheDocument();
  });

  it('hides turn controls when it is not my turn', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Ashka" characterName="Ashka" />
      </>
    );
    act(() => drv.startEncounter([pellias, ashka]));
    const [p, a] = drv.encounter.order;
    act(() => drv.setInitiative(p.entryId, 20)); // Pellias goes first
    act(() => drv.setInitiative(a.entryId, 10));
    act(() => drv.beginRound1());
    // Pellias is current, Ashka's panel should not show controls
    expect(screen.queryByRole('group', { name: 'Turn controls' })).toBeNull();
  });

  it('Submit Turn is disabled when actionsSpent > 3', () => {
    let drv, tsDriver;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias]));
    const [p] = drv.encounter.order;
    act(() => drv.setInitiative(p.entryId, 12));
    act(() => drv.beginRound1());
    // Spend 4 actions (over budget)
    act(() => tsDriver.spendActions(4, 'Overdrive'));
    const btn = screen.getByRole('button', { name: 'Submit turn' });
    expect(btn).toBeDisabled();
  });

  it('Submit Turn is enabled at 3 actions spent', () => {
    let drv, tsDriver;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias]));
    const [p] = drv.encounter.order;
    act(() => drv.setInitiative(p.entryId, 12));
    act(() => drv.beginRound1());
    act(() => tsDriver.spendActions(3, 'Triple'));
    const btn = screen.getByRole('button', { name: 'Submit turn' });
    expect(btn).not.toBeDisabled();
  });

  it('Submit Turn advances the encounter and resets next PC turnstate', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias, ashka]));
    const [p, a] = drv.encounter.order;
    act(() => drv.setInitiative(p.entryId, 20));
    act(() => drv.setInitiative(a.entryId, 10));
    act(() => drv.beginRound1());

    // Pellias submits their turn
    fireEvent.click(screen.getByRole('button', { name: 'Submit turn' }));

    // Encounter should have advanced to Ashka
    expect(drv.encounter.currentTurnIndex).toBe(1);
    // sendUpdate should have been called to reset Ashka's turnstate
    expect(mockSendUpdate).toHaveBeenCalledWith('Ashka', 'turnstate', expect.objectContaining({
      actionsSpent: 0,
      reactionAvailable: true,
      hasStartedFirstTurn: true,
    }));
  });

  it('reaction icon shows unavailable state before first turn', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    act(() => drv.startEncounter([pellias]));
    const [p] = drv.encounter.order;
    act(() => drv.setInitiative(p.entryId, 12));
    act(() => drv.beginRound1());
    expect(screen.getByLabelText(/unavailable until your first turn/i)).toBeInTheDocument();
  });
});
