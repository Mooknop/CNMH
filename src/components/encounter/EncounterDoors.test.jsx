import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EncounterDoors from './EncounterDoors';

const mockSendUpdate = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate }),
}));

// Keyed synced-state store: cnmh_dooropts_<id> (door list) + cnmh_movedone_<id>.
// Direct-return (not useState) so changing the store + rerendering reflects the
// new value — the re-detect test relies on cnmh_movedone updating across renders.
let store = {};
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, init) => [key in store ? store[key] : init, vi.fn()],
}));

const mockSpendActions = vi.fn();
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({ spendActions: mockSpendActions }),
}));

const mockAppendLog = vi.fn();
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ appendLog: mockAppendLog }),
}));

const setDoors = (doors) => { store['cnmh_dooropts_Pellias'] = { doors }; };

beforeEach(() => {
  vi.clearAllMocks();
  store = {};
});

const render1 = () => render(<EncounterDoors charId="Pellias" characterName="Pellias" />);

describe('EncounterDoors', () => {
  it('requests nearby doors on mount', () => {
    render1();
    expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', 'doorreq', expect.objectContaining({ ts: expect.any(Number) }));
  });

  it('renders nothing when no door is in reach', () => {
    setDoors([]);
    const { container } = render1();
    expect(container.querySelector('.granted-actions-section')).toBeNull();
  });

  it('opening a closed door toggles it, spends a 1-action Interact, and logs it', () => {
    setDoors([{ wallId: 'w1', state: 0, x: 100, y: 100 }]);
    render1();
    fireEvent.click(screen.getByRole('button', { name: 'Open door' }));
    expect(mockSendUpdate).toHaveBeenCalledWith('Pellias', 'doorinteract', expect.objectContaining({ wallId: 'w1', op: 'open' }));
    expect(mockSpendActions).toHaveBeenCalledWith(1, 'Interact (door)');
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      type: 'action', charId: 'Pellias', text: 'Pellias opened a door (Interact, 1 act)',
    }));
  });

  it('shows Close for an open door and no button for a locked one', () => {
    setDoors([
      { wallId: 'w1', state: 1, x: 0, y: 0 },
      { wallId: 'w2', state: 2, x: 0, y: 0 },
    ]);
    render1();
    expect(screen.getByRole('button', { name: 'Close door' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open door' })).not.toBeInTheDocument();
    // Locked door row renders but offers no toggle.
    expect(screen.getByText(/Locked Door/)).toBeInTheDocument();
  });

  it('re-detects when a confirmed move stamps a new movedone reqTs', () => {
    store['cnmh_movedone_Pellias'] = { reqTs: 1 };
    setDoors([]);
    const { rerender } = render1();
    expect(mockSendUpdate).toHaveBeenCalledTimes(1); // mount

    store['cnmh_movedone_Pellias'] = { reqTs: 2 };
    rerender(<EncounterDoors charId="Pellias" characterName="Pellias" />);
    expect(mockSendUpdate).toHaveBeenCalledTimes(2); // re-detect after move
  });
});
