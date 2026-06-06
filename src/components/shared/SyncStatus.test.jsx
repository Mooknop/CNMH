import React from 'react';
import { render, screen } from '@testing-library/react';

let mockConnected;
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ connected: mockConnected }),
}));

import SyncStatus from './SyncStatus';

describe('SyncStatus', () => {
  it('shows the live badge when connected', () => {
    mockConnected = true;
    render(<SyncStatus />);
    const badge = screen.getByText(/Live/);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('sync-live');
  });

  it('shows the offline badge when disconnected', () => {
    mockConnected = false;
    render(<SyncStatus />);
    const badge = screen.getByText(/Offline/);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('sync-offline');
  });
});
