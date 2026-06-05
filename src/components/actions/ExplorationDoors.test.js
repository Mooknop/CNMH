import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ExplorationDoors from './ExplorationDoors';

const mockSendUpdate = jest.fn();
jest.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate }),
}));

let mockDoorOpts = null;
jest.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (_key, init) => {
    const ReactLib = require('react');
    return ReactLib.useState(mockDoorOpts ?? init);
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockDoorOpts = null;
});

describe('ExplorationDoors', () => {
  it('sends doorreq on mount', () => {
    render(<ExplorationDoors charId="char-1" />);
    expect(mockSendUpdate).toHaveBeenCalledWith('char-1', 'doorreq', expect.objectContaining({ ts: expect.any(Number) }));
  });

  it('shows empty message when no doors detected', () => {
    mockDoorOpts = { doors: [] };
    render(<ExplorationDoors charId="char-1" />);
    expect(screen.getByText(/no doors detected/i)).toBeInTheDocument();
  });

  it('renders a closed door with Open button', () => {
    mockDoorOpts = { doors: [{ wallId: 'w1', state: 0, x: 100, y: 100 }] };
    render(<ExplorationDoors charId="char-1" />);
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  });

  it('renders an open door with Close button', () => {
    mockDoorOpts = { doors: [{ wallId: 'w1', state: 1, x: 100, y: 100 }] };
    render(<ExplorationDoors charId="char-1" />);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('renders a locked door with no action buttons', () => {
    mockDoorOpts = { doors: [{ wallId: 'w1', state: 2, x: 100, y: 100 }] };
    render(<ExplorationDoors charId="char-1" />);
    expect(screen.getByText('Locked')).toBeInTheDocument(); // state label
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('sends doorinteract open when Open clicked', () => {
    mockDoorOpts = { doors: [{ wallId: 'w1', state: 0, x: 100, y: 100 }] };
    render(<ExplorationDoors charId="char-1" />);
    mockSendUpdate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(mockSendUpdate).toHaveBeenCalledWith(
      'char-1', 'doorinteract',
      expect.objectContaining({ wallId: 'w1', op: 'open' })
    );
  });

  it('sends doorinteract close when Close clicked', () => {
    mockDoorOpts = { doors: [{ wallId: 'w1', state: 1, x: 100, y: 100 }] };
    render(<ExplorationDoors charId="char-1" />);
    mockSendUpdate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockSendUpdate).toHaveBeenCalledWith(
      'char-1', 'doorinteract',
      expect.objectContaining({ wallId: 'w1', op: 'close' })
    );
  });

  it('sends doorreq when Detect Doors clicked', () => {
    render(<ExplorationDoors charId="char-1" />);
    mockSendUpdate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Detect Doors' }));
    expect(mockSendUpdate).toHaveBeenCalledWith('char-1', 'doorreq', expect.any(Object));
  });

  it('sends doorreq when moveDoneTs changes', () => {
    const { rerender } = render(<ExplorationDoors charId="char-1" moveDoneTs={null} />);
    mockSendUpdate.mockClear();
    act(() => {
      rerender(<ExplorationDoors charId="char-1" moveDoneTs={12345} />);
    });
    expect(mockSendUpdate).toHaveBeenCalledWith('char-1', 'doorreq', expect.any(Object));
  });
});
