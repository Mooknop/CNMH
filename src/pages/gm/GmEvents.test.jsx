import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
// The import button pulls in the transform (imported from scripts/); stub it so
// GmEvents tests stay focused on browsing. It has its own test file.
vi.mock('../../components/gm/RoomsImportButton', () => ({
  default: () => <div data-testid="rooms-import-button" />,
}));
// The tracking editor has its own test file; stub it here so its status buttons
// don't collide with the detail-bar status badge in these browsing tests.
vi.mock('../../components/gm/EventTracker', () => ({
  default: ({ event }) => <div data-testid="event-tracker">{event.id}</div>,
}));

import { useContent } from '../../contexts/ContentContext';
import GmEvents from './GmEvents';

const events = [
  {
    id: 'sd4s-event-off-to-the-pit',
    name: 'Off to the Pit',
    chapter: 'Ch 2: Strange Times',
    sort: 3900,
    status: 'active',
    readAloud: 'The party sets out.',
    checks: [],
    creatures: [],
    hazards: [],
  },
  {
    id: 'sd4s-event-ripnugget-rumors',
    name: 'Ripnugget Rumors',
    chapter: 'Ch 2: Strange Times',
    sort: 4200,
    status: 'upcoming',
    readAloud: 'Ask around town.',
    checks: [{ label: 'Gather Information', statistic: 'diplomacy', dc: 15, secret: true }],
    creatures: [],
    hazards: [],
  },
  {
    id: 'sd4s-event-preparing',
    name: 'Preparing for Adventure',
    chapter: 'Ch 2: Strange Times',
    sort: 3800,
    tracked: false, // GM hid this connective page
    readAloud: 'Shopping montage.',
    checks: [],
    creatures: [],
    hazards: [],
  },
];

const renderPage = () => render(<GmEvents />);

beforeEach(() => {
  useContent.mockReturnValue({ events });
});

describe('GmEvents', () => {
  it('shows an import hint when no events exist', () => {
    useContent.mockReturnValue({ events: [] });
    renderPage();
    expect(screen.getByText(/No chapter events imported yet/)).toBeInTheDocument();
  });

  it('lists chapters and visible events, defaulting selection to the first', () => {
    renderPage();
    const rail = screen.getByLabelText('Events by chapter');
    expect(within(rail).getByText('Ch 2: Strange Times')).toBeInTheDocument();
    // First visible event in book order is "Off to the Pit" (sort 3900) — the
    // hidden "Preparing" (3800) is filtered out of the default view.
    expect(screen.getByLabelText('Read-aloud text')).toHaveTextContent('The party sets out.');
    expect(within(rail).queryByRole('button', { name: /Preparing for Adventure/ })).toBeNull();
  });

  it('selects an event on click and shows its parsed checks', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Ripnugget Rumors/ }));
    expect(screen.getByLabelText('Read-aloud text')).toHaveTextContent('Ask around town.');
    expect(screen.getByText('Gather Information')).toBeInTheDocument(); // check rendered by RoomDetail
  });

  it('filters events by search', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Search events'), { target: { value: 'ripnugget' } });
    expect(screen.getByRole('button', { name: /Ripnugget Rumors/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Off to the Pit/ })).not.toBeInTheDocument();
  });

  it('reveals hidden events only when "show hidden" is toggled on', () => {
    renderPage();
    const rail = screen.getByLabelText('Events by chapter');
    expect(within(rail).queryByRole('button', { name: /Preparing for Adventure/ })).toBeNull();
    fireEvent.click(screen.getByLabelText(/Show hidden/));
    expect(within(rail).getByRole('button', { name: /Preparing for Adventure/ })).toBeInTheDocument();
  });

  it('shows the selected event status in the detail bar', () => {
    renderPage();
    // Default selection "Off to the Pit" is active.
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('mounts the tracking editor for the selected event', () => {
    renderPage();
    expect(screen.getByTestId('event-tracker')).toHaveTextContent('sd4s-event-off-to-the-pit');
  });
});
