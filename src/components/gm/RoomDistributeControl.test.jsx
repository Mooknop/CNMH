import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../contexts/ContentContext', () => ({
  __esModule: true,
  useContent: () => ({ characters: [{ id: 'a', name: 'Aria' }] }),
}));

const hook = {
  drop: null,
  isOpen: false,
  openDrop: vi.fn(),
  cancelDrop: vi.fn(),
  finalizeDrop: vi.fn(() => Promise.resolve(true)),
};
vi.mock('../../hooks/useLootDrop', () => ({
  useLootDrop: () => hook,
}));

import RoomDistributeControl from './RoomDistributeControl';

const boundRoom = {
  id: 'sd4s-a3',
  code: 'A3',
  name: 'Shrine to Kabriri',
  treasureCache: { gold: 25, items: [{ ref: 'acid-flask', name: 'Acid Flask', qty: 2 }] },
};
const unmatchedRoom = {
  id: 'sd4s-a4',
  name: 'Vault',
  treasureCache: { gold: 0, items: [{ name: 'Gold Idol', qty: 1 }] },
};

beforeEach(() => {
  hook.drop = null;
  hook.isOpen = false;
  vi.clearAllMocks();
});

describe('RoomDistributeControl', () => {
  it('renders nothing for a Features doc or a room without a cache', () => {
    const { container, rerender } = render(<RoomDistributeControl room={{ isFeatures: true }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RoomDistributeControl room={{ id: 'x', name: 'Bare' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once the room is distributed', () => {
    const { container } = render(<RoomDistributeControl room={{ ...boundRoom, distributedAt: 1 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a distribute button for a bound cache', () => {
    render(<RoomDistributeControl room={boundRoom} />);
    expect(screen.getByRole('button', { name: /Distribute treasure/ })).toBeEnabled();
  });

  it('blocks distribution with a hint when the cache has an unmatched line', () => {
    render(<RoomDistributeControl room={unmatchedRoom} />);
    expect(screen.getByRole('button', { name: /Distribute treasure/ })).toBeDisabled();
    expect(screen.getByText(/Resolve the unmatched cache line/)).toBeInTheDocument();
  });

  it('disables the button when a drop is already open elsewhere', () => {
    hook.isOpen = true;
    hook.drop = { roomId: 'other', roomName: 'B1. Somewhere', items: [] };
    render(<RoomDistributeControl room={boundRoom} />);
    expect(screen.getByRole('button', { name: /Distribute treasure/ })).toBeDisabled();
    expect(screen.getByText(/Finish the open distribution in B1\. Somewhere/)).toBeInTheDocument();
  });

  it('confirms before opening a drop', () => {
    render(<RoomDistributeControl room={boundRoom} />);
    fireEvent.click(screen.getByRole('button', { name: /Distribute treasure/ }));
    expect(screen.getByText(/Distribute this treasure to the party/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start distribution' }));
    expect(hook.openDrop).toHaveBeenCalledWith(boundRoom);
  });

  it('shows the live drop panel for this room with Cancel and Finalize', () => {
    hook.isOpen = true;
    hook.drop = {
      roomId: 'sd4s-a3', roomName: 'A3. Shrine to Kabriri', gold: 25,
      items: [{ lineId: 'l1', ref: 'acid-flask', name: 'Acid Flask', qty: 2, claimedBy: 'a' }],
    };
    render(<RoomDistributeControl room={boundRoom} />);
    expect(screen.getByText('Distributing treasure')).toBeInTheDocument();
    expect(screen.getByText('claimed by Aria')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(hook.cancelDrop).toHaveBeenCalled();
  });

  it('finalizes the drop and surfaces a failure', async () => {
    hook.isOpen = true;
    hook.drop = { roomId: 'sd4s-a3', roomName: 'A3', gold: 25, items: [] };
    hook.finalizeDrop.mockRejectedValueOnce(new Error('nope'));
    render(<RoomDistributeControl room={boundRoom} />);
    fireEvent.click(screen.getByRole('button', { name: 'Finalize' }));
    await waitFor(() => expect(screen.getByText(/Finalize failed/)).toBeInTheDocument());
    expect(hook.finalizeDrop).toHaveBeenCalled();
  });
});
