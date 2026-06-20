import React from 'react';
import { render, screen } from '@testing-library/react';

let mockSession;
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => mockSession,
}));

import SyncStatus from './SyncStatus';

describe('SyncStatus', () => {
  it('shows the live badge when DO and Foundry are both connected', () => {
    mockSession = { connected: true, foundryConnected: true };
    render(<SyncStatus />);
    const badge = screen.getByText(/Live/);
    expect(badge).toHaveClass('sync-live');
    expect(badge).toHaveAttribute('data-state', 'live');
    // E2E specs wait on this attribute to know the relay subscription is live.
    expect(badge).toHaveAttribute('data-connected', 'true');
  });

  it('shows the sandbox badge when the DO is up but Foundry is disconnected', () => {
    mockSession = { connected: true, foundryConnected: false };
    render(<SyncStatus />);
    const badge = screen.getByText(/Sandbox/);
    expect(badge).toHaveClass('sync-sandbox');
    expect(badge).toHaveAttribute('data-state', 'sandbox');
    // Still DO-connected, so E2E's deterministic signal stays true.
    expect(badge).toHaveAttribute('data-connected', 'true');
  });

  it('shows the offline badge when the DO link is down', () => {
    mockSession = { connected: false, foundryConnected: false };
    render(<SyncStatus />);
    const badge = screen.getByText(/Offline/);
    expect(badge).toHaveClass('sync-offline');
    expect(badge).toHaveAttribute('data-state', 'offline');
    expect(badge).toHaveAttribute('data-connected', 'false');
  });

  it('treats a downed DO as offline even if a stale Foundry flag lingers', () => {
    mockSession = { connected: false, foundryConnected: true };
    render(<SyncStatus />);
    expect(screen.getByText(/Offline/)).toHaveAttribute('data-state', 'offline');
  });
});
