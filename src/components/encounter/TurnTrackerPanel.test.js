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

  // Drive one eastward step through the real movement hook: feed reachable
  // neighbours, tap the East arrow, then confirm the move completed. Date.now is
  // mocked to a constant so every reqTs correlates.
  const stepEast = (setOpts, setDone) => {
    act(() => setOpts({
      reqTs: 555,
      origin: { col: 5, row: 5 },
      reachable: [{ col: 6, row: 5, feet: 5, terrain: 'normal' }],
      blocked: [],
      speed: 25,
    }));
    fireEvent.click(screen.getByLabelText('Step east'));
    act(() => setDone({ reqTs: 555, newPosition: { col: 6, row: 5 }, feetMoved: 5 }));
  };

  it('Stride charges 1 action per Speed of accumulated stepping', () => {
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

    // First step spends the Stride action; the confirm carries no action cost
    // (accounting happens on move-done, not on confirm).
    stepEast(setOpts, setDone);
    expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', 'moveconfirm', expect.objectContaining({
      destination: { col: 6, row: 5 }, moveType: 'stride', ts: 555,
    }));
    expect(tsDriver.turnState.actionsSpent).toBe(1);
    expect(screen.getByLabelText('Stride distance')).toHaveTextContent('5/25 ft');

    // Steps 2–5 stay within the 25ft Speed → still 1 action.
    for (let i = 0; i < 4; i++) stepEast(setOpts, setDone);
    expect(tsDriver.turnState.actionsSpent).toBe(1);
    expect(screen.getByLabelText('Stride distance')).toHaveTextContent('25/25 ft');

    // Step 6 crosses Speed → a 2nd Stride action, distance resets to this step.
    stepEast(setOpts, setDone);
    expect(tsDriver.turnState.actionsSpent).toBe(2);
    expect(screen.getByLabelText('Stride distance')).toHaveTextContent('5/25 ft');

    Date.now.mockRestore();
  });

  it('Step spends exactly one action and closes the pad', () => {
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
    fireEvent.click(screen.getByLabelText('move-step'));
    stepEast(setOpts, setDone);

    expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', 'moveconfirm', expect.objectContaining({
      moveType: 'step', ts: 555,
    }));
    expect(tsDriver.turnState.actionsSpent).toBe(1);
    // Single dedicated action → pad closes, Move button returns.
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
      blocked: [], speed: 25,
    }));
    expect(screen.queryByLabelText('Step east')).toBeNull();
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

  // ── Shield Block reaction (Slice 4) ──────────────────────────────────────
  function startAndRaiseShield(getDrv) {
    startMyTurnShield(getDrv);
    fireEvent.click(screen.getByLabelText('Raise a Shield'));
  }

  it('Shield Block bar appears when shield is raised', () => {
    let drv;
    render(<><EncounterDriver onReady={(e) => (drv = e)} /><TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} /></>);
    startAndRaiseShield(() => drv);
    expect(screen.getByLabelText('Shield Block')).toBeInTheDocument();
    expect(screen.getByLabelText('Shield Block damage')).toBeInTheDocument();
  });

  it('clicking Block with a damage value spends reaction and logs the result', () => {
    let drv, tsDriver;
    render(<><EncounterDriver onReady={(e) => (drv = e)} /><TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} /><TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} /></>);
    startAndRaiseShield(() => drv);

    fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText('Shield Block'));

    expect(tsDriver.turnState.reactionSpent).toBe(true);
    // Result logged: H5 on 12 → 5 prevented, shield 13HP
    const log = drv.encounter.log;
    expect(log.some((e) => e.text.includes('5 prevented'))).toBe(true);
  });

  it('Block button is disabled with no damage entered', () => {
    let drv;
    render(<><EncounterDriver onReady={(e) => (drv = e)} /><TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} /></>);
    startAndRaiseShield(() => drv);
    expect(screen.getByLabelText('Shield Block')).toBeDisabled();
  });

  it('Block button is disabled after the reaction is spent', () => {
    let drv;
    render(<><EncounterDriver onReady={(e) => (drv = e)} /><TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} /></>);
    startAndRaiseShield(() => drv);
    fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText('Shield Block'));
    // After spending the reaction the button should be disabled.
    expect(screen.getByLabelText('Shield Block')).toBeDisabled();
  });

  // ── Flanking badge ────────────────────────────────────────────────────────
  // Pellias + an enemy in the order so there is something to show the badge on.
  const startMyTurnWithEnemy = (getDrv) => {
    act(() => getDrv().startEncounter([pellias]));
    act(() => getDrv().addEnemy('Goblin', 8));
    const [p] = getDrv().encounter.order;
    act(() => getDrv().setInitiative(p.entryId, 15));
    act(() => getDrv().beginRound1());
  };

  it('shows a flanked badge on enemy order entry when flanked state arrives', () => {
    let drv, setFlanked;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <SyncDriver skey="cnmh_flanked_global" onReady={(s) => (setFlanked = s)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurnWithEnemy(() => drv);
    const goblin = drv.encounter.order.find((e) => e.name === 'Goblin');

    // Simulate bridge pushing flanked state.
    act(() => setFlanked({ [goblin.entryId]: { byCharIds: ['Pellias', 'Ashka'] } }));

    expect(screen.getByLabelText('Goblin is flanked')).toBeInTheDocument();
  });

  // ── Shield Block reaction (Slice 4) ──────────────────────────────────────
  function startAndRaiseShield(getDrv) {
    startMyTurnShield(getDrv);
    fireEvent.click(screen.getByLabelText('Raise a Shield'));
  }

  it('Shield Block button appears when shield is raised', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" inventory={shieldInv} />
      </>
    );
    startAndRaiseShield(() => drv);
    expect(screen.getByLabelText('Shield Block')).toBeInTheDocument();
  });

  // ── Bestiary button ───────────────────────────────────────────────────────

  it('shows Bestiary button when enemies are present', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurnWithEnemy(() => drv);
    expect(screen.getByLabelText('Open Bestiary')).toBeInTheDocument();
  });

  it('hides Bestiary button when there are no enemies', () => {
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
    expect(screen.queryByLabelText('Open Bestiary')).not.toBeInTheDocument();
  });

  it('opens BestiaryModal when Bestiary button is clicked', () => {
    let drv;
    render(
      <>
        <EncounterDriver onReady={(e) => (drv = e)} />
        <TurnTrackerPanel charId="Pellias" characterName="Pellias" />
      </>
    );
    startMyTurnWithEnemy(() => drv);
    fireEvent.click(screen.getByLabelText('Open Bestiary'));
    // Modal is open: the modal heading and the enemy name both appear.
    expect(screen.getAllByText('Bestiary').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Goblin').length).toBeGreaterThanOrEqual(1);
  });

});
