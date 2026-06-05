import React from 'react';
import { render, screen } from '@testing-library/react';
import PlayModeBadge from './PlayModeBadge';

let mockMode = 'exploration';
jest.mock('../../hooks/usePlayMode', () => ({
  usePlayMode: () => ({ mode: mockMode }),
}));

beforeEach(() => {
  mockMode = 'exploration';
});

describe('PlayModeBadge', () => {
  it('shows Exploration label in exploration mode', () => {
    mockMode = 'exploration';
    render(<PlayModeBadge />);
    expect(screen.getByText('Exploration')).toBeInTheDocument();
    expect(screen.getByLabelText('Play mode: Exploration')).toBeInTheDocument();
  });

  it('shows Encounter label in encounter mode', () => {
    mockMode = 'encounter';
    render(<PlayModeBadge />);
    expect(screen.getByText('Encounter')).toBeInTheDocument();
    expect(screen.getByLabelText('Play mode: Encounter')).toBeInTheDocument();
  });

  it('shows Downtime label in downtime mode', () => {
    mockMode = 'downtime';
    render(<PlayModeBadge />);
    expect(screen.getByText('Downtime')).toBeInTheDocument();
  });

  it('applies mode-specific CSS class', () => {
    mockMode = 'encounter';
    const { container } = render(<PlayModeBadge />);
    expect(container.firstChild).toHaveClass('play-mode-badge--encounter');
  });
});
