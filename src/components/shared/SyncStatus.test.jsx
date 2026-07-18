import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { RELAY } from '../../sync/keys';
import SyncStatus from './SyncStatus';

// A current-protocol bridge hello (#1310) — seeded as session state so the
// live case models a healthy, handshaking bridge.
const hello = (protocol = 1) => ({ protocol, module: '1.9.0', ts: Date.now() });

const renderStatus = ({ connected, foundryConnected, bridgehello, pendingWrites } = {}) =>
  renderWithProviders(<SyncStatus />, {
    session: {
      connected,
      foundryConnected,
      pendingWrites,
      ...(bridgehello ? { state: { global: { [RELAY.BRIDGEHELLO]: bridgehello } } } : {}),
    },
  });

beforeEach(() => window.localStorage.clear());

describe('SyncStatus', () => {
  it('shows the live badge when DO and a current bridge are both connected', () => {
    renderStatus({ connected: true, foundryConnected: true, bridgehello: hello() });
    const badge = screen.getByText(/Live/);
    expect(badge).toHaveClass('sync-live');
    expect(badge).toHaveAttribute('data-state', 'live');
    // E2E specs wait on this attribute to know the relay subscription is live.
    expect(badge).toHaveAttribute('data-connected', 'true');
  });

  it('shows the sandbox badge when the DO is up but Foundry is disconnected', () => {
    renderStatus({ connected: true, foundryConnected: false });
    const badge = screen.getByText(/Sandbox/);
    expect(badge).toHaveClass('sync-sandbox');
    expect(badge).toHaveAttribute('data-state', 'sandbox');
    // Still DO-connected, so E2E's deterministic signal stays true.
    expect(badge).toHaveAttribute('data-connected', 'true');
  });

  it('shows the offline badge when the DO link is down', () => {
    renderStatus({ connected: false, foundryConnected: false });
    const badge = screen.getByText(/Offline/);
    expect(badge).toHaveClass('sync-offline');
    expect(badge).toHaveAttribute('data-state', 'offline');
    expect(badge).toHaveAttribute('data-connected', 'false');
  });

  it('treats a downed DO as offline even if a stale Foundry flag lingers', () => {
    renderStatus({ connected: false, foundryConnected: true });
    expect(screen.getByText(/Offline/)).toHaveAttribute('data-state', 'offline');
  });

  it('shows the reconnecting badge when the link is down with writes queued', () => {
    // A player mid-action during a reconnect window should see their change is
    // held (SessionContext queues and flushes it), not silently lost.
    renderStatus({ connected: false, foundryConnected: false, pendingWrites: 2 });
    const badge = screen.getByText(/Reconnecting/);
    expect(badge).toHaveClass('sync-pending');
    expect(badge).toHaveAttribute('data-state', 'pending');
    expect(badge).toHaveAttribute('data-connected', 'false');
  });

  it('warns when a connected bridge never said hello (pre-handshake module, #1310)', () => {
    renderStatus({ connected: true, foundryConnected: true });
    const badge = screen.getByText(/Bridge outdated/);
    expect(badge).toHaveClass('sync-stale');
    expect(badge).toHaveAttribute('data-state', 'stale');
    expect(badge).toHaveAttribute('data-connected', 'true');
  });

  it('warns when the announced protocol predates the app minimum', () => {
    renderStatus({ connected: true, foundryConnected: true, bridgehello: hello(0) });
    expect(screen.getByText(/Bridge outdated/)).toHaveAttribute('data-state', 'stale');
  });

  it('an old hello never warns while Foundry is offline (sandbox wins)', () => {
    renderStatus({ connected: true, foundryConnected: false, bridgehello: hello(0) });
    expect(screen.getByText(/Sandbox/)).toHaveAttribute('data-state', 'sandbox');
  });
});
