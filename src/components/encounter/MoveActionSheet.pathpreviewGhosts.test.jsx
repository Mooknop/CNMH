import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same shared-store mock MoveActionSheet.mapMode.test.jsx uses — real
// useEncounter/useBridgeStatus/usePathPreview run on top of it, only the
// wire transport (useSyncedState) and session context are stubbed.
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

const character = { id: 'Pellias', name: 'Pellias' };

const SyncDriver = ({ skey, onReady }) => {
  const [, set] = useSyncedState(skey, null);
  React.useEffect(() => { onReady(set); }, [set, onReady]);
  return null;
};

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

const previewFor = (overrides = {}) => ({
  tokenId: 'tok-goblin',
  id: 'e-goblin',
  name: 'Goblin Warrior',
  disposition: -1,
  sceneId: 'scene-1',
  origin: { col: 1, row: 1 },
  path: [{ col: 2, row: 1 }, { col: 3, row: 1 }],
  phase: 'move',
  source: 'foundry',
  ts: Date.now(),
  ...overrides,
});

const lastSent = (type) => mockSendUpdate.mock.calls.filter((c) => c[1] === type).at(-1);

const openMapFlow = (setHello, setOpts, { protocol = 16, speed = 10 } = {}) => {
  act(() => setHello({ protocol, module: '0.0.0-test', ts: 1 }));
  act(() => setOpts({ reqTs: 555, origin: { col: 5, row: 5 }, reachable: [], blocked: [], speed }));
};

const openMapMode = async ({ setHello, setOpts, setSnapdone, ...opts } = {}) => {
  openMapFlow(setHello, setOpts, opts);
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  const req = lastSent('snapreq');
  await act(async () => { setSnapdone(ackFor(req[2].id)); });
};

beforeEach(() => {
  __reset();
  mockSendUpdate.mockClear();
  foundryConnected = true;
  window.localStorage.clear();
});

describe('MoveActionSheet — pathpreview route ghosts on the map surface (#1744 S3/WS-4)', () => {
  it('draws another mover\'s route as a ghost, distinct from the viewer\'s own solid overlay', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let setHello, setOpts, setSnapdone, setPreview;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_snapdone_global" onReady={(s) => (setSnapdone = s)} />
        <SyncDriver skey="cnmh_pathpreview_global" onReady={(s) => (setPreview = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    await openMapMode({ setHello, setOpts, setSnapdone });

    expect(document.querySelectorAll('.sro--own').length).toBe(1);
    expect(document.querySelectorAll('.sro--ghost').length).toBe(0);

    act(() => setPreview(previewFor()));

    const ghosts = document.querySelectorAll('.sro--ghost');
    expect(ghosts.length).toBe(1);
    // The ghost route line renders — the geometry pipeline actually ran, not
    // just an empty shell.
    expect(ghosts[0].querySelector('.sro-line')).not.toBeNull();

    Date.now.mockRestore();
  });

  it('never shows the viewer\'s own mover as a ghost of itself', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let setHello, setOpts, setSnapdone, setPreview;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_snapdone_global" onReady={(s) => (setSnapdone = s)} />
        <SyncDriver skey="cnmh_pathpreview_global" onReady={(s) => (setPreview = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    await openMapMode({ setHello, setOpts, setSnapdone });

    act(() => setPreview(previewFor({ tokenId: 'tok-pellias', id: 'Pellias' })));

    expect(document.querySelectorAll('.sro--ghost').length).toBe(0);
    Date.now.mockRestore();
  });

  it('drops a ghost on a different scene than the captured snapshot', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let setHello, setOpts, setSnapdone, setPreview;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_snapdone_global" onReady={(s) => (setSnapdone = s)} />
        <SyncDriver skey="cnmh_pathpreview_global" onReady={(s) => (setPreview = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    await openMapMode({ setHello, setOpts, setSnapdone });

    act(() => setPreview(previewFor({ sceneId: 'scene-elsewhere' })));

    expect(document.querySelectorAll('.sro--ghost').length).toBe(0);
    Date.now.mockRestore();
  });

  it('renders no ghosts below the map-move protocol floor even with a live preview', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let setHello, setOpts, setPreview;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_pathpreview_global" onReady={(s) => (setPreview = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    // Below MAP_MOVE_PROTOCOL: no map surface toggle at all, so no snapshot,
    // so no overlay of any kind — the protocol floor governs both.
    openMapFlow(setHello, setOpts, { protocol: 15 });
    act(() => setPreview(previewFor()));

    expect(screen.queryByRole('group', { name: 'Movement surface' })).toBeNull();
    expect(document.querySelectorAll('.sro--ghost').length).toBe(0);
    Date.now.mockRestore();
  });

  it('stays on the grid surface without rendering any ghost overlay', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(555);
    let setHello, setOpts, setPreview;
    render(
      <>
        <SyncDriver skey="cnmh_bridgehello_global" onReady={(s) => (setHello = s)} />
        <SyncDriver skey="cnmh_moveopts_Pellias" onReady={(s) => (setOpts = s)} />
        <SyncDriver skey="cnmh_pathpreview_global" onReady={(s) => (setPreview = s)} />
        <MoveActionSheet character={character} moveType="stride" onClose={() => {}} />
      </>
    );
    openMapFlow(setHello, setOpts);
    act(() => setPreview(previewFor()));

    // Toggle exists (protocol 16) but stays on Grid by default — no snapshot
    // was ever requested, so there's nothing to overlay a ghost onto.
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelectorAll('.sro--ghost').length).toBe(0);
    Date.now.mockRestore();
  });
});
