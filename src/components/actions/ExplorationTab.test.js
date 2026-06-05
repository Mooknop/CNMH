import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ExplorationTab from './ExplorationTab';

let mockMode = 'exploration';
let mockMoveEnabled = true;
jest.mock('../../hooks/usePlayMode', () => ({
  usePlayMode: () => ({ mode: mockMode, moveEnabled: mockMoveEnabled }),
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
  mockMode = 'exploration';
  mockMoveEnabled = true;
});

describe('ExplorationTab', () => {
  it('shows downtime placeholder when mode is downtime', () => {
    mockMode = 'downtime';
    render(<ExplorationTab character={character} />);
    expect(screen.getByText('Downtime')).toBeInTheDocument();
    expect(screen.getByText(/coming in a future update/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activity' })).not.toBeInTheDocument();
  });

  it('shows Activity and Movement subtab buttons in exploration mode', () => {
    render(<ExplorationTab character={character} />);
    expect(screen.getByRole('button', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Movement' })).toBeInTheDocument();
  });

  it('defaults to Activity subtab showing ExplorationList', () => {
    render(<ExplorationTab character={character} />);
    expect(screen.getByTestId('exploration-list')).toBeInTheDocument();
    expect(screen.queryByTestId('exploration-move')).not.toBeInTheDocument();
  });

  it('switches to Movement subtab showing ExplorationMove + ExplorationDoors when enabled', () => {
    render(<ExplorationTab character={character} />);
    fireEvent.click(screen.getByRole('button', { name: 'Movement' }));
    expect(screen.getByTestId('exploration-move')).toBeInTheDocument();
    expect(screen.getByTestId('exploration-doors')).toBeInTheDocument();
    expect(screen.queryByTestId('exploration-list')).not.toBeInTheDocument();
  });

  it('passes charId to ExplorationMove', () => {
    render(<ExplorationTab character={character} />);
    fireEvent.click(screen.getByRole('button', { name: 'Movement' }));
    expect(screen.getByTestId('exploration-move')).toHaveAttribute('data-charid', 'char-1');
  });

  it('shows disabled placeholder and hides both panels when movement is off', () => {
    mockMoveEnabled = false;
    render(<ExplorationTab character={character} />);
    fireEvent.click(screen.getByRole('button', { name: 'Movement' }));
    expect(screen.getByText(/movement is currently disabled by the gm/i)).toBeInTheDocument();
    expect(screen.queryByTestId('exploration-move')).not.toBeInTheDocument();
    expect(screen.queryByTestId('exploration-doors')).not.toBeInTheDocument();
  });

  it('Activity pill is aria-pressed when active', () => {
    render(<ExplorationTab character={character} />);
    expect(screen.getByRole('button', { name: 'Activity' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Movement' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Movement pill is aria-pressed after switching', () => {
    render(<ExplorationTab character={character} />);
    fireEvent.click(screen.getByRole('button', { name: 'Movement' }));
    expect(screen.getByRole('button', { name: 'Movement' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Activity' })).toHaveAttribute('aria-pressed', 'false');
  });
});
