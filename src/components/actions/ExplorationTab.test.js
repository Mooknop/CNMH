import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExplorationTab from './ExplorationTab';

let mockMode = 'exploration';
let mockMoveEnabled = true;
jest.mock('../../hooks/usePlayMode', () => ({
  usePlayMode: () => ({ mode: mockMode, moveEnabled: mockMoveEnabled }),
}));

let mockReady = false;
jest.mock('../../hooks/useExplorationReady', () => ({
  useExplorationReady: () => ({ ready: mockReady }),
}));

const mockSetOwnActivity = jest.fn();
jest.mock('../../hooks/useSyncedState', () => ({
  __esModule: true,
  useSyncedState: () => [null, mockSetOwnActivity],
}));

jest.mock('./ExplorationList', () =>
  function DummyExplorationList() {
    return <div data-testid="exploration-list" />;
  }
);

jest.mock('./ExplorationMove', () =>
  function DummyExplorationMove({ charId }) {
    return <div data-testid="exploration-move" data-charid={charId} />;
  }
);

jest.mock('./ExplorationDoors', () =>
  function DummyExplorationDoors({ charId }) {
    return <div data-testid="exploration-doors" data-charid={charId} />;
  }
);

const character = { id: 'char-1', name: 'Pellias' };

beforeEach(() => {
  jest.clearAllMocks();
  mockMode = 'exploration';
  mockMoveEnabled = true;
  mockReady = false;
});

describe('ExplorationTab', () => {
  it('shows downtime placeholder when mode is downtime', () => {
    mockMode = 'downtime';
    render(<ExplorationTab character={character} />);
    expect(screen.getByText('Downtime')).toBeInTheDocument();
    expect(screen.getByText(/coming in a future update/i)).toBeInTheDocument();
  });

  describe('Activity state (party not ready)', () => {
    it('shows the Activity picker and a waiting hint', () => {
      render(<ExplorationTab character={character} />);
      expect(screen.getByTestId('exploration-list')).toBeInTheDocument();
      expect(screen.getByText(/waiting for the party/i)).toBeInTheDocument();
    });

    it('does not show Movement controls or the change-activity toggle', () => {
      render(<ExplorationTab character={character} />);
      expect(screen.queryByTestId('exploration-move')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /change activity/i })).not.toBeInTheDocument();
    });
  });

  describe('Movement state (party ready)', () => {
    beforeEach(() => {
      mockReady = true;
    });

    it('shows Movement controls by default with no waiting hint', () => {
      render(<ExplorationTab character={character} />);
      expect(screen.getByTestId('exploration-move')).toBeInTheDocument();
      expect(screen.getByTestId('exploration-doors')).toBeInTheDocument();
      expect(screen.queryByTestId('exploration-list')).not.toBeInTheDocument();
      expect(screen.queryByText(/waiting for the party/i)).not.toBeInTheDocument();
    });

    it('passes charId to ExplorationMove', () => {
      render(<ExplorationTab character={character} />);
      expect(screen.getByTestId('exploration-move')).toHaveAttribute('data-charid', 'char-1');
    });

    it('shows the disabled placeholder when movement is off', () => {
      mockMoveEnabled = false;
      render(<ExplorationTab character={character} />);
      expect(screen.getByText(/movement is currently disabled by the gm/i)).toBeInTheDocument();
      expect(screen.queryByTestId('exploration-move')).not.toBeInTheDocument();
    });

    it('lets the player peek at the Activity picker and back, just for themselves', () => {
      render(<ExplorationTab character={character} />);
      // Default: movement shown
      expect(screen.getByTestId('exploration-move')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /change activity/i }));
      expect(screen.getByTestId('exploration-list')).toBeInTheDocument();
      expect(screen.queryByTestId('exploration-move')).not.toBeInTheDocument();
      // No waiting hint when ready — peeking is a personal choice
      expect(screen.queryByText(/waiting for the party/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /back to movement/i }));
      expect(screen.getByTestId('exploration-move')).toBeInTheDocument();
    });
  });
});
