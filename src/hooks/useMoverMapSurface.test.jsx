import { act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { useMoverMapSurface } from './useMoverMapSurface';
import { RELAY } from '../sync/keys';
import { MOVE_SNAP_TIMEOUT_MS } from '../utils/snapshotRelay';

// useSyncedState mirrors every incoming update to REAL window.localStorage
// (see useSyncedState.jsx) — a stale snapdone from an earlier test would
// otherwise hydrate a brand-new hook instance and defeat the very
// broadcast-adoption behavior these tests are checking.
beforeEach(() => window.localStorage.clear());

const mountHook = (initialProps) => renderHookWithProviders(
  ({ charId, active, radiusFeet }) => useMoverMapSurface(charId, { active, radiusFeet }),
  {
    session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol: 16 } } } },
    initialProps,
  }
);

const sentOf = (session, key) => session.sent.filter((m) => m.stateType === key).at(-1);

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

describe('useMoverMapSurface (#1744 S4)', () => {
  it('does nothing while inactive', () => {
    const { session } = mountHook({ charId: 'Pellias', active: false });
    expect(sentOf(session, RELAY.SNAPREQ)).toBeUndefined();
  });

  it('sends a mover-centered snapreq on entering active, then adopts the correlated reply', async () => {
    const { result, rerender, session } = mountHook({ charId: 'Pellias', active: false });
    rerender({ charId: 'Pellias', active: true, radiusFeet: 37.5 });

    expect(result.current.status).toBe('loading');
    const req = sentOf(session, RELAY.SNAPREQ);
    expect(req.characterId).toBe('global');
    expect(req.value).toMatchObject({ moverId: 'Pellias', radiusFeet: 37.5 });

    await act(async () => { session.push('global', RELAY.SNAPDONE, ackFor(req.value.id)); });
    expect(result.current.status).toBe('ready');
    expect(result.current.snapshot.url).toBe('/api/images/mover.webp');
  });

  it('omits radiusFeet when the caller has no known speed yet', () => {
    const { rerender, session } = mountHook({ charId: 'Pellias', active: false });
    rerender({ charId: 'Pellias', active: true });
    const req = sentOf(session, RELAY.SNAPREQ);
    expect(req.value).not.toHaveProperty('radiusFeet');
  });

  it('does not re-request while active stays true across rerenders', () => {
    const { rerender, session } = mountHook({ charId: 'Pellias', active: true });
    rerender({ charId: 'Pellias', active: true });
    rerender({ charId: 'Pellias', active: true });
    expect(session.sent.filter((m) => m.stateType === RELAY.SNAPREQ)).toHaveLength(1);
  });

  it('a fresh entry (leaving then returning to map mode) sends a fresh request', async () => {
    const { rerender, session } = mountHook({ charId: 'Pellias', active: false });
    await act(async () => rerender({ charId: 'Pellias', active: true }));
    await act(async () => rerender({ charId: 'Pellias', active: false }));
    await act(async () => rerender({ charId: 'Pellias', active: true }));
    expect(session.sent.filter((m) => m.stateType === RELAY.SNAPREQ)).toHaveLength(2);
  });

  it('resolves unavailable on an explicit nack', async () => {
    const { result, rerender, session } = mountHook({ charId: 'Pellias', active: false });
    rerender({ charId: 'Pellias', active: true });
    const req = sentOf(session, RELAY.SNAPREQ);

    await act(async () => { session.push('global', RELAY.SNAPDONE, { id: req.value.id, ok: false, ts: Date.now() }); });
    expect(result.current.status).toBe('unavailable');
    expect(result.current.snapshot).toBeNull();
  });

  it('falls back to unavailable on a reply timeout — never strands the caller', async () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = mountHook({ charId: 'Pellias', active: false });
      rerender({ charId: 'Pellias', active: true });
      expect(result.current.status).toBe('loading');

      await act(async () => { await vi.advanceTimersByTimeAsync(MOVE_SNAP_TIMEOUT_MS + 1); });
      expect(result.current.status).toBe('unavailable');
    } finally {
      vi.useRealTimers();
    }
  });

  it('adopts an unsolicited post-movedone broadcast for this mover without a matching request id', async () => {
    const { result, rerender, session } = mountHook({ charId: 'Pellias', active: false });
    rerender({ charId: 'Pellias', active: true });
    const req = sentOf(session, RELAY.SNAPREQ);
    await act(async () => { session.push('global', RELAY.SNAPDONE, ackFor(req.value.id)); });
    expect(result.current.status).toBe('ready');

    // The bridge's own post-movedone rebroadcast carries a DIFFERENT id (no
    // app request correlates to it) but names the same mover.
    await act(async () => {
      session.push('global', RELAY.SNAPDONE, ackFor('snap-bridge-broadcast', {
        url: '/api/images/recentered.webp', trigger: 'movedone',
      }));
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.snapshot.url).toBe('/api/images/recentered.webp');
  });

  it('ignores a broadcast for a different mover while still awaiting our own reply', async () => {
    const { result, session } = mountHook({ charId: 'Pellias', active: true });

    // A different request id naming a DIFFERENT mover — the broadcast-adoption
    // path must not touch our still-pending state (it isn't our reply, by id
    // OR by mover).
    await act(async () => {
      session.push('global', RELAY.SNAPDONE, ackFor('snap-someone-elses-request', { moverId: 'SomeoneElse' }));
    });
    expect(result.current.status).toBe('loading');
    expect(result.current.snapshot).toBeNull();
  });
});
