import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PersistentChip from './PersistentChip';

const mockAppendLog = vi.fn();
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ appendLog: mockAppendLog }),
}));

let mockIsGm = false;
vi.mock('../../hooks/useGmAuth', () => ({
  useGmAuth: () => ({ isGm: mockIsGm }),
}));

// Key-aware synced-state mock backed by real state so removals re-render.
const syncedMock = vi.hoisted(() => ({ initialMap: {}, setSpy: null }));
vi.mock('../../hooks/useSyncedState', () => {
  const React = require('react');
  return {
    useSyncedState: (key, init) => {
      const [value, setValue] = React.useState(
        key === 'cnmh_persistent_global' ? syncedMock.initialMap : init
      );
      if (key === 'cnmh_persistent_global') {
        syncedMock.setSpy = syncedMock.setSpy || vi.fn(setValue);
        return [value, syncedMock.setSpy];
      }
      return [value, setValue];
    },
  };
});

const goblin = { entryId: 'e-gob', kind: 'enemy', name: 'Goblin' };
const ashka  = { entryId: 'e-pc', kind: 'pc', charId: 'char-a', name: 'Ashka' };

const seed = (map) => { syncedMock.initialMap = map; };

beforeEach(() => {
  vi.clearAllMocks();
  syncedMock.initialMap = {};
  syncedMock.setSpy = null;
  mockIsGm = false;
});

describe('PersistentChip (#272)', () => {
  it('renders nothing when the entry has no tracked instances', () => {
    const { container } = render(<PersistentChip entry={goblin} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the badge and opens a popover listing the instances', () => {
    seed({ 'e-gob': [{ id: 'pd-1', dice: '1d4', type: 'electricity', sourceName: 'Polarize' }] });
    render(<PersistentChip entry={goblin} />);
    const badge = screen.getByRole('button', { name: /Goblin: 1d4 persistent electricity/ });
    fireEvent.click(badge);
    expect(screen.getByText(/1d4 persistent electricity/)).toBeInTheDocument();
    expect(screen.getByText(/Polarize/)).toBeInTheDocument();
  });

  it('hides clear buttons from bystanders (not GM, not their PC)', () => {
    seed({ 'e-gob': [{ id: 'pd-1', dice: '1d4', type: 'fire', sourceName: 'x' }] });
    render(<PersistentChip entry={goblin} viewerCharId="char-a" />);
    fireEvent.click(screen.getByRole('button', { name: /Goblin/ }));
    expect(screen.queryByText('Flat check passed')).toBeNull();
  });

  it('lets a player clear their own PC and logs the flat check', () => {
    seed({ 'e-pc': [{ id: 'pd-1', dice: '1d4', type: 'bleed', sourceName: 'Shard Strike' }] });
    render(<PersistentChip entry={ashka} viewerCharId="char-a" />);
    fireEvent.click(screen.getByRole('button', { name: /Ashka/ }));
    fireEvent.click(screen.getByText('Flat check passed'));
    expect(mockAppendLog).toHaveBeenCalledWith({
      type: 'system',
      text: 'Ashka: 1d4 persistent bleed ended (flat check)',
    });
    // The instance is gone, so the chip unrenders entirely.
    expect(screen.queryByRole('button', { name: /Ashka/ })).toBeNull();
  });

  it('lets the GM clear anyone and logs "healed" for the heal button', () => {
    mockIsGm = true;
    seed({ 'e-gob': [{ id: 'pd-1', dice: '2d4', type: 'electricity', sourceName: 'Polarize' }] });
    render(<PersistentChip entry={goblin} />);
    fireEvent.click(screen.getByRole('button', { name: /Goblin/ }));
    fireEvent.click(screen.getByText('Healed'));
    expect(mockAppendLog).toHaveBeenCalledWith({
      type: 'system',
      text: 'Goblin: 2d4 persistent electricity ended (healed)',
    });
  });

  it('clears only the targeted instance when several are tracked', () => {
    mockIsGm = true;
    seed({
      'e-gob': [
        { id: 'pd-1', dice: '1d4', type: 'bleed', sourceName: 'a' },
        { id: 'pd-2', dice: '1d6', type: 'fire', sourceName: 'b' },
      ],
    });
    render(<PersistentChip entry={goblin} />);
    fireEvent.click(screen.getByRole('button', { name: /Goblin/ }));
    fireEvent.click(screen.getAllByText('Flat check passed')[0]);
    expect(screen.queryByText(/1d4 persistent bleed/)).toBeNull();
    expect(screen.getByText(/1d6 persistent fire/)).toBeInTheDocument();
  });
});
