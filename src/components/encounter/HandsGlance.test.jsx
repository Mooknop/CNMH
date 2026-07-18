import React from 'react';
import { render, screen, within } from '@testing-library/react';
import HandsGlance from './HandsGlance';

const mockUseCharacter = vi.fn();
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (...args) => mockUseCharacter(...args),
}));

const sword = { uid: 'h-0', name: 'Longsword', strikes: { type: 'melee' } };
const shield = { uid: 'h-1', name: 'Steel Shield', shield: { bonus: 2 } };
const greatsword = { uid: 'h-3', name: 'Greatsword', usage: 'held in 2 hands', strikes: { type: 'melee' } };

const model = (inventory) => ({ id: 'hero', name: 'Hero', inventory });
const character = { id: 'hero', name: 'Hero' };

describe('HandsGlance (read-only at-a-glance strip)', () => {
  it('shows a chip per held hand with its slot label', () => {
    mockUseCharacter.mockReturnValue(model([
      { ...sword, state: 'held1', hand: 1 },
      { ...shield, state: 'held1', hand: 2 },
    ]));
    render(<HandsGlance character={character} />);
    const strip = screen.getByRole('region', { name: 'Hands' });
    expect(within(strip).getByTestId('hands-glance-slot-1')).toHaveTextContent('Longsword');
    expect(within(strip).getByTestId('hands-glance-slot-1')).toHaveTextContent('Hand 1');
    expect(within(strip).getByTestId('hands-glance-slot-2')).toHaveTextContent('Steel Shield');
  });

  it('keeps a dashed Empty placeholder for an open hand', () => {
    mockUseCharacter.mockReturnValue(model([{ ...sword, state: 'held1', hand: 1 }]));
    render(<HandsGlance character={character} />);
    expect(screen.getByTestId('hands-glance-slot-2')).toHaveTextContent('Empty');
  });

  it('renders a two-handed grip as ONE spanning chip with the 2H badge', () => {
    mockUseCharacter.mockReturnValue(model([{ ...greatsword, state: 'held2' }]));
    render(<HandsGlance character={character} />);
    const both = screen.getByTestId('hands-glance-both');
    expect(both).toHaveTextContent('Greatsword');
    expect(both).toHaveTextContent('2H');
    expect(both).toHaveTextContent('Both hands');
    expect(screen.queryByTestId('hands-glance-slot-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hands-glance-slot-2')).not.toBeInTheDocument();
  });

  it('is read-only — no buttons on the strip', () => {
    mockUseCharacter.mockReturnValue(model([{ ...sword, state: 'held1', hand: 1 }]));
    render(<HandsGlance character={character} />);
    const strip = screen.getByRole('region', { name: 'Hands' });
    expect(within(strip).queryByRole('button')).not.toBeInTheDocument();
  });

  describe('strapped-shield badges (bucklers S3)', () => {
    const buckler = {
      uid: 'h-7', name: 'Buckler', state: 'worn', strapHand: 1,
      shield: { bonus: 1, strapped: true },
    };

    it('marks the strapped hand without occupying its slot', () => {
      mockUseCharacter.mockReturnValue(model([{ ...buckler, strapUsable: true }]));
      render(<HandsGlance character={character} />);
      // Slot stays Empty — the buckler rides the chip as a badge.
      expect(screen.getByTestId('hands-glance-slot-1')).toHaveTextContent('Empty');
      const badge = screen.getByTestId('hands-glance-strap-1');
      expect(badge).toHaveAttribute('title', 'Buckler strapped on');
      expect(badge).not.toHaveClass('hands-glance-strapbadge--blocked');
    });

    it('dims the badge when the strapped hand is tied up', () => {
      mockUseCharacter.mockReturnValue(model([
        { ...sword, state: 'held1', hand: 1 },
        { ...buckler, strapUsable: false },
      ]));
      render(<HandsGlance character={character} />);
      expect(screen.getByTestId('hands-glance-slot-1')).toHaveTextContent('Longsword');
      const badge = screen.getByTestId('hands-glance-strap-1');
      expect(badge).toHaveAttribute('title', 'Buckler strapped on — hand tied up');
      expect(badge).toHaveClass('hands-glance-strapbadge--blocked');
    });

    it('a two-handed grip shows the badge on the spanning chip', () => {
      mockUseCharacter.mockReturnValue(model([
        { ...greatsword, state: 'held2' },
        { ...buckler, strapUsable: false },
      ]));
      render(<HandsGlance character={character} />);
      expect(within(screen.getByTestId('hands-glance-both')).getByTestId('hands-glance-strap-1')).toBeInTheDocument();
    });
  });
});
