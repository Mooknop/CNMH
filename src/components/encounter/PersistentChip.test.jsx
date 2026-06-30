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

// useResolvedEffects backs the resistance/flat-check lookup (#900/#922) — the
// chip threads its { effects, catalog } into the real readers, so the test
// keys the resolved effects by charId and supplies the catalog the readers run
// against (verifying the wiring). useCharacter only feeds inventory to the
// resolver, which is mocked here, so it can return null.
let mockEffectsByChar = {}; // { [charId]: effects[] }
const RESOLVED_CATALOG = [
  { id: 'blood-booster-greater', name: 'Blood Booster (Greater)', modifiers: [
    { stat: 'resistance', amount: 20, vs: 'persistent-bleed,persistent-poison', flatCheckEase: true },
  ] },
];
vi.mock('../../hooks/useResolvedEffects', () => ({
  useResolvedEffects: (charId) => ({ effects: mockEffectsByChar[charId] || [], catalog: RESOLVED_CATALOG }),
}));
vi.mock('../../hooks/useCharacter', () => ({ useCharacter: () => null }));
vi.mock('../../contexts/ContentContext', () => ({ useContent: () => ({ characters: [] }) }));

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
  mockEffectsByChar = {};
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

  it('annotates resistance per row and eases the footer DC for a matching effect (#900)', () => {
    mockEffectsByChar = { 'char-a': [{ id: 'u1', effectId: 'blood-booster-greater' }] };
    seed({
      'e-pc': [
        { id: 'pd-1', dice: '1d6', type: 'bleed', sourceName: 'Wound' },
        { id: 'pd-2', dice: '1d6', type: 'fire', sourceName: 'Torch' },
      ],
    });
    render(<PersistentChip entry={ashka} viewerCharId="char-a" />);
    fireEvent.click(screen.getByRole('button', { name: /Ashka/ }));
    expect(screen.getByText(/1d6 persistent bleed − resistance 20/)).toBeInTheDocument();
    // fire is not covered — no resistance annotation
    expect(screen.getByText(/1d6 persistent fire/).textContent).not.toMatch(/resistance/);
    // bleed is eased, so the footer reads DC 10
    expect(screen.getByText(/Damage at end of turn, then DC 10 flat check to end/)).toBeInTheDocument();
  });

  it('keeps the DC-15 footer and no annotation for an enemy with no effects (#900)', () => {
    seed({ 'e-gob': [{ id: 'pd-1', dice: '1d4', type: 'bleed', sourceName: 'x' }] });
    render(<PersistentChip entry={goblin} />);
    fireEvent.click(screen.getByRole('button', { name: /Goblin/ }));
    expect(screen.getByText(/Damage at end of turn, then DC 15 flat check to end/)).toBeInTheDocument();
    expect(screen.getByText(/1d4 persistent bleed/).textContent).not.toMatch(/resistance/);
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
