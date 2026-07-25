import React from 'react';
import { screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, makeCharacter } from '../../test/renderWithProviders';
import PingTheMap from './PingTheMap';
import { RELAY } from '../../sync/keys';
import { SNAP_TIMEOUT_MS } from '../../utils/snapshotRelay';

const AMIRI = makeCharacter({ id: 'pc-amiri', name: 'Amiri' });

// A snapdone ack: 2x zoom, viewport origin at world (200, 100).
const CAPTURE = {
  a: 2, b: 0, c: 0, d: 2, tx: -400, ty: -200, screenW: 1200, screenH: 800, sceneId: 'scene-1',
};
const ackFor = (id, overrides = {}) => ({
  id,
  ok: true,
  url: '/api/images/snap.webp',
  capture: CAPTURE,
  worldRect: { x1: 200, y1: 100, x2: 800, y2: 500 },
  gridSize: 100,
  ts: Date.now(),
  ...overrides,
});

const mount = (protocol = 12) => {
  const utils = renderWithProviders(<PingTheMap character={AMIRI} />, {
    session: { state: { global: { [RELAY.BRIDGEHELLO]: { protocol } } } },
  });
  return utils;
};

const sentOf = (session, key) => session.sent.filter((m) => m.stateType === key).at(-1);

// Open the sheet and answer the capture request with a snapshot.
const openWithSnapshot = async (session, ack = null) => {
  fireEvent.click(screen.getByRole('button', { name: 'Ping the map' }));
  const req = sentOf(session, RELAY.SNAPREQ);
  await act(async () => {
    session.push('global', RELAY.SNAPDONE, ack ?? ackFor(req.value.id));
  });
  return req;
};

// Modal portals into document.body, so the viewer lives outside `container`.
const snapshotImg = () => document.querySelector('.msv-img');

// Tap the rendered snapshot at a normalized position.
const tapAt = (nx, ny) => {
  const img = snapshotImg();
  img.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 });
  const frame = screen.getByTestId('map-snapshot-frame');
  fireEvent.pointerDown(frame, { pointerId: 1, clientX: nx * 100, clientY: ny * 100 });
  fireEvent.pointerUp(frame, { pointerId: 1, clientX: nx * 100, clientY: ny * 100 });
};

describe('PingTheMap (#1573 B2)', () => {
  it('requests a snapshot, then a tap + confirm pings the resolved WORLD point', async () => {
    const { session } = mount();
    await openWithSnapshot(session);

    expect(sentOf(session, RELAY.SNAPREQ).characterId).toBe('global');
    expect(snapshotImg()).toHaveAttribute('src', '/api/images/snap.webp');

    // Centre tap → capture-space (600, 400) → world (500, 300) through the
    // inverse of the 2x/-400/-200 matrix.
    tapAt(0.5, 0.5);
    fireEvent.click(screen.getByRole('button', { name: 'Ping here' }));

    const ping = sentOf(session, RELAY.PINGPOINT);
    expect(ping.characterId).toBe('global');
    expect(ping.value).toMatchObject({ x: 500, y: 300, sceneId: 'scene-1', name: 'Amiri' });
    expect(screen.getByText(/Ping sent/)).toBeInTheDocument();
  });

  it('the confirm button waits for a tap and disarms after pinging', async () => {
    const { session } = mount();
    await openWithSnapshot(session);

    expect(screen.getByRole('button', { name: 'Ping here' })).toBeDisabled();
    tapAt(0.25, 0.25);
    expect(screen.getByRole('button', { name: 'Ping here' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Ping here' }));
    expect(screen.getByRole('button', { name: 'Pinged ✓' })).toBeDisabled();
  });

  it('a nack offers a retry instead of a dead sheet', async () => {
    const { session } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ping the map' }));
    const first = sentOf(session, RELAY.SNAPREQ);
    await act(async () => {
      session.push('global', RELAY.SNAPDONE, { id: first.value.id, ok: false, ts: Date.now() });
    });

    expect(screen.getByText(/No snapshot came back/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // A fresh request with a NEW id goes out; answering it shows the map.
    const second = sentOf(session, RELAY.SNAPREQ);
    expect(second.value.id).not.toBe(first.value.id);
    await act(async () => { session.push('global', RELAY.SNAPDONE, ackFor(second.value.id)); });
    expect(screen.queryByText(/No snapshot came back/)).not.toBeInTheDocument();
  });

  it('a timeout without an ack falls back to the retry state', async () => {
    vi.useFakeTimers();
    try {
      const { session } = mount();
      fireEvent.click(screen.getByRole('button', { name: 'Ping the map' }));
      expect(sentOf(session, RELAY.SNAPREQ)).toBeTruthy();
      expect(screen.getByText(/Asking the GM screen/)).toBeInTheDocument();

      await act(async () => { await vi.advanceTimersByTimeAsync(SNAP_TIMEOUT_MS + 1); });
      expect(screen.getByText(/No snapshot came back/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a stale ack for a different request id is ignored', async () => {
    const { session } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Ping the map' }));
    await act(async () => {
      session.push('global', RELAY.SNAPDONE, ackFor('snap-someone-else'));
    });
    // Still waiting on OUR ack — no map, no failure state.
    expect(screen.getByText(/Asking the GM screen/)).toBeInTheDocument();
  });

  it('self-hides when the bridge predates the ping channel', () => {
    mount(11);
    expect(screen.queryByRole('button', { name: 'Ping the map' })).not.toBeInTheDocument();
  });

  it('self-hides when Foundry is not connected', () => {
    renderWithProviders(<PingTheMap character={AMIRI} />, {
      session: {
        state: { global: { [RELAY.BRIDGEHELLO]: { protocol: 12 } } },
        foundryConnected: false,
      },
    });
    expect(screen.queryByRole('button', { name: 'Ping the map' })).not.toBeInTheDocument();
  });
});
