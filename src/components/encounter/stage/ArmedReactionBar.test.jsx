import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ArmedReactionBar from './ArmedReactionBar';

let mockOptions;
vi.mock('../../../hooks/useReactionOptions', () => ({
  useReactionOptions: () => ({ options: mockOptions }),
}));

const declare = vi.fn();
const clear = vi.fn();
vi.mock('../../../hooks/useReactors', () => ({
  useReactors: () => ({ reactors: [], declare, clear }),
}));

vi.mock('../UseAbilityModal', () => ({
  __esModule: true,
  default: ({ ability, cost, verb, castSource, onClose }) => (
    <div data-testid="use-ability-modal">
      {verb} {ability.name} ({cost}{castSource ? ` from ${castSource}` : ''})
      <button onClick={onClose} aria-label="close modal">close</button>
    </div>
  ),
}));

const character = { id: 'p1', name: 'Kestrel' };

beforeEach(() => {
  mockOptions = [];
  declare.mockClear();
  clear.mockClear();
});

describe('ArmedReactionBar', () => {
  it('shows a quiet empty state when there are no reactions', () => {
    render(<ArmedReactionBar character={character} />);
    expect(screen.getByText('No reaction ready.')).toBeInTheDocument();
  });

  it('renders an armed reaction with its trigger text and opens the resolver on press', () => {
    mockOptions = [
      { reaction: { name: 'Nimble Dodge', trigger: 'A creature targets you.' }, castSource: undefined, live: true, liveReason: null },
    ];
    render(<ArmedReactionBar character={character} />);
    const btn = screen.getByRole('button', { name: 'Use Nimble Dodge' });
    expect(btn).toBeEnabled();
    expect(screen.getByText('A creature targets you.')).toBeInTheDocument();
    expect(screen.getByText('armed')).toBeInTheDocument();

    fireEvent.click(btn);
    expect(screen.getByTestId('use-ability-modal')).toHaveTextContent('Use Nimble Dodge (reaction)');
  });

  it('broadcasts the declaration on press and clears it when the resolver closes', () => {
    mockOptions = [
      { reaction: { name: 'Nimble Dodge' }, castSource: undefined, live: true, liveReason: null },
    ];
    render(<ArmedReactionBar character={character} />);

    fireEvent.click(screen.getByRole('button', { name: 'Use Nimble Dodge' }));
    expect(declare).toHaveBeenCalledWith('p1', 'Nimble Dodge');

    fireEvent.click(screen.getByLabelText('close modal'));
    expect(clear).toHaveBeenCalledWith('p1');
  });

  it('casts a staff reaction from the staff source', () => {
    mockOptions = [
      { reaction: { name: 'Overselling Flourish', fromStaff: true }, castSource: 'staff', live: true, liveReason: null },
    ];
    render(<ArmedReactionBar character={character} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use Overselling Flourish' }));
    expect(screen.getByTestId('use-ability-modal')).toHaveTextContent('Cast Overselling Flourish (reaction from staff)');
  });

  it('renders a blocked reaction disabled with its reason', () => {
    mockOptions = [
      { reaction: { name: 'Counterspell' }, castSource: 'focus', live: false, liveReason: 'No Focus Points remaining' },
    ];
    render(<ArmedReactionBar character={character} />);
    const btn = screen.getByRole('button', { name: 'Counterspell — No Focus Points remaining' });
    expect(btn).toBeDisabled();
    expect(screen.getByText('No Focus Points remaining')).toBeInTheDocument();
  });

  it('excludes Shield Block (it has its own damage-split bar elsewhere)', () => {
    mockOptions = [
      { reaction: { name: 'Shield Block' }, castSource: undefined, live: true, liveReason: null },
      { reaction: { name: 'Nimble Dodge' }, castSource: undefined, live: true, liveReason: null },
    ];
    render(<ArmedReactionBar character={character} />);
    expect(screen.queryByText('Shield Block')).toBeNull();
    expect(screen.getByRole('button', { name: 'Use Nimble Dodge' })).toBeInTheDocument();
  });
});
