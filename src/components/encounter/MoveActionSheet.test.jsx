import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Shared synced-state store — mirrors TurnTrackerPanel.test.jsx.
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
  };
});

const mockSendUpdate = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate }),
}));

import { __reset, useSyncedState } from '../../hooks/useSyncedState';
import MoveActionSheet from './MoveActionSheet';
import { useTurnState } from '../../hooks/useTurnState';

const character = { id: 'Pellias', name: 'Pellias' };

const TurnDriver = ({ charId, onReady }) => {
  const ts = useTurnState(charId);
  React.useEffect(() => { onReady(ts); }, [ts, onReady]);
  return null;
};

const SyncDriver = ({ skey, onReady }) => {
  const [, set] = useSyncedState(skey, null);
  React.useEffect(() => { onReady(set); }, [set, onReady]);
  return null;
};

// Drive one eastward step through the real movement hook: feed reachable
// neighbours (Speed 25), tap East, then confirm the move completed. Date.now is
// mocked to a constant so every reqTs (incl. the chained refresh) correlates.
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

beforeEach(() => {
  __reset();
  mockSendUpdate.mockClear();
});

describe('MoveActionSheet', () => {
  it('requests reachable squares on open for the given moveType', () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    render(<MoveActionSheet character={character} moveType="stride" onClose={() => {}} />);
    expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', 'movereq', { moveType: 'stride', ts: 555 });
    Date.now.mockRestore();
  });

  it('Stride charges 1 action per Speed of accumulated stepping', () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let tsDriver, setOpts, setDone;
    render(
      <>
        <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_movedone_Pellias" onReady={(s) => (setDone = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );

    // First step spends the Stride action; the confirm carries no action cost.
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

  it('Step spends exactly one action and closes the sheet', () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    const onClose = vi.fn();
    let tsDriver, setOpts, setDone;
    render(
      <>
        <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_movedone_Pellias" onReady={(s) => (setDone = s)} />
        <MoveActionSheet character={character} moveType="step" onClose={onClose} />
      </>
    );

    stepEast(setOpts, setDone);
    expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', 'moveconfirm', expect.objectContaining({
      moveType: 'step', ts: 555,
    }));
    expect(tsDriver.turnState.actionsSpent).toBe(1);
    expect(onClose).toHaveBeenCalled();
    Date.now.mockRestore();
  });

  // SP4 (#1223): the app-derived speed spine backs the pad when Foundry's
  // moveopts are absent or carry no speed, plus the drift note.
  describe('derived-speed fallback + parity (SP4 #1223)', () => {
    const runner = {
      id: 'Runner',
      name: 'Runner',
      speed: 30,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    };

    it('shows the derived speed as the Stride budget before moveopts arrive', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      render(<MoveActionSheet character={runner} moveType="stride" onClose={() => {}} />);
      expect(screen.getByLabelText('Stride distance')).toHaveTextContent('0/30 ft');
      Date.now.mockRestore();
    });

    it('charges Stride actions against the derived speed when moveopts carry none', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      const shortRunner = { ...runner, id: 'Runner2', speed: 10 };
      let tsDriver, setOpts, setDone;
      render(
        <>
          <TurnDriver charId="Runner2" onReady={(t) => (tsDriver = t)} />
          <SyncDriver skey="cnmh_moveopts_Runner2" onReady={(s) => (setOpts = s)} />
          <SyncDriver skey="cnmh_movedone_Runner2" onReady={(s) => (setDone = s)} />
          <MoveActionSheet character={shortRunner} moveType="stride" onClose={() => {}} />
        </>
      );
      // Sandbox-shaped opts: reachable squares but NO speed field.
      const stepEastNoSpeed = () => {
        act(() => setOpts({
          reqTs: 555,
          origin: { col: 5, row: 5 },
          reachable: [{ col: 6, row: 5, feet: 5, terrain: 'normal' }],
          blocked: [],
        }));
        fireEvent.click(screen.getByLabelText('Step east'));
        act(() => setDone({ reqTs: 555, newPosition: { col: 6, row: 5 }, feetMoved: 5 }));
      };

      // Steps 1-2 fill the derived 10 ft budget → 1 action.
      stepEastNoSpeed();
      stepEastNoSpeed();
      expect(tsDriver.turnState.actionsSpent).toBe(1);
      expect(screen.getByLabelText('Stride distance')).toHaveTextContent('10/10 ft');
      // Step 3 crosses it → a 2nd Stride action.
      stepEastNoSpeed();
      expect(tsDriver.turnState.actionsSpent).toBe(2);
      Date.now.mockRestore();
    });

    it('shows the parity note when Foundry speed differs from the derived total', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      let setOpts;
      render(
        <>
          <SyncDriver skey="cnmh_moveopts_Runner" onReady={(s) => (setOpts = s)} />
          <MoveActionSheet character={runner} moveType="stride" onClose={() => {}} />
        </>
      );
      act(() => setOpts({
        reqTs: 555,
        origin: { col: 5, row: 5 },
        reachable: [{ col: 6, row: 5, feet: 5, terrain: 'normal' }],
        blocked: [],
        speed: 25,
      }));
      expect(screen.getByLabelText('Speed parity note')).toHaveTextContent(
        "Using the sheet's 30 ft; Foundry's actor says 25 ft."
      );
      // The budget display reads the authoritative (derived) number too.
      expect(screen.getByLabelText('Stride distance')).toHaveTextContent('0/30 ft');
      Date.now.mockRestore();
    });

    it('charges Stride actions against the derived speed even when Foundry disagrees', () => {
      // App-authoritative accounting: the Foundry actor doesn't model
      // app-owned gear/feats, so its (higher) speed must NOT stretch the
      // Stride budget. Derived 10 ft vs Foundry 25 ft → 2 steps = 1 action.
      vi.spyOn(Date, 'now').mockReturnValue(555);
      const shortRunner = { ...runner, id: 'Runner3', speed: 10 };
      let tsDriver, setOpts, setDone;
      render(
        <>
          <TurnDriver charId="Runner3" onReady={(t) => (tsDriver = t)} />
          <SyncDriver skey="cnmh_moveopts_Runner3" onReady={(s) => (setOpts = s)} />
          <SyncDriver skey="cnmh_movedone_Runner3" onReady={(s) => (setDone = s)} />
          <MoveActionSheet character={shortRunner} moveType="stride" onClose={() => {}} />
        </>
      );
      const stepEastFoundryFast = () => {
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

      stepEastFoundryFast();
      stepEastFoundryFast();
      expect(tsDriver.turnState.actionsSpent).toBe(1);
      expect(screen.getByLabelText('Stride distance')).toHaveTextContent('10/10 ft');
      // Step 3 crosses the DERIVED 10 ft (well under Foundry's 25) → action 2.
      stepEastFoundryFast();
      expect(tsDriver.turnState.actionsSpent).toBe(2);
      Date.now.mockRestore();
    });

    it('no parity note when Foundry and the spine agree', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      let setOpts;
      render(
        <>
          <SyncDriver skey="cnmh_moveopts_Runner" onReady={(s) => (setOpts = s)} />
          <MoveActionSheet character={runner} moveType="stride" onClose={() => {}} />
        </>
      );
      act(() => setOpts({
        reqTs: 555,
        origin: { col: 5, row: 5 },
        reachable: [{ col: 6, row: 5, feet: 5, terrain: 'normal' }],
        blocked: [],
        speed: 30,
      }));
      expect(screen.queryByLabelText('Speed parity note')).toBeNull();
      Date.now.mockRestore();
    });

    it('no parity note for a character the spine cannot derive (total 0)', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      let setOpts;
      render(
        <>
          <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
          <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
        </>
      );
      act(() => setOpts({
        reqTs: 555,
        origin: { col: 5, row: 5 },
        reachable: [{ col: 6, row: 5, feet: 5, terrain: 'normal' }],
        blocked: [],
        speed: 25,
      }));
      expect(screen.queryByLabelText('Speed parity note')).toBeNull();
      Date.now.mockRestore();
    });
  });

  it('ignores stale option sets from a previous request', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    let setOpts;
    render(
      <>
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    // A stale response (reqTs ≠ the open request's ts) must not open the grid.
    act(() => setOpts({
      reqTs: 1, origin: { col: 5, row: 5 },
      reachable: [{ col: 6, row: 5, feet: 5, terrain: 'normal' }],
      blocked: [], speed: 25,
    }));
    expect(screen.queryByLabelText('Step east')).toBeNull();
    Date.now.mockRestore();
  });

  // #1736 S2: the plan/confirm tap flow, gated on a protocol-14+ bridgehello.
  describe('plan/confirm tap flow (#1736 S2)', () => {
    // origin (5,5), Speed 10 keeps the tap grid small (radius 6) for fast tests.
    const openTapFlow = (setHello, setOpts) => {
      act(() => setHello({ protocol: 14, module: '0.0.0-test', ts: 1 }));
      act(() => setOpts({ reqTs: 555, origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 10 }));
    };

    it('protocol 13 keeps the stepper unchanged (no confirm bar, D-pad renders)', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      let setHello, setOpts;
      render(
        <>
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
          <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
        </>
      );
      act(() => setHello({ protocol: 13, module: '0.0.0-test', ts: 1 }));
      act(() => setOpts({
        reqTs: 555, origin: { col: 5, row: 5 },
        reachable: [{ col: 6, row: 5, feet: 5, terrain: 'normal' }], blocked: [], speed: 25,
      }));
      expect(screen.getByLabelText('Step east')).toBeInTheDocument();
      expect(screen.queryByLabelText('Confirm move')).toBeNull();
      Date.now.mockRestore();
    });

    it('tapping a cell opens the confirm bar with the route summary and action math', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      let setHello, setOpts, setPlanned;
      render(
        <>
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
          <SyncDriver skey="cnmh_moveplanned_Pellias" onReady={(s) => (setPlanned = s)} />
          <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
        </>
      );
      openTapFlow(setHello, setOpts);

      // 2 cells east = 10 ft, exactly Speed 10 → 1 action.
      fireEvent.click(screen.getByLabelText(/Move to 7,5 —/));
      expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', 'moveplan', expect.objectContaining({
        waypoints: [{ col: 7, row: 5 }], moveType: 'stride',
      }));

      act(() => setPlanned({
        reqTs: 555, path: [{ col: 7, row: 5, x: 700, y: 500 }], costFeet: 10, clipped: false,
      }));

      const bar = screen.getByLabelText('Confirm move');
      expect(bar).toHaveTextContent('10 ft — 1 action');
      expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled();
      Date.now.mockRestore();
    });

    it('shows the clipped note when the bridge reports the path stopped at a wall', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      let setHello, setOpts, setPlanned;
      render(
        <>
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
          <SyncDriver skey="cnmh_moveplanned_Pellias" onReady={(s) => (setPlanned = s)} />
          <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
        </>
      );
      openTapFlow(setHello, setOpts);
      fireEvent.click(screen.getByLabelText(/Move to 7,5 —/));
      act(() => setPlanned({ reqTs: 555, path: [{ col: 6, row: 5, x: 600, y: 500 }], costFeet: 5, clipped: true }));

      expect(screen.getByText(/Path stops at a wall/)).toBeInTheDocument();
    });

    it('disables Confirm and shows a hint when the plan costs more actions than remain', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      let tsDriver, setHello, setOpts, setPlanned;
      render(
        <>
          <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
          <SyncDriver skey="cnmh_moveplanned_Pellias" onReady={(s) => (setPlanned = s)} />
          <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
        </>
      );
      // Spend all 3 actions before planning — the confirm gate should refuse.
      act(() => tsDriver.spendActions(3, 'Test setup'));

      openTapFlow(setHello, setOpts);
      fireEvent.click(screen.getByLabelText(/Move to 7,5 —/));
      act(() => setPlanned({ reqTs: 555, path: [{ col: 7, row: 5, x: 700, y: 500 }], costFeet: 10, clipped: false }));

      expect(screen.getByText('Not enough actions left this turn.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    });

    it('Confirm spends the priced actions, sends moveconfirm with waypoints, and closes on movedone', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      const onClose = vi.fn();
      let tsDriver, setHello, setOpts, setPlanned, setDone;
      render(
        <>
          <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
          <SyncDriver skey="cnmh_moveplanned_Pellias" onReady={(s) => (setPlanned = s)} />
          <SyncDriver skey="cnmh_movedone_Pellias" onReady={(s) => (setDone = s)} />
          <MoveActionSheet character={character} moveType="stride" onClose={onClose} />
        </>
      );
      openTapFlow(setHello, setOpts);
      fireEvent.click(screen.getByLabelText(/Move to 7,5 —/));
      const planPath = [{ col: 7, row: 5, x: 700, y: 500 }];
      act(() => setPlanned({ reqTs: 555, path: planPath, costFeet: 10, clipped: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(tsDriver.turnState.actionsSpent).toBe(1);
      expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', 'moveconfirm', expect.objectContaining({
        waypoints: planPath, moveType: 'stride', actionCost: 1,
      }));

      // Full move lands exactly as planned — no refund, sheet closes (no chaining loop).
      act(() => setDone({ reqTs: 555, newPosition: { col: 7, row: 5 }, feetMoved: 10 }));
      expect(tsDriver.turnState.actionsSpent).toBe(1);
      expect(onClose).toHaveBeenCalled();
      Date.now.mockRestore();
    });

    it('refunds the over-charge when Foundry legally stops the move short', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      let tsDriver, setHello, setOpts, setPlanned, setDone;
      render(
        <>
          <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
          <SyncDriver skey="cnmh_moveplanned_Pellias" onReady={(s) => (setPlanned = s)} />
          <SyncDriver skey="cnmh_movedone_Pellias" onReady={(s) => (setDone = s)} />
          <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
        </>
      );
      openTapFlow(setHello, setOpts);
      // Tap 4 cells east = 20 ft at Speed 10 → planned as 2 actions.
      fireEvent.click(screen.getByLabelText(/Move to 9,5 —/));
      const planPath = [{ col: 9, row: 5, x: 900, y: 500 }];
      act(() => setPlanned({ reqTs: 555, path: planPath, costFeet: 20, clipped: false }));

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(tsDriver.turnState.actionsSpent).toBe(2);

      // A wall legally stops the actual move at 10 ft (1 action's worth) — refund 1.
      act(() => setDone({ reqTs: 555, newPosition: { col: 7, row: 5 }, feetMoved: 10 }));
      expect(tsDriver.turnState.actionsSpent).toBe(1);
      Date.now.mockRestore();
    });

    // The bridge re-plans at confirm time and can find the very first leg
    // blocked — movedone still arrives (never hangs), with feetMoved: 0
    // (confirmed against the paired bridge PR #1738). The full charge must
    // come back, and the sheet must still close instead of getting stuck.
    it('fully refunds and closes gracefully when the confirmed move is blocked at feetMoved: 0', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      const onClose = vi.fn();
      let tsDriver, setHello, setOpts, setPlanned, setDone;
      render(
        <>
          <TurnDriver charId="Pellias" onReady={(t) => (tsDriver = t)} />
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
          <SyncDriver skey="cnmh_moveplanned_Pellias" onReady={(s) => (setPlanned = s)} />
          <SyncDriver skey="cnmh_movedone_Pellias" onReady={(s) => (setDone = s)} />
          <MoveActionSheet character={character} moveType="stride" onClose={onClose} />
        </>
      );
      openTapFlow(setHello, setOpts);
      fireEvent.click(screen.getByLabelText(/Move to 7,5 —/));
      act(() => setPlanned({
        reqTs: 555, path: [{ col: 7, row: 5, x: 700, y: 500 }], costFeet: 10, clipped: false,
      }));

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(tsDriver.turnState.actionsSpent).toBe(1);

      act(() => setDone({ reqTs: 555, newPosition: { col: 5, row: 5 }, feetMoved: 0 }));

      expect(tsDriver.turnState.actionsSpent).toBe(0); // full refund
      expect(onClose).toHaveBeenCalled();
      Date.now.mockRestore();
    });
  });
});
