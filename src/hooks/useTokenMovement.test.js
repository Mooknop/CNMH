import { renderHook, act } from '@testing-library/react';

const mockSendUpdate = jest.fn();
jest.mock('../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate }),
}));

// Controllable synced state per key.
const syncedStates = {};
jest.mock('./useSyncedState', () => ({
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

beforeEach(() => {
  jest.clearAllMocks();
  delete syncedStates['cnmh_moveopts_char-1'];
  delete syncedStates['cnmh_movedone_char-1'];
  delete syncedStates['__setter_cnmh_moveopts_char-1'];
  delete syncedStates['__setter_cnmh_movedone_char-1'];
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
    const onMoveDone = jest.fn();
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
    jest.spyOn(Date, 'now').mockImplementation(() => tsCounter++);

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
});
