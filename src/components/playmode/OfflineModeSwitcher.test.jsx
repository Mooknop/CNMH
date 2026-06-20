import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

let mockPlayMode;
vi.mock('../../hooks/usePlayMode', () => ({
  usePlayMode: () => mockPlayMode,
}));

// PlayModeBadge is rendered when live — stub it so we can assert the swap
// without pulling in its own usePlayMode call.
vi.mock('./PlayModeBadge', () => ({
  default: () => <span data-testid="play-mode-badge">badge</span>,
}));

import OfflineModeSwitcher from './OfflineModeSwitcher';

const base = {
  mode: 'exploration',
  sandbox: true,
  localMode: null,
  setLocalMode: vi.fn(),
};

beforeEach(() => {
  mockPlayMode = { ...base, setLocalMode: vi.fn() };
});

describe('OfflineModeSwitcher', () => {
  it('renders the read-only badge when live (not sandbox)', () => {
    mockPlayMode = { ...base, sandbox: false };
    render(<OfflineModeSwitcher />);
    expect(screen.getByTestId('play-mode-badge')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /sandbox play mode/i })).not.toBeInTheDocument();
  });

  it('renders the three interactive pills in the sandbox', () => {
    render(<OfflineModeSwitcher />);
    expect(screen.getByRole('button', { name: 'Exploration' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Encounter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Downtime' })).toBeInTheDocument();
  });

  it('marks the effective mode pill as pressed', () => {
    mockPlayMode = { ...base, mode: 'downtime' };
    render(<OfflineModeSwitcher />);
    expect(screen.getByRole('button', { name: 'Downtime' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Exploration' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls setLocalMode when a pill is clicked', () => {
    const setLocalMode = vi.fn();
    mockPlayMode = { ...base, setLocalMode };
    render(<OfflineModeSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: 'Encounter' }));
    expect(setLocalMode).toHaveBeenCalledWith('encounter');
  });

  it('shows a reset control only once a local mode is chosen', () => {
    const setLocalMode = vi.fn();
    mockPlayMode = { ...base, localMode: 'encounter', setLocalMode };
    render(<OfflineModeSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: /reset to the gm/i }));
    expect(setLocalMode).toHaveBeenCalledWith(null);
  });

  it('hides the reset control when following the GM mode', () => {
    mockPlayMode = { ...base, localMode: null };
    render(<OfflineModeSwitcher />);
    expect(screen.queryByRole('button', { name: /reset to the gm/i })).not.toBeInTheDocument();
  });
});
