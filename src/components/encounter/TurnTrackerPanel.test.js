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

const { __reset, useSyncedState } = require('../../hooks/useSyncedState');
import TurnTrackerPanel from './TurnTrackerPanel';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';

// Lets a test inject bridge responses (cnmh_moveopts_* / cnmh_movedone_*) into
// the shared synced-state store.
const SyncDriver = ({ skey, onReady }) => {
  const [, set] = useSyncedState(skey, null);
  React.useEffect(() => { onReady(set); }, [set, onReady]);
  return null;
};

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

  it('reaction is available at the start of your turn (regained each turn)', () => {
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
    // The self-reset on turn start gives a fresh turn: reaction available.
    expect(screen.getByLabelText('Reaction (available)')).toBeInTheDocument();
  });

  // ── Movement (Feature 3) ────────────────────────────────────────────────
  // getDrv re-reads the live hook value (the outer var is reassigned on each
  // re-render via onReady, so a captured-by-value reference would go stale).
  const startMyTurn = (getDrv) => {
    act(() => getDrv().startEncounter([pellias]));
    const [p] = getDrv().encounter.order;
    act(() => getDrv().setInitiative(p.entryId, 12));
    act(() => getDrv().beginRound1());
  };

  it('Move button reveals action choices and requests reachable squares', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);

    fireEvent.click(screen.getByLabelText('Move'));
    expect(screen.getByLabelText('move-stride')).toBeInTheDocument();

    jest.spyOn(Date, 'now').mockReturnValue(999);
    fireEvent.click(screen.getByLabelText('move-stride'));
    expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', 'movereq', { moveType: 'stride', ts: 999 });
    Date.now.mockRestore();
  });

  it('renders the grid on options, confirms a move, spends actions, and closes on done', () => {
    let drv, tsDriver, setOpts, setDone;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_movedone_Pellias" onReady={(s) => (setDone = s)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);

    jest.spyOn(Date, 'now').mockReturnValue(555);
    fireEvent.click(screen.getByLabelText('Move'));
    fireEvent.click(screen.getByLabelText('move-stride'));

    // Bridge responds with reachable squares, correlated by reqTs.
    act(() => setOpts({
      reqTs: 555,
      origin: { col: 5, row: 5 },
      reachable: [{ col: 6, row: 5, feet: 5, terrain: 'normal' }],
      blocked: [],
      maxFeet: 25,
    }));

    // Grid appears; choose the reachable square.
    fireEvent.click(screen.getByLabelText(/Move to 6,5/));

    expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', 'moveconfirm', expect.objectContaining({
      destination: { col: 6, row: 5 }, moveType: 'stride', actionCost: 1, ts: 555,
    }));
    expect(tsDriver.turnState.actionsSpent).toBe(1);

    // Bridge confirms the move completed → UI closes, Move button returns.
    act(() => setDone({ reqTs: 555, newPosition: { col: 6, row: 5 }, feetMoved: 5 }));
    expect(screen.getByLabelText('Move')).toBeInTheDocument();
    Date.now.mockRestore();
  });

  it('ignores stale option sets from a previous request', () => {
    let drv, setOpts;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurn(() => drv);

    jest.spyOn(Date, 'now').mockReturnValue(100);
    fireEvent.click(screen.getByLabelText('Move'));
    fireEvent.click(screen.getByLabelText('move-stride'));

    // A stale response (different reqTs) must not open the grid.
    act(() => setOpts({
      reqTs: 1, origin: { col: 5, row: 5 },
      reachable: [{ col: 6, row: 5, feet: 5, terrain: 'normal' }],
      blocked: [], maxFeet: 25,
    }));
    expect(screen.queryByLabelText(/Move to 6,5/)).toBeNull();
    Date.now.mockRestore();
  });

  // ── Raise a Shield (Slice 1) ────────────────────────────────────────────
  const startMyTurnShield = (getDrv) => {
    act(() => getDrv().startEncounter([pellias]));
    const [p] = getDrv().encounter.order;
    act(() => getDrv().setInitiative(p.entryId, 12));
    act(() => getDrv().beginRound1());
  };

  const shieldInv = [{
    uid: 'sh', name: 'Steel Shield', state: 'held1',
    shield: { bonus: 2, hardness: 5, hp: 20, brokenThreshold: 10 },
  }];

  it('shows a Raise a Shield control when a shield is held on my turn', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} />
      </>
    );
    startMyTurnShield(() => drv);
    expect(screen.getByLabelText('Raise a Shield')).toBeInTheDocument();
  });

  it('shows no shield control when no shield is held', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={[]} />
      </>
    );
    startMyTurnShield(() => drv);
    expect(screen.queryByLabelText('Raise a Shield')).toBeNull();
  });

  it('raising the shield spends one action and switches to Lower', () => {
    let drv, tsDriver;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} />
      </>
    );
    startMyTurnShield(() => drv);

    fireEvent.click(screen.getByLabelText('Raise a Shield'));
    expect(tsDriver.turnState.actionsSpent).toBe(1);
    expect(screen.getByLabelText('Lower Shield')).toBeInTheDocument();
    expect(screen.queryByLabelText('Raise a Shield')).toBeNull();
  });

  it('Raise is disabled when the held shield is broken', () => {
    let drv;
    const brokenInv = [{ ...shieldInv[0], shield: { bonus: 2, hardness: 5, hp: 10, brokenThreshold: 10 } }];
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={brokenInv} />
      </>
    );
    startMyTurnShield(() => drv);
    expect(screen.getByLabelText('Raise a Shield')).toBeDisabled();
  });

  it('auto-lowers the shield at the start of the next turn', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} />
      </>
    );
    startMyTurnShield(() => drv);

    fireEvent.click(screen.getByLabelText('Raise a Shield'));
    expect(screen.getByLabelText('Lower Shield')).toBeInTheDocument();

    // Advance to the next round (single PC → back to Pellias, new turn token).
    act(() => drv.beginNextRound());

    // Raise a Shield expired at the start of the new turn.
    expect(screen.getByLabelText('Raise a Shield')).toBeInTheDocument();
    expect(screen.queryByLabelText('Lower Shield')).toBeNull();
  });
});
