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

  // #1736 S5: the Stride D-pad fallback is retired — below protocol 14 (or no
  // hello at all, as here) the sheet shows a compact notice instead of ever
  // driving a move. Step is unaffected (separate describe block below).
  describe('Stride outdated-bridge notice (#1736 S5)', () => {
    it('shows the notice instead of a pad when no bridge hello has arrived', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      render(<MoveActionSheet character={character} moveType="stride" onClose={() => {}} />);
      expect(screen.getByTestId('mas-outdated-notice')).toHaveTextContent(
        'Full-speed Stride needs the CNMH Bridge module updated to protocol 14+.'
      );
      expect(screen.queryByLabelText('Step east')).toBeNull();
      expect(screen.queryByLabelText('Confirm move')).toBeNull();
      Date.now.mockRestore();
    });

    it('shows the notice on a below-floor bridge (protocol 13) even once opts arrive', () => {
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
      expect(screen.getByTestId('mas-outdated-notice')).toBeInTheDocument();
      expect(screen.queryByLabelText('Step east')).toBeNull();
      Date.now.mockRestore();
    });

    it('switches to the tap flow once a 14+ hello arrives', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      let setHello, setOpts;
      render(
        <>
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
          <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
        </>
      );
      expect(screen.getByTestId('mas-outdated-notice')).toBeInTheDocument();

      act(() => setHello({ protocol: 14, module: '0.0.0-test', ts: 1 }));
      act(() => setOpts({ reqTs: 555, origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 25 }));

      expect(screen.queryByTestId('mas-outdated-notice')).toBeNull();
      expect(screen.getByLabelText(/Move to 6,5 —/)).toBeInTheDocument();
      Date.now.mockRestore();
    });
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

  // SP4 (#1223): the app-derived speed spine backs the tap flow's grid bands
  // and confirm-bar action math when Foundry's moveopts are absent or carry
  // no speed, plus the drift note. Rewritten for #1736 S5 — Stride's stepper
  // fallback (and the "Stride distance" readout it drove) is gone, so these
  // now exercise the tap flow (which is the only Stride path left) on a
  // protocol-14+ hello instead of the old D-pad.
  describe('derived-speed fallback + parity (SP4 #1223, #1736 S5)', () => {
    const runner = {
      id: 'Runner',
      name: 'Runner',
      speed: 30,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    };

    it('prices a planned route against the derived speed when moveopts carry none', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      const shortRunner = { ...runner, id: 'Runner2', speed: 10 };
      let setHello, setOpts, setPlanned;
      render(
        <>
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Runner2" onReady={(s) => (setOpts = s)} />
          <SyncDriver skey="cnmh_moveplanned_Runner2" onReady={(s) => (setPlanned = s)} />
          <MoveActionSheet character={shortRunner} moveType="stride" onClose={() => {}} />
        </>
      );
      act(() => setHello({ protocol: 14, module: '0.0.0-test', ts: 1 }));
      // Sandbox-shaped opts: origin present but NO speed field.
      act(() => setOpts({ reqTs: 555, origin: { col: 5, row: 5 }, reachable: [], blocked: [] }));

      fireEvent.click(screen.getByLabelText(/Move to 6,5 —/));
      // 15 ft against the derived 10 ft Speed → ceil(15/10) = 2 actions.
      act(() => setPlanned({
        reqTs: 555, path: [{ col: 6, row: 5, x: 600, y: 500 }], costFeet: 15, clipped: false,
      }));
      expect(screen.getByLabelText('Confirm move')).toHaveTextContent('15 ft — 2 actions');
      Date.now.mockRestore();
    });

    it('shows the parity note when Foundry speed differs from the derived total', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      let setHello, setOpts;
      render(
        <>
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Runner" onReady={(s) => (setOpts = s)} />
          <MoveActionSheet character={runner} moveType="stride" onClose={() => {}} />
        </>
      );
      act(() => setHello({ protocol: 14, module: '0.0.0-test', ts: 1 }));
      act(() => setOpts({ reqTs: 555, origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 25 }));
      expect(screen.getByLabelText('Speed parity note')).toHaveTextContent(
        "Using the sheet's 30 ft; Foundry's actor says 25 ft."
      );
      Date.now.mockRestore();
    });

    it('prices the planned route against the derived speed even when Foundry disagrees', () => {
      // App-authoritative accounting: the Foundry actor doesn't model
      // app-owned gear/feats, so its (higher) speed must NOT stretch the
      // action math. Derived 10 ft vs Foundry 25 ft on a 15 ft route → 2
      // actions (ceil(15/10)), not the 1 action Foundry's speed would price.
      vi.spyOn(Date, 'now').mockReturnValue(555);
      const shortRunner = { ...runner, id: 'Runner3', speed: 10 };
      let setHello, setOpts, setPlanned;
      render(
        <>
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Runner3" onReady={(s) => (setOpts = s)} />
          <SyncDriver skey="cnmh_moveplanned_Runner3" onReady={(s) => (setPlanned = s)} />
          <MoveActionSheet character={shortRunner} moveType="stride" onClose={() => {}} />
        </>
      );
      act(() => setHello({ protocol: 14, module: '0.0.0-test', ts: 1 }));
      act(() => setOpts({ reqTs: 555, origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 25 }));

      fireEvent.click(screen.getByLabelText(/Move to 6,5 —/));
      act(() => setPlanned({
        reqTs: 555, path: [{ col: 6, row: 5, x: 600, y: 500 }], costFeet: 15, clipped: false,
      }));
      expect(screen.getByLabelText('Confirm move')).toHaveTextContent('15 ft — 2 actions');
      Date.now.mockRestore();
    });

    it('no parity note when Foundry and the spine agree', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      let setHello, setOpts;
      render(
        <>
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Runner" onReady={(s) => (setOpts = s)} />
          <MoveActionSheet character={runner} moveType="stride" onClose={() => {}} />
        </>
      );
      act(() => setHello({ protocol: 14, module: '0.0.0-test', ts: 1 }));
      act(() => setOpts({ reqTs: 555, origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30 }));
      expect(screen.queryByLabelText('Speed parity note')).toBeNull();
      Date.now.mockRestore();
    });

    it('no parity note for a character the spine cannot derive (total 0)', () => {
      vi.spyOn(Date, 'now').mockReturnValue(555);
      let setHello, setOpts;
      render(
        <>
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
          <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
        </>
      );
      act(() => setHello({ protocol: 14, module: '0.0.0-test', ts: 1 }));
      act(() => setOpts({ reqTs: 555, origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 25 }));
      expect(screen.queryByLabelText('Speed parity note')).toBeNull();
      Date.now.mockRestore();
    });
  });

  it('ignores stale option sets from a previous request (tap flow, protocol 14)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    let setHello, setOpts;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    act(() => setHello({ protocol: 14, module: '0.0.0-test', ts: 1 }));
    // A stale response (reqTs ≠ the open request's ts) must not open the grid.
    act(() => setOpts({
      reqTs: 1, origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 25,
    }));
    expect(screen.queryByLabelText(/Move to 6,5 —/)).toBeNull();
    Date.now.mockRestore();
  });

  // #1736 S2: the plan/confirm tap flow, gated on a protocol-14+ bridgehello.
  describe('plan/confirm tap flow (#1736 S2)', () => {
    // origin (5,5), Speed 10 keeps the tap grid small (radius 6) for fast tests.
    const openTapFlow = (setHello, setOpts) => {
      act(() => setHello({ protocol: 14, module: '0.0.0-test', ts: 1 }));
      act(() => setOpts({ reqTs: 555, origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 10 }));
    };

    it('protocol 13 shows the outdated-bridge notice, no D-pad and no confirm bar (#1736 S5)', () => {
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
      expect(screen.getByTestId('mas-outdated-notice')).toBeInTheDocument();
      expect(screen.queryByLabelText('Step east')).toBeNull();
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

    it('shows range/budget clipped copy on a protocol-23+ (pathfinding) bridge', () => {
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
      act(() => setHello({ protocol: 23, module: '0.0.0-test', ts: 1 }));
      act(() => setOpts({ reqTs: 555, origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 10 }));
      fireEvent.click(screen.getByLabelText(/Move to 7,5 —/));
      act(() => setPlanned({ reqTs: 555, path: [{ col: 6, row: 5, x: 600, y: 500 }], costFeet: 5, clipped: true }));

      expect(screen.getByText(/Out of range — tap again to keep going/)).toBeInTheDocument();
      expect(screen.queryByText(/Path stops at a wall/)).toBeNull();
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
