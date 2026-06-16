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
