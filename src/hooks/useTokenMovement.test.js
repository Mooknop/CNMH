import { renderHook, act } from '@testing-library/react';

const mockSendUpdate = vi.fn();
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate }),
}));

// Controllable synced state per key.
const syncedStates = {};
vi.mock('./useSyncedState', () => ({
  useSyncedState: (key, init) => {
    const ReactLib = require('react');
    const [val, setVal] = ReactLib.useState(syncedStates[key] ?? init);
    syncedStates[`__setter_${key}`] = setVal;
    return [val, setVal];
  },
}));

import { useTokenMovement } from './useTokenMovement';

function setup(opts = {}) {
  return renderHook(() => useTokenMovement('char-1', opts));
}

// Simulate the bridge pushing a moveopts payload.
function pushMoveOpts(payload) {
  act(() => { syncedStates['__setter_cnmh_moveopts_char-1']?.(payload); });
}

// Simulate the bridge confirming a move.
function pushMoveDone(payload) {
  act(() => { syncedStates['__setter_cnmh_movedone_char-1']?.(payload); });
}

// Simulate the bridge replying to a moveplan.
function pushMovePlanned(payload) {
  act(() => { syncedStates['__setter_cnmh_moveplanned_char-1']?.(payload); });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete syncedStates['cnmh_moveopts_char-1'];
  delete syncedStates['cnmh_movedone_char-1'];
  delete syncedStates['cnmh_moveplanned_char-1'];
  delete syncedStates['__setter_cnmh_moveopts_char-1'];
  delete syncedStates['__setter_cnmh_movedone_char-1'];
  delete syncedStates['__setter_cnmh_moveplanned_char-1'];
});

describe('useTokenMovement', () => {
  it('starts in idle state', () => {
    const { result } = setup();
    expect(result.current.stage).toBeNull();
    expect(result.current.isRefreshing).toBe(false);
  });

  it('requestMove sends movereq and transitions to awaiting-opts', () => {
    const { result } = setup();
    act(() => result.current.requestMove('stride'));
    expect(result.current.stage).toBe('awaiting-opts');
    expect(mockSendUpdate).toHaveBeenCalledWith('char-1', 'movereq', expect.objectContaining({ moveType: 'stride' }));
  });

  it('transitions to picking when correlated moveopts arrive', () => {
    const { result } = setup();
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });
    expect(result.current.stage).toBe('picking');
    // pickerOpts passes the bridge payload through verbatim, incl. speed for the
    // consumer's action accounting.
    expect(result.current.pickerOpts).toMatchObject({ origin: { col: 5, row: 5 }, speed: 30 });
  });

  it('ignores moveopts from a stale request (reqTs mismatch)', () => {
    const { result } = setup();
    act(() => result.current.requestMove('stride'));
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], maxFeet: 30, reqTs: 0 });
    expect(result.current.stage).toBe('awaiting-opts'); // unchanged
  });

  it('confirmMove sends moveconfirm and transitions to awaiting-done', () => {
    const { result } = setup();
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], maxFeet: 30, reqTs });
    act(() => result.current.confirmMove({ col: 6, row: 5 }));
    expect(result.current.stage).toBe('awaiting-done');
    expect(mockSendUpdate).toHaveBeenCalledWith('char-1', 'moveconfirm', expect.objectContaining({ destination: { col: 6, row: 5 } }));
  });

  it('movedone resets to null and calls onMoveDone', () => {
    const onMoveDone = vi.fn();
    const { result } = setup({ onMoveDone });
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], maxFeet: 30, reqTs });
    act(() => result.current.confirmMove({ col: 6, row: 5 }));
    pushMoveDone({ newPosition: { col: 6, row: 5 }, feetMoved: 5, reqTs });
    expect(result.current.stage).toBeNull();
    expect(onMoveDone).toHaveBeenCalled();
  });

  // Regression: onMoveDone calling requestMoveRefresh must win the React batch
  // so stage becomes 'awaiting-opts', not null. Previously setStage(null) ran
  // last and the grid would never update after a chained exploration move.
  it('stage is awaiting-opts (not null) when onMoveDone calls requestMoveRefresh', () => {
    // onMoveDone fires inside a React effect (already inside act). State setters
    // called synchronously here are batched with the effect's own setters — no
    // nested act needed. requestMoveRefresh closes only over stable refs (state
    // setters + sessionTs), so capturing it from the initial render is safe.
    //
    // Date.now must return distinct values for requestMove (T1) and the
    // subsequent requestMoveRefresh (T2) so the stale-reqTs guard fires correctly
    // — on fast CI machines both can land in the same millisecond otherwise.
    let tsCounter = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => tsCounter++);

    let refreshFn;
    const { result } = setup({
      onMoveDone: () => { refreshFn?.('stride'); },
    });
    refreshFn = result.current.requestMoveRefresh;

    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts; // = 1000
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });
    act(() => result.current.confirmMove({ col: 6, row: 5 }));
    pushMoveDone({ newPosition: { col: 6, row: 5 }, feetMoved: 5, reqTs });

    // requestMoveRefresh used a distinct ts (1001+), so the old opts are stale
    // and ignored — the fresh probe is in flight but opts haven't arrived yet.
    expect(result.current.stage).toBe('awaiting-opts');
    expect(result.current.isRefreshing).toBe(true);

    Date.now.mockRestore();
  });

  // #451: when the bridge piggybacks the next step's opts onto movedone,
  // requestMoveRefresh adopts them directly — no second movereq round-trip.
  it('adopts piggybacked nextOpts on refresh without sending a movereq', () => {
    let refreshFn;
    const nextOpts = { origin: { col: 6, row: 5 }, reachable: [{ col: 7, row: 5, feet: 5, terrain: 'normal' }], blocked: [], speed: 30 };
    const { result } = setup({ onMoveDone: () => { refreshFn?.('stride'); } });
    refreshFn = result.current.requestMoveRefresh;

    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });
    act(() => result.current.confirmMove({ col: 6, row: 5 }));

    const callsBefore = mockSendUpdate.mock.calls.length;
    pushMoveDone({ newPosition: { col: 6, row: 5 }, feetMoved: 5, reqTs, nextOpts });

    // Jumped straight to picking with the piggybacked opts; no extra movereq sent.
    expect(result.current.stage).toBe('picking');
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.pickerOpts).toMatchObject({ origin: { col: 6, row: 5 } });
    const newMovereqs = mockSendUpdate.mock.calls
      .slice(callsBefore)
      .filter((c) => c[1] === 'movereq');
    expect(newMovereqs).toHaveLength(0);
  });

  // Legacy bridge (no nextOpts) → refresh falls back to a movereq round-trip.
  it('falls back to a movereq round-trip when movedone carries no nextOpts', () => {
    let tsCounter = 2000;
    vi.spyOn(Date, 'now').mockImplementation(() => tsCounter++);
    let refreshFn;
    const { result } = setup({ onMoveDone: () => { refreshFn?.('stride'); } });
    refreshFn = result.current.requestMoveRefresh;

    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });
    act(() => result.current.confirmMove({ col: 6, row: 5 }));
    pushMoveDone({ newPosition: { col: 6, row: 5 }, feetMoved: 5, reqTs });

    expect(result.current.stage).toBe('awaiting-opts');
    expect(result.current.isRefreshing).toBe(true);
    expect(mockSendUpdate).toHaveBeenLastCalledWith('char-1', 'movereq', expect.objectContaining({ moveType: 'stride' }));
    Date.now.mockRestore();
  });
});

// #617/#1806: exploration-mode surfaces pass ignoreOccupancy so the bridge
// skips the #456 creature-occupancy rules entirely. Additive — omitted (the
// default) must reproduce every test above byte-for-byte.
describe('ignoreOccupancy option (#617/#1806)', () => {
  it('omitted → movereq and moveconfirm carry no ignoreOccupancy field', () => {
    const { result } = setup(); // no ignoreOccupancy passed
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    expect(mockSendUpdate.mock.calls[0][2]).not.toHaveProperty('ignoreOccupancy');

    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });
    act(() => result.current.confirmMove({ col: 6, row: 5 }));
    const confirmCall = mockSendUpdate.mock.calls.find((c) => c[1] === 'moveconfirm');
    expect(confirmCall[2]).not.toHaveProperty('ignoreOccupancy');
  });

  it('true → requestMove sends movereq with ignoreOccupancy: true', () => {
    const { result } = setup({ ignoreOccupancy: true });
    act(() => result.current.requestMove('stride'));
    expect(mockSendUpdate).toHaveBeenCalledWith('char-1', 'movereq', expect.objectContaining({ ignoreOccupancy: true }));
  });

  it('true → requestMoveRefresh (round-trip fallback) sends movereq with ignoreOccupancy: true', () => {
    let tsCounter = 4000;
    vi.spyOn(Date, 'now').mockImplementation(() => tsCounter++);
    const { result } = setup({ ignoreOccupancy: true });
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });

    act(() => result.current.requestMoveRefresh('stride'));

    expect(mockSendUpdate).toHaveBeenLastCalledWith('char-1', 'movereq', expect.objectContaining({ ignoreOccupancy: true }));
    Date.now.mockRestore();
  });

  it('true → confirmMove sends moveconfirm with ignoreOccupancy: true', () => {
    const { result } = setup({ ignoreOccupancy: true });
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });

    act(() => result.current.confirmMove({ col: 6, row: 5 }));

    expect(mockSendUpdate).toHaveBeenCalledWith('char-1', 'moveconfirm', expect.objectContaining({
      destination: { col: 6, row: 5 }, ignoreOccupancy: true,
    }));
  });

  it('true → confirmPlannedMove sends moveconfirm with ignoreOccupancy: true', () => {
    const { result } = setup({ ignoreOccupancy: true });
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });

    act(() => result.current.planMove([{ col: 6, row: 5 }]));
    const planTs = mockSendUpdate.mock.calls.find((c) => c[1] === 'moveplan')[2].ts;
    const path = [{ col: 6, row: 5, x: 600, y: 500 }];
    pushMovePlanned({ path, costFeet: 5, clipped: false, reqTs: planTs });

    act(() => result.current.confirmPlannedMove(0));

    expect(mockSendUpdate).toHaveBeenCalledWith('char-1', 'moveconfirm', expect.objectContaining({
      waypoints: path, ignoreOccupancy: true,
    }));
  });
});

// #1736 S2: the plan/confirm rail's additive stages. Every test above must
// keep passing unchanged — these only exercise the new planMove /
// confirmPlannedMove / cancelPlan surface.
describe('plan/confirm rail (#1736 S2)', () => {
  // Confirmed against the paired bridge PR #1738: an empty/absent waypoints
  // list gets NO moveplanned reply at all, so planMove must refuse it rather
  // than stranding the caller in 'awaiting-plan' forever.
  it('planMove is a no-op for an empty or missing waypoints list', () => {
    const { result } = setup();
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });
    const callsBefore = mockSendUpdate.mock.calls.length;

    act(() => result.current.planMove([]));
    expect(result.current.stage).toBe('picking');

    act(() => result.current.planMove(undefined));
    expect(result.current.stage).toBe('picking');

    const newPlanCalls = mockSendUpdate.mock.calls.slice(callsBefore).filter((c) => c[1] === 'moveplan');
    expect(newPlanCalls).toHaveLength(0);
  });

  it('planMove sends moveplan and transitions to awaiting-plan', () => {
    const { result } = setup();
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });

    act(() => result.current.planMove([{ col: 6, row: 5 }]));

    expect(result.current.stage).toBe('awaiting-plan');
    expect(mockSendUpdate).toHaveBeenCalledWith('char-1', 'moveplan', expect.objectContaining({
      waypoints: [{ col: 6, row: 5 }], moveType: 'stride',
    }));
  });

  it('transitions to planned when a correlated moveplanned arrives', () => {
    const { result } = setup();
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });

    act(() => result.current.planMove([{ col: 6, row: 5 }]));
    const planTs = mockSendUpdate.mock.calls.find((c) => c[1] === 'moveplan')[2].ts;

    pushMovePlanned({
      path: [{ col: 6, row: 5, x: 600, y: 500 }],
      costFeet: 5,
      clipped: false,
      reqTs: planTs,
    });

    expect(result.current.stage).toBe('planned');
    expect(result.current.plannedPath).toEqual({
      path: [{ col: 6, row: 5, x: 600, y: 500 }],
      costFeet: 5,
      clipped: false,
    });
  });

  it('ignores a moveplanned reply from a superseded plan (stale reqTs)', () => {
    const { result } = setup();
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });

    act(() => result.current.planMove([{ col: 6, row: 5 }]));
    pushMovePlanned({ path: [{ col: 6, row: 5 }], costFeet: 5, clipped: false, reqTs: 0 });

    expect(result.current.stage).toBe('awaiting-plan'); // unchanged
    expect(result.current.plannedPath).toBeNull();
  });

  it('re-tapping from planned sends a fresh moveplan and replaces the plan', () => {
    let tsCounter = 3000;
    vi.spyOn(Date, 'now').mockImplementation(() => tsCounter++);
    const { result } = setup();
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });

    act(() => result.current.planMove([{ col: 6, row: 5 }]));
    const firstPlanTs = mockSendUpdate.mock.calls.find((c) => c[1] === 'moveplan')[2].ts;
    pushMovePlanned({ path: [{ col: 6, row: 5 }], costFeet: 5, clipped: false, reqTs: firstPlanTs });
    expect(result.current.stage).toBe('planned');

    // Re-tap a different cell while planned: a fresh plan supersedes the old one.
    act(() => result.current.planMove([{ col: 8, row: 5 }]));
    expect(result.current.stage).toBe('awaiting-plan');
    expect(result.current.plannedPath).toBeNull(); // cleared until the fresh reply lands
    expect(mockSendUpdate).toHaveBeenLastCalledWith('char-1', 'moveplan', expect.objectContaining({
      waypoints: [{ col: 8, row: 5 }],
    }));

    Date.now.mockRestore();
  });

  it('confirmPlannedMove sends moveconfirm with the planned path verbatim as waypoints', () => {
    const { result } = setup();
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });

    act(() => result.current.planMove([{ col: 6, row: 5 }]));
    const planTs = mockSendUpdate.mock.calls.find((c) => c[1] === 'moveplan')[2].ts;
    const path = [{ col: 6, row: 5, x: 600, y: 500 }];
    pushMovePlanned({ path, costFeet: 5, clipped: false, reqTs: planTs });

    act(() => result.current.confirmPlannedMove(1));

    expect(result.current.stage).toBe('awaiting-done');
    expect(mockSendUpdate).toHaveBeenCalledWith('char-1', 'moveconfirm', expect.objectContaining({
      waypoints: path, moveType: 'stride', actionCost: 1,
    }));
  });

  it('movedone after a planned confirm resolves the stage and clears the plan', () => {
    const onMoveDone = vi.fn();
    const { result } = setup({ onMoveDone });
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });

    act(() => result.current.planMove([{ col: 6, row: 5 }]));
    const planTs = mockSendUpdate.mock.calls.find((c) => c[1] === 'moveplan')[2].ts;
    pushMovePlanned({ path: [{ col: 6, row: 5 }], costFeet: 5, clipped: false, reqTs: planTs });
    act(() => result.current.confirmPlannedMove(1));

    pushMoveDone({ newPosition: { col: 6, row: 5 }, feetMoved: 5, reqTs: planTs });

    expect(result.current.stage).toBeNull();
    expect(result.current.plannedPath).toBeNull();
    expect(onMoveDone).toHaveBeenCalledWith(expect.objectContaining({ feetMoved: 5 }));
  });

  it('cancelPlan returns to picking and clears the plan without abandoning the sheet', () => {
    const { result } = setup();
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });

    act(() => result.current.planMove([{ col: 6, row: 5 }]));
    const planTs = mockSendUpdate.mock.calls.find((c) => c[1] === 'moveplan')[2].ts;
    pushMovePlanned({ path: [{ col: 6, row: 5 }], costFeet: 5, clipped: false, reqTs: planTs });
    expect(result.current.stage).toBe('planned');

    act(() => result.current.cancelPlan());

    expect(result.current.stage).toBe('picking');
    expect(result.current.plannedPath).toBeNull();
    expect(result.current.pickerOpts).not.toBeNull(); // sheet stays open, opts survive
  });

  it('cancelMove also clears any in-flight plan', () => {
    const { result } = setup();
    act(() => result.current.requestMove('stride'));
    const reqTs = mockSendUpdate.mock.calls[0][2].ts;
    pushMoveOpts({ origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 30, reqTs });

    act(() => result.current.planMove([{ col: 6, row: 5 }]));
    const planTs = mockSendUpdate.mock.calls.find((c) => c[1] === 'moveplan')[2].ts;
    pushMovePlanned({ path: [{ col: 6, row: 5 }], costFeet: 5, clipped: false, reqTs: planTs });

    act(() => result.current.cancelMove());

    expect(result.current.stage).toBeNull();
    expect(result.current.plannedPath).toBeNull();
    expect(result.current.pickerOpts).toBeNull();
  });
});
