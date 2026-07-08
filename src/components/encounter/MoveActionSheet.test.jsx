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
});
