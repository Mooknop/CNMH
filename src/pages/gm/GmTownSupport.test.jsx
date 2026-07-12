import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ formatGameDate: () => '7 Sarenith, 4725 AR' }),
}));

// Front the support map so toggles are observable.
let support = {};
const setSupport = vi.fn((id, on, earnedAt = null) => {
  if (on) support = { ...support, [id]: { earnedAt } };
  else {
    support = { ...support };
    delete support[id];
  }
});
vi.mock('../../hooks/useLocationSupport', () => ({
  useLocationSupport: () => ({ supported: support, setSupport }),
}));

import GmTownSupport from './GmTownSupport';

const renderPage = () =>
  render(
    <MemoryRouter>
      <GmTownSupport />
    </MemoryRouter>,
  );

beforeEach(() => {
  support = {};
  vi.clearAllMocks();
});

describe('GmTownSupport', () => {
  it('lists employers grouped by faction', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Town Support' })).toBeInTheDocument();
    // A faction heading and one of its employers.
    expect(screen.getByRole('heading', { name: 'Sandpoint Merchantile League' })).toBeInTheDocument();
    expect(screen.getByLabelText('The Rusty Dragon supports the party')).toBeInTheDocument();
  });

  it('shows a location level and its unlocked skills', () => {
    renderPage();
    const row = screen.getByLabelText('The Rusty Dragon supports the party').closest('li');
    expect(within(row).getByText('L5')).toBeInTheDocument();
    expect(within(row).getByText('Performance')).toBeInTheDocument();
  });

  it('surfaces a circumstance bonus tag', () => {
    renderPage();
    const row = screen.getByLabelText('The Rusty Dragon supports the party').closest('li');
    expect(within(row).getByText('+1 circumstance')).toBeInTheDocument();
  });

  it('toggling a location on stamps the game date', () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Red Dog Smithy supports the party'));
    expect(setSupport).toHaveBeenCalledWith('red-dog-smithy', true, '7 Sarenith, 4725 AR');
  });

  it('toggling a supported location off passes on=false', () => {
    support = { 'red-dog-smithy': { earnedAt: '7 Sarenith, 4725 AR' } };
    renderPage();
    fireEvent.click(screen.getByLabelText('Red Dog Smithy supports the party'));
    expect(setSupport).toHaveBeenCalledWith('red-dog-smithy', false, null);
  });

  it('reflects a supported location as checked with a since stamp', () => {
    support = { 'the-hagfish': { earnedAt: '1 Calistril' } };
    renderPage();
    const box = screen.getByLabelText('The Hagfish supports the party');
    expect(box).toBeChecked();
    expect(screen.getByText('since 1 Calistril')).toBeInTheDocument();
  });

  it('counts supporting locations', () => {
    support = { 'the-hagfish': { earnedAt: 'x' }, 'red-dog-smithy': { earnedAt: 'y' } };
    renderPage();
    expect(screen.getByText('2 locations supporting the party')).toBeInTheDocument();
  });

  it('filters by search over names and skills', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Search town support locations'), {
      target: { value: 'athletics' },
    });
    // Red Dog Smithy unlocks Athletics; Diplomacy-only locations drop out.
    expect(screen.getByLabelText('Red Dog Smithy supports the party')).toBeInTheDocument();
    expect(screen.queryByLabelText('Deverin Manor supports the party')).not.toBeInTheDocument();
  });

  it('links the RP reminder to the reputation page', () => {
    renderPage();
    const link = screen.getByRole('link', { name: 'Reputation' });
    expect(link).toHaveAttribute('href', '/gm/world/reputation');
  });

  describe('Training Vendors section (#1191 S4)', () => {
    it('lists the training vendors with what they train', () => {
      renderPage();
      expect(screen.getByRole('heading', { name: 'Training Vendors' })).toBeInTheDocument();
      const row = screen.getByLabelText('House of Blue Stones trains the party').closest('li');
      expect(within(row).getByText('Trains: Monk stances')).toBeInTheDocument();
      expect(within(row).getByText(/8 tracks · 160h each/)).toBeInTheDocument();
    });

    it('toggling a trainer on stamps the game date', () => {
      renderPage();
      fireEvent.click(screen.getByLabelText('House of Blue Stones trains the party'));
      expect(setSupport).toHaveBeenCalledWith('house-of-blue-stones', true, '7 Sarenith, 4725 AR');
    });

    it('toggling a supported trainer off passes on=false', () => {
      support = { 'house-of-blue-stones': { earnedAt: '7 Sarenith, 4725 AR' } };
      renderPage();
      fireEvent.click(screen.getByLabelText('House of Blue Stones trains the party'));
      expect(setSupport).toHaveBeenCalledWith('house-of-blue-stones', false, null);
    });

    it('search filters the trainer list too', () => {
      renderPage();
      fireEvent.change(screen.getByLabelText('Search town support locations'), {
        target: { value: 'monk stances' },
      });
      expect(screen.getByLabelText('House of Blue Stones trains the party')).toBeInTheDocument();
      // A skill-only match hides trainers that don't match.
      fireEvent.change(screen.getByLabelText('Search town support locations'), {
        target: { value: 'nonexistent-xyz' },
      });
      expect(screen.queryByRole('heading', { name: 'Training Vendors' })).not.toBeInTheDocument();
    });
  });
});
