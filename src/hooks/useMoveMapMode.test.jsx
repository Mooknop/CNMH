import { act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { useMoveMapMode } from './useMoveMapMode';
import { RELAY } from '../sync/keys';
import { MOVE_SURFACE_PREF } from '../utils/movement';
import { setDevicePref } from './useDevicePref';

// Same localStorage-hygiene note as useMoverMapSurface.test.jsx — useSyncedState
// mirrors updates to REAL window.localStorage, and useDevicePref lives there too.
beforeEach(() => window.localStorage.clear());

const mountHook = (initialProps, sessionState = {}) => renderHookWithProviders(
  (props) => useMoveMapMode(props),
  {
    session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol: 16 }, ...sessionState } } },
    initialProps,
  }
);

const sentOf = (session, key) => session.sent.filter((m) => m.stateType === key).at(-1);

const snapAckFor = (id, overrides = {}) => ({
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
  path: [{ col: 2, row: 1 }],
  phase: 'move',
  source: 'foundry',
  ts: Date.now(),
  ...overrides,
});

describe('useMoveMapMode (#1744 S7 — shared wiring behind MoveMapSurface)', () => {
  it('defaults to the grid preference and mapEligible false below the protocol floor', () => {
    const { result } = renderHookWithProviders(
      (props) => useMoveMapMode(props),
      {
        session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol: 15 } } } },
        initialProps: { moverId: 'Pellias', tapFlowEligible: true, protocol: 15, ghostAudience: 'player' },
      }
    );
    expect(result.current.surfacePref).toBe('grid');
    expect(result.current.mapEligible).toBe(false);
    expect(result.current.useMapSurface).toBe(false);
  });

  it('mapEligible requires BOTH tapFlowEligible and the protocol-16 floor', () => {
    const { result, rerender } = mountHook({ moverId: 'Pellias', tapFlowEligible: false, protocol: 16, ghostAudience: 'player' });
    expect(result.current.mapEligible).toBe(false);

    rerender({ moverId: 'Pellias', tapFlowEligible: true, protocol: 16, ghostAudience: 'player' });
    expect(result.current.mapEligible).toBe(true);
  });

  it('reads the STORED device preference set by another map-mode surface (one shared key)', () => {
    setDevicePref(MOVE_SURFACE_PREF, 'map');
    const { result } = mountHook({ moverId: 'Pellias', tapFlowEligible: true, protocol: 16, ghostAudience: 'player' });
    expect(result.current.surfacePref).toBe('map');
    expect(result.current.useMapSurface).toBe(true);
  });

  it('setSurfacePref writes the shared device preference', () => {
    const { result } = mountHook({ moverId: 'Pellias', tapFlowEligible: true, protocol: 16, ghostAudience: 'player' });
    act(() => result.current.setSurfacePref('map'));
    expect(result.current.surfacePref).toBe('map');
  });

  it('sends a mover-centered snapreq keyed to moverId once the surface flips to map, 1.5x knownSpeed', () => {
    setDevicePref(MOVE_SURFACE_PREF, 'map');
    const { session } = mountHook({ moverId: 'cbt-gob', tapFlowEligible: true, protocol: 16, knownSpeed: 25, ghostAudience: 'gm' });
    const req = sentOf(session, RELAY.SNAPREQ);
    expect(req.characterId).toBe('global');
    expect(req.value).toMatchObject({ moverId: 'cbt-gob', radiusFeet: 37.5 });
  });

  it('never requests a snapshot while the surface stays on grid', () => {
    const { session } = mountHook({ moverId: 'Pellias', tapFlowEligible: true, protocol: 16, ghostAudience: 'player' });
    expect(sentOf(session, RELAY.SNAPREQ)).toBeUndefined();
  });

  it('resolves mapStatus/mapSnapshot off the correlated snapdone reply', async () => {
    setDevicePref(MOVE_SURFACE_PREF, 'map');
    const { result, session } = mountHook({ moverId: 'Pellias', tapFlowEligible: true, protocol: 16, ghostAudience: 'player' });
    expect(result.current.mapStatus).toBe('loading');
    const req = sentOf(session, RELAY.SNAPREQ);
    await act(async () => { session.push('global', RELAY.SNAPDONE, snapAckFor(req.value.id)); });
    expect(result.current.mapStatus).toBe('ready');
    expect(result.current.mapSnapshot.url).toBe('/api/images/mover.webp');
  });

  it('ghostEntries stays empty until the map surface has a ready snapshot', async () => {
    const { result } = mountHook(
      { moverId: 'Pellias', tapFlowEligible: true, protocol: 16, ghostAudience: 'player' },
      { [RELAY.PATHPREVIEW]: previewFor() },
    );
    expect(result.current.ghostEntries).toEqual([]);

    setDevicePref(MOVE_SURFACE_PREF, 'map');
    // Re-mount is simplest here — the preference read is a fresh subscription.
    const second = mountHook(
      { moverId: 'Pellias', tapFlowEligible: true, protocol: 16, ghostAudience: 'player' },
      { [RELAY.PATHPREVIEW]: previewFor() },
    );
    const req = sentOf(second.session, RELAY.SNAPREQ);
    await act(async () => { second.session.push('global', RELAY.SNAPDONE, snapAckFor(req.value.id)); });
    expect(second.result.current.ghostEntries.length).toBe(1);
  });

  it('excludes the viewer\'s own mover id from ghostEntries', async () => {
    setDevicePref(MOVE_SURFACE_PREF, 'map');
    const { result, session } = mountHook(
      { moverId: 'Pellias', tapFlowEligible: true, protocol: 16, ghostAudience: 'player' },
      { [RELAY.PATHPREVIEW]: previewFor({ tokenId: 'tok-pellias', id: 'Pellias' }) },
    );
    const req = sentOf(session, RELAY.SNAPREQ);
    await act(async () => { session.push('global', RELAY.SNAPDONE, snapAckFor(req.value.id)); });
    expect(result.current.ghostEntries).toEqual([]);
  });

  it('excludes a ghost on a different scene than the captured snapshot', async () => {
    setDevicePref(MOVE_SURFACE_PREF, 'map');
    const { result, session } = mountHook(
      { moverId: 'Pellias', tapFlowEligible: true, protocol: 16, ghostAudience: 'player' },
      { [RELAY.PATHPREVIEW]: previewFor({ sceneId: 'scene-elsewhere' }) },
    );
    const req = sentOf(session, RELAY.SNAPREQ);
    await act(async () => { session.push('global', RELAY.SNAPDONE, snapAckFor(req.value.id)); });
    expect(result.current.ghostEntries).toEqual([]);
  });

  it('reads the GM-unfiltered channel when ghostAudience is "gm"', async () => {
    setDevicePref(MOVE_SURFACE_PREF, 'map');
    const { result, session } = mountHook(
      { moverId: 'cbt-gob', tapFlowEligible: true, protocol: 16, ghostAudience: 'gm' },
      { [RELAY.PATHPREVIEWGM]: previewFor() },
    );
    const req = sentOf(session, RELAY.SNAPREQ);
    await act(async () => { session.push('global', RELAY.SNAPDONE, snapAckFor(req.value.id, { moverId: 'cbt-gob' })); });
    expect(result.current.ghostEntries.length).toBe(1);
  });
});
