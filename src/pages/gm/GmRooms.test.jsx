import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/useCurrentRoom', () => ({ useCurrentRoom: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn() }));

import { useContent } from '../../contexts/ContentContext';
import { useCurrentRoom } from '../../hooks/useCurrentRoom';
import { saveDocument } from '../../utils/gmApi';
import GmRooms from './GmRooms';

const rooms = [
  { id: 'featw', name: 'Warren Features', site: 'Warren', sort: 1500, isFeatures: true, body: '<p>Cramped.</p>', checks: [] },
  { id: 'a1', code: 'A1', name: 'Entrance', site: 'Warren', sort: 1600, readAloud: 'A tunnel.', checks: [], creatures: [], hazards: [] },
  { id: 'b1', code: 'B1', name: 'Catacomb', site: 'Catacombs', sort: 2100, readAloud: 'Bones.', checks: [], creatures: [], hazards: [] },
];

const pinRoom = vi.fn();
const renderPage = () => render(<MemoryRouter><GmRooms /></MemoryRouter>);

beforeEach(() => {
  useCurrentRoom.mockReturnValue({ pinnedId: null, pinRoom });
  saveDocument.mockResolvedValue({ ok: true });
});

describe('GmRooms', () => {
  it('shows an import hint when no rooms exist', () => {
    useContent.mockReturnValue({ rooms: [] });
    renderPage();
    expect(screen.getByText(/No adventure rooms imported yet/)).toBeInTheDocument();
  });

  it('lists sites and rooms and defaults selection to the first room', () => {
    useContent.mockReturnValue({ rooms });
    renderPage();
    const rail = screen.getByLabelText('Rooms by site');
    expect(within(rail).getByText('Warren')).toBeInTheDocument();
    expect(within(rail).getByText('Catacombs')).toBeInTheDocument();
    // First room (A1) is selected by default → its read-aloud shows in detail.
    expect(screen.getByLabelText('Read-aloud text')).toHaveTextContent('A tunnel.');
  });

  it('selects a room on click and filters by search', () => {
    useContent.mockReturnValue({ rooms });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Catacomb/ }));
    expect(screen.getByLabelText('Read-aloud text')).toHaveTextContent('Bones.');

    fireEvent.change(screen.getByLabelText('Search rooms'), { target: { value: 'entrance' } });
    expect(screen.getByRole('button', { name: /Entrance/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Catacomb/ })).not.toBeInTheDocument();
  });

  it('pins the selected room to the dashboard', () => {
    useContent.mockReturnValue({ rooms });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Pin to dashboard' }));
    expect(pinRoom).toHaveBeenCalledWith('a1'); // A1 is the default selection
  });

  it('does not offer a pin action for a Features doc', () => {
    useContent.mockReturnValue({ rooms });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Features' }));
    expect(screen.queryByRole('button', { name: /Pin to dashboard/ })).not.toBeInTheDocument();
  });

  it('edits and saves GM significance notes on the selected room', async () => {
    useContent.mockReturnValue({ rooms });
    renderPage();
    const box = screen.getByLabelText('Campaign significance (GM notes)');
    const saveBtn = screen.getByRole('button', { name: 'Save notes' });
    expect(saveBtn).toBeDisabled(); // nothing dirty yet

    fireEvent.change(box, { target: { value: 'Ambush the party here.' } });
    expect(saveBtn).toBeEnabled();
    fireEvent.click(saveBtn);

    expect(saveDocument).toHaveBeenCalledWith('room', 'a1', expect.objectContaining({ notes: 'Ambush the party here.' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });
});
