import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same shared-store mock MoveActionSheet.test.jsx uses, extended with a
// configurable `foundryConnected` so useSceneSnapshot's `available` gate can
// actually flip true — map mode needs a live capture round trip to test.
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

let foundryConnected = true;
const mockSendUpdate = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate, foundryConnected }),
}));

import { __reset, useSyncedState } from '../../hooks/useSyncedState';
import MoveActionSheet from './MoveActionSheet';
import { MOVE_SNAP_TIMEOUT_MS } from '../../utils/snapshotRelay';

const character = { id: 'Pellias', name: 'Pellias' };

const SyncDriver = ({ skey, onReady }) => {
  const [, set] = useSyncedState(skey, null);
  React.useEffect(() => { onReady(set); }, [set, onReady]);
  return null;
};

// Identity 800x600 capture over a 100 ft grid — a tap at (nx,ny) resolves
// straight to world (nx*800, ny*600), no matrix math to second-guess.
const ackFor = (id, overrides = {}) => ({
  id,
  ok: true,
  url: '/api/images/mover.webp',
  capture: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 800, screenH: 600, sceneId: 'scene-1' },
  worldRect: { x1: 0, y1: 0, x2: 800, y2: 600 },
  gridSize: 100,
  moverId: 'Pellias',
  trigger: 'request',
  ts: Date.now(),
  ...overrides,
});

const lastSent = (type) => mockSendUpdate.mock.calls.filter((c) => c[1] === type).at(-1);

const openMapFlow = (setHello, setOpts, { protocol = 16, speed = 10 } = {}) => {
  act(() => setHello({ protocol, module: '0.0.0-test', ts: 1 }));
  act(() => setOpts({ reqTs: 555, origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed }));
};

// PingTheMap.test.jsx's tap mechanics: give the rendered image a known rect,
// then simulate a clean pointerdown/up pair on the gesture frame.
const tapMapAt = (nx, ny) => {
  const img = document.querySelector('.msv-img');
  img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 });
  const frame = screen.getByTestId('map-snapshot-frame');
  fireEvent.pointerDown(frame, { pointerId: 1, clientX: nx * 100, clientY: ny * 100 });
  fireEvent.pointerUp(frame, { pointerId: 1, clientX: nx * 100, clientY: ny * 100 });
};

beforeEach(() => {
  __reset();
  mockSendUpdate.mockClear();
  foundryConnected = true;
  window.localStorage.clear();
});

describe('MoveActionSheet — map mode (#1744 S4)', () => {
  it('hides the surface toggle below the map-move protocol floor', () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let setHello, setOpts;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    openMapFlow(setHello, setOpts, { protocol: 15 });
    expect(screen.queryByRole('group', { name: 'Movement surface' })).toBeNull();
    Date.now.mockRestore();
  });

  it('shows the toggle at protocol 16, grid selected by default', () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let setHello, setOpts;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    openMapFlow(setHello, setOpts);
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'false');
    // The grid is still what's rendered.
    expect(screen.queryByAltText('Battlefield snapshot')).toBeNull();
    Date.now.mockRestore();
  });

  it('switching to Map sends a mover-centered snapreq, shows a loading note, then the snapshot', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let setHello, setOpts, setSnapdone;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_snapdone_global" onReady={(s) => (setSnapdone = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    openMapFlow(setHello, setOpts, { speed: 20 });

    fireEvent.click(screen.getByRole('button', { name: 'Map' }));

    const req = lastSent('snapreq');
    expect(req[0]).toBe('global');
    expect(req[2]).toMatchObject({ moverId: 'Pellias', radiusFeet: 30 }); // 1.5 × 20 ft speed
    expect(screen.getByText('Loading map…')).toBeInTheDocument();

    await act(async () => { setSnapdone(ackFor(req[2].id)); });

    expect(screen.getByAltText('Battlefield snapshot')).toHaveAttribute('src', '/api/images/mover.webp');
    expect(screen.queryByText('Loading map…')).toBeNull();
    Date.now.mockRestore();
  });

  it('a map tap resolves the real world cell and plans a move exactly like the grid', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let setHello, setOpts, setSnapdone, setPlanned;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_snapdone_global" onReady={(s) => (setSnapdone = s)} />
        <SyncDriver skey="cnmh_moveplanned_Pellias" onReady={(s) => (setPlanned = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    openMapFlow(setHello, setOpts);
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    const req = lastSent('snapreq');
    await act(async () => { setSnapdone(ackFor(req[2].id)); });

    // Tap the centre: world (400, 300) → cell (4, 3) on a 100 ft grid.
    tapMapAt(0.5, 0.5);
    expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', 'moveplan', expect.objectContaining({
      waypoints: [{ col: 4, row: 3 }], moveType: 'stride',
    }));

    act(() => setPlanned({ reqTs: 555, path: [{ col: 4, row: 3, x: 400, y: 300 }], costFeet: 5, clipped: false }));
    expect(screen.getByLabelText('Confirm move')).toHaveTextContent('5 ft');
    Date.now.mockRestore();
  });

  it('confirming a map-mode plan spends actions, sends waypoints, and closes on movedone — same as grid mode', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    const onClose = vi.fn();
    let setHello, setOpts, setSnapdone, setPlanned, setDone;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_snapdone_global" onReady={(s) => (setSnapdone = s)} />
        <SyncDriver skey="cnmh_moveplanned_Pellias" onReady={(s) => (setPlanned = s)} />
        <SyncDriver skey="cnmh_movedone_Pellias" onReady={(s) => (setDone = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={onClose} />
      </>
    );
    openMapFlow(setHello, setOpts);
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    const req = lastSent('snapreq');
    await act(async () => { setSnapdone(ackFor(req[2].id)); });

    tapMapAt(0.5, 0.5);
    const planPath = [{ col: 4, row: 3, x: 400, y: 300 }];
    act(() => setPlanned({ reqTs: 555, path: planPath, costFeet: 5, clipped: false }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', 'moveconfirm', expect.objectContaining({
      waypoints: planPath, moveType: 'stride', actionCost: 1,
    }));

    act(() => setDone({ reqTs: 555, newPosition: { col: 4, row: 3 }, feetMoved: 5 }));
    expect(onClose).toHaveBeenCalled();
    Date.now.mockRestore();
  });

  it('draws the destination highlight on the snapshot once a plan comes back', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let setHello, setOpts, setSnapdone, setPlanned;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_snapdone_global" onReady={(s) => (setSnapdone = s)} />
        <SyncDriver skey="cnmh_moveplanned_Pellias" onReady={(s) => (setPlanned = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    openMapFlow(setHello, setOpts);
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    const req = lastSent('snapreq');
    await act(async () => { setSnapdone(ackFor(req[2].id)); });

    // The mover's own cell highlights as soon as the map is showing, before
    // any plan exists.
    expect(document.querySelector('.sro-origin')).not.toBeNull();
    expect(document.querySelector('.sro-dest')).toBeNull();

    tapMapAt(0.5, 0.5); // any tap moves the hook to 'awaiting-plan' so the reply below gets adopted
    act(() => setPlanned({ reqTs: 555, path: [{ col: 6, row: 5, x: 600, y: 500 }], costFeet: 5, clipped: false }));
    expect(document.querySelector('.sro-dest')).not.toBeNull();
    Date.now.mockRestore();
  });

  it('falls back to the grid on an explicit nack, without stranding the player', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let setHello, setOpts, setSnapdone;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_snapdone_global" onReady={(s) => (setSnapdone = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    openMapFlow(setHello, setOpts);
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    const req = lastSent('snapreq');

    await act(async () => { setSnapdone({ id: req[2].id, ok: false, ts: Date.now() }); });

    expect(screen.getByText('Map unavailable — using the grid.')).toBeInTheDocument();
    // The grid tap flow is still fully usable.
    expect(screen.getAllByLabelText(/Move to /).length).toBeGreaterThan(0);
    Date.now.mockRestore();
  });

  it('falls back to the grid on a reply timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(555);
    try {
      let setHello, setOpts;
      render(
        <>
          <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
          <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
          <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
        </>
      );
      act(() => setHello({ protocol: 16, module: '0.0.0-test', ts: 1 }));
      act(() => setOpts({ reqTs: 555, origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed: 10 }));
      fireEvent.click(screen.getByRole('button', { name: 'Map' }));

      expect(screen.getByText('Loading map…')).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(MOVE_SNAP_TIMEOUT_MS + 1); });
      expect(screen.getByText('Map unavailable — using the grid.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never sends a snapreq while the toggle stays on Grid', () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let setHello, setOpts;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    openMapFlow(setHello, setOpts);
    expect(lastSent('snapreq')).toBeUndefined();
    Date.now.mockRestore();
  });
});
