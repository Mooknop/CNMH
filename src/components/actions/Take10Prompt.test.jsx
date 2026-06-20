import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockSetReady = vi.fn();
let mockState = {};
vi.mock('../../hooks/useTake10', () => ({
  __esModule: true,
  useTake10: () => mockState,
}));

import Take10Prompt from './Take10Prompt';

const character = { id: 'a', name: 'Ari' };

beforeEach(() => {
  mockSetReady.mockClear();
  mockState = {
    active: true,
    minutes: 10,
    ready: false,
    setReady: mockSetReady,
    readyCount: 1,
    ids: ['a', 'b', 'c'],
  };
});

describe('Take10Prompt', () => {
  it('renders nothing when no Take 10 is active', () => {
    mockState.active = false;
    const { container } = render(<Take10Prompt character={character} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the block length and ready count', () => {
    render(<Take10Prompt character={character} />);
    expect(screen.getByText('10 min')).toBeInTheDocument();
    expect(screen.getByText('1 / 3 ready')).toBeInTheDocument();
  });

  it('toggles readiness on click', () => {
    render(<Take10Prompt character={character} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    expect(mockSetReady).toHaveBeenCalledWith(true);
  });

  it('reflects a ready state', () => {
    mockState.ready = true;
    render(<Take10Prompt character={character} />);
    const btn = screen.getByRole('button', { name: /Ready/ });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveTextContent('✓ Ready');
  });
});
