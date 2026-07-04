import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: vi.fn(() => ({ gameDate: { day: 15, month: 8, year: 4725 } })), // 15 Rova 4725
}));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn() }));

import { useContent } from '../../contexts/ContentContext';
import { saveDocument } from '../../utils/gmApi';
import EventsPanel from './EventsPanel';

const ev = (over) => ({
  id: 'e', name: 'Event', chapter: 'Ch 2', sort: 1000,
  checks: [], creatures: [], hazards: [], ...over,
});

const renderPanel = () =>
  render(<MemoryRouter><EventsPanel /></MemoryRouter>);

beforeEach(() => {
  saveDocument.mockResolvedValue({});
  useContent.mockReturnValue({ events: [] });
});

describe('EventsPanel', () => {
  it('renders nothing until events are imported', () => {
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an empty state when nothing is active or upcoming', () => {
    useContent.mockReturnValue({
      events: [ev({ id: 'r', name: 'Done', status: 'resolved' })],
    });
    renderPanel();
    expect(screen.getByText(/Nothing active or upcoming/)).toBeInTheDocument();
  });

  it('lists active events with step progress and upcoming events', () => {
    useContent.mockReturnValue({
      events: [
        ev({ id: 'a', name: 'Copycat Killer', status: 'active', sort: 2000, steps: [{ done: true }, { done: false }] }),
        ev({ id: 'u', name: 'The Election', status: 'upcoming', sort: 3000 }),
      ],
    });
    renderPanel();
    const active = screen.getByText('Active').closest('.gm-events-group');
    expect(within(active).getByText('Copycat Killer')).toBeInTheDocument();
    expect(within(active).getByText('1/2')).toBeInTheDocument(); // step progress
    const upcoming = screen.getByText('Upcoming').closest('.gm-events-group');
    expect(within(upcoming).getByText('The Election')).toBeInTheDocument();
  });

  it('hides tracked:false events entirely', () => {
    useContent.mockReturnValue({
      events: [ev({ id: 'h', name: 'Connective Page', status: 'active', tracked: false })],
    });
    renderPanel();
    expect(screen.queryByText('Connective Page')).toBeNull();
    expect(screen.getByText(/Nothing active or upcoming/)).toBeInTheDocument();
  });

  it('flags a due upcoming event and pulls it ahead of the limit', () => {
    const filler = Array.from({ length: 6 }, (_, i) =>
      ev({ id: `f${i}`, name: `Filler ${i}`, status: 'upcoming', sort: 100 + i }));
    useContent.mockReturnValue({
      events: [
        ...filler,
        ev({ id: 'due', name: 'Overdue Beat', status: 'upcoming', sort: 9000, scheduledFor: 'Rova 12' }),
      ],
    });
    renderPanel();
    // Due event survives the 5-item cap despite its late sort, and is flagged.
    const row = screen.getByText('Overdue Beat').closest('.gm-events-row');
    expect(row).toHaveClass('is-due');
    expect(within(row).getByText('Due')).toBeInTheDocument();
  });

  it('links each event into World → Events by id', () => {
    useContent.mockReturnValue({
      events: [ev({ id: 'a', name: 'Copycat Killer', status: 'active' })],
    });
    renderPanel();
    expect(screen.getByText('Copycat Killer').closest('a'))
      .toHaveAttribute('href', '/gm/world/events?event=a');
  });

  it('resolves an active event with one click', async () => {
    const active = ev({ id: 'a', name: 'Copycat Killer', status: 'active' });
    useContent.mockReturnValue({ events: [active] });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith('event', 'a', { ...active, status: 'resolved' }));
  });
});
