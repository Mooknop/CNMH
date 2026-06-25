import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ReputationModal from './ReputationModal';

const mockFaction = {
  name: 'Pathfinder Society',
  reputation: 15,
  ranks: [
    { name: 'Hostile', min: -100, max: -1, effect: 'They attack on sight.' },
    { name: 'Neutral', min: 0, max: 19, effect: 'No special treatment.' },
    { name: 'Friendly', min: 20, max: 49, effect: 'Discounts on services.' },
    { name: 'Allied', min: 50, max: 100, effect: 'Full support.' },
  ],
};

describe('ReputationModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ReputationModal isOpen={false} onClose={() => {}} faction={mockFaction} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when faction is null', () => {
    const { container } = render(
      <ReputationModal isOpen={true} onClose={() => {}} faction={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders faction name', () => {
    render(<ReputationModal isOpen={true} onClose={() => {}} faction={mockFaction} />);
    expect(screen.getByText('Pathfinder Society')).toBeInTheDocument();
  });

  it('displays the reputation score', () => {
    render(<ReputationModal isOpen={true} onClose={() => {}} faction={mockFaction} />);
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('shows current standing based on reputation', () => {
    render(<ReputationModal isOpen={true} onClose={() => {}} faction={mockFaction} />);
    expect(screen.getByText('Neutral')).toBeInTheDocument();
  });

  it('shows effect when rank has an effect', () => {
    const friendlyFaction = { ...mockFaction, reputation: 30 };
    render(<ReputationModal isOpen={true} onClose={() => {}} faction={friendlyFaction} />);
    expect(screen.getByText('Discounts on services.')).toBeInTheDocument();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(
      <ReputationModal isOpen={true} onClose={onClose} faction={mockFaction} />
    );
    fireEvent.click(document.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ReputationModal isOpen={true} onClose={onClose} faction={mockFaction} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalled();
  });
});
