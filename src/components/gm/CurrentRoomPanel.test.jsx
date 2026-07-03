import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/useCurrentRoom', () => ({ useCurrentRoom: vi.fn() }));

import { useContent } from '../../contexts/ContentContext';
import { useCurrentRoom } from '../../hooks/useCurrentRoom';
import CurrentRoomPanel from './CurrentRoomPanel';

const rooms = [
  { id: 'a1', code: 'A1', name: 'Entrance', site: 'Warren', sort: 1600, readAloud: 'A tunnel.', checks: [] },
  { id: 'a3', code: 'A3', name: 'Shrine', site: 'Warren', sort: 1800, readAloud: 'An altar.', checks: [] },
];

const pinRoom = vi.fn();
const renderPanel = () => render(<MemoryRouter><CurrentRoomPanel /></MemoryRouter>);

beforeEach(() => {
  useCurrentRoom.mockReturnValue({ pinnedId: null, room: null, pinRoom });
});

describe('CurrentRoomPanel', () => {
  it('renders nothing when no rooms are imported', () => {
    useContent.mockReturnValue({ rooms: [] });
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  it('prompts to pick when no room is pinned', () => {
    useContent.mockReturnValue({ rooms });
    renderPanel();
    expect(screen.getByText(/No room pinned/)).toBeInTheDocument();
  });

  it('pins a room via the picker', () => {
    useContent.mockReturnValue({ rooms });
    renderPanel();
    fireEvent.change(screen.getByLabelText('Pin current room'), { target: { value: 'a3' } });
    expect(pinRoom).toHaveBeenCalledWith('a3');
  });

  it('renders the pinned room detail inline', () => {
    useContent.mockReturnValue({ rooms });
    useCurrentRoom.mockReturnValue({ pinnedId: 'a3', room: rooms[1], pinRoom });
    renderPanel();
    expect(screen.getByRole('heading', { name: 'A3. Shrine' })).toBeInTheDocument();
    expect(screen.getByLabelText('Read-aloud text')).toHaveTextContent('An altar.');
  });
});
