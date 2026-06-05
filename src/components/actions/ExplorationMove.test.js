import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExplorationMove from './ExplorationMove';

const mockPlayMode = {
  mode: 'exploration',
  moveEnabled: true,
};
jest.mock('../../hooks/usePlayMode', () => ({
  usePlayMode: () => mockPlayMode,
}));

const mockMovement = {
  stage: null,
  pickerOpts: null,
  isRefreshing: false,
  requestMove: jest.fn(),
  requestMoveRefresh: jest.fn(),
  confirmMove: jest.fn(),
  cancelMove: jest.fn(),
};
jest.mock('../../hooks/useTokenMovement', () => ({
  useTokenMovement: () => mockMovement,
}));

jest.mock('../encounter/MoveGridPicker', () =>
  function DummyMoveGridPicker({ onSelect, onCancel }) {
    return (
      <div data-testid="move-grid-picker">
        <button onClick={() => onSelect({ x: 100, y: 200 })}>Select Square</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  }
);

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayMode.mode = 'exploration';
  mockPlayMode.moveEnabled = true;
  mockMovement.stage = null;
  mockMovement.pickerOpts = null;
  mockMovement.isRefreshing = false;
});

describe('ExplorationMove', () => {
  it('renders nothing when mode is not exploration', () => {
    mockPlayMode.mode = 'encounter';
    const { container } = render(<ExplorationMove charId="char-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when moveEnabled is false', () => {
    mockPlayMode.moveEnabled = false;
    const { container } = render(<ExplorationMove charId="char-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows Move Token button when stage is null and not refreshing', () => {
    render(<ExplorationMove charId="char-1" />);
    expect(screen.getByRole('button', { name: 'Move Token' })).toBeInTheDocument();
  });

  it('calls requestMove with stride when Move Token clicked', () => {
    render(<ExplorationMove charId="char-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Token' }));
    expect(mockMovement.requestMove).toHaveBeenCalledWith('stride');
  });

  it('shows calculating status when stage is awaiting-opts', () => {
    mockMovement.stage = 'awaiting-opts';
    render(<ExplorationMove charId="char-1" />);
    expect(screen.getByText(/calculating reachable squares/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Token' })).not.toBeInTheDocument();
  });

  it('shows picker when stage is picking', () => {
    mockMovement.stage = 'picking';
    mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [], maxFeet: 30 };
    render(<ExplorationMove charId="char-1" />);
    expect(screen.getByTestId('move-grid-picker')).toBeInTheDocument();
  });

  it('calls confirmMove when a square is selected', () => {
    mockMovement.stage = 'picking';
    mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [], maxFeet: 30 };
    render(<ExplorationMove charId="char-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Square' }));
    expect(mockMovement.confirmMove).toHaveBeenCalledWith({ x: 100, y: 200 });
  });

  it('calls cancelMove when Cancel is clicked', () => {
    mockMovement.stage = 'picking';
    mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [], maxFeet: 30 };
    render(<ExplorationMove charId="char-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockMovement.cancelMove).toHaveBeenCalled();
  });

  it('shows Moving status when stage is awaiting-done', () => {
    mockMovement.stage = 'awaiting-done';
    render(<ExplorationMove charId="char-1" />);
    expect(screen.getByText(/moving/i)).toBeInTheDocument();
  });

  it('shows Updating overlay and picker while refreshing with opts', () => {
    mockMovement.stage = 'awaiting-opts';
    mockMovement.isRefreshing = true;
    mockMovement.pickerOpts = { origin: { x: 0, y: 0 }, reachable: [], blocked: [], maxFeet: 30 };
    render(<ExplorationMove charId="char-1" />);
    expect(screen.getByText(/updating/i)).toBeInTheDocument();
    expect(screen.getByTestId('move-grid-picker')).toBeInTheDocument();
  });
});
