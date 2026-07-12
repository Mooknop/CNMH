import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AugmentGearProjects from './AugmentGearProjects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';
import { useCharacter } from '../../hooks/useCharacter';

vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));
vi.mock('../../hooks/useSessionLog', () => ({ useSessionLog: () => ({ appendEvent: vi.fn() }) }));

const character = { id: 'p', name: 'Pellias' };
const mirror = { id: 'mirror', type: 'augmentation', augTarget: ['shield'], name: 'Mirror', price: 1 };
const coat = { id: 'coat-of-arms', type: 'augmentation', augTarget: ['shield'], name: 'Coat of Arms', price: 20 };
const targe = { uid: 's1', name: 'Targe', shield: { hardness: 3 }, weight: 0.1 };

// Mock useSyncedState as a per-key store. `store` seeds initial values; setters
// are captured on `sets` for assertions.
const setup = ({ store = {}, inventory = [targe], crafting = 1, items = [mirror, coat], gold = 100 } = {}) => {
  const sets = {};
  useSyncedState.mockImplementation((key) => {
    const type = key.startsWith('cnmh_craftprojects_') ? 'craft'
      : key.startsWith('cnmh_acquired_') ? 'acquired'
        : key.startsWith('cnmh_removed_') ? 'removed'
          : key.startsWith('cnmh_gold_') ? 'gold' : key;
    const seed = type === 'gold' ? gold : (store[type] ?? (type === 'craft' ? null : []));
    if (!sets[type]) sets[type] = vi.fn(); // stable across re-renders so calls accumulate
    return [seed, sets[type]];
  });
  useContent.mockReturnValue({ items });
  useCharacter.mockReturnValue({ inventory, skillProficiencies: { crafting } });
  return { sets };
};

afterEach(() => vi.restoreAllMocks());

describe('AugmentGearProjects', () => {
  it('renders nothing when not trained in Crafting', () => {
    setup({ crafting: 0 });
    const { container } = render(<AugmentGearProjects character={character} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when trained but no augmentable gear and no projects', () => {
    setup({ inventory: [{ uid: 'r1', name: 'Rope', weight: 1 }] });
    const { container } = render(<AugmentGearProjects character={character} />);
    expect(container.firstChild).toBeNull();
  });

  it('starts a flat 1-day augment project, debiting the price and tagging kind:augment', () => {
    const { sets } = setup({ gold: 100 });
    render(<AugmentGearProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.change(screen.getByLabelText('Augment host'), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText('Augmentation'), { target: { value: 'coat-of-arms' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start (1 day)' }));

    // The project lands on the shared craft key, tagged augment, at 0/8h.
    const proj = sets.craft.mock.calls.at(-1)[0]({ projects: [] }).projects.at(-1);
    expect(proj).toMatchObject({ kind: 'augment', hostUid: 's1', augRef: 'coat-of-arms', hours: 0, threshold: 8, price: 20, status: 'in-progress' });
    // Full price paid up front from gold.
    expect(sets.gold.mock.calls.at(-1)[0](100)).toBe(80);
  });

  it('blocks Start when the augmentation costs more than the crafter has', () => {
    setup({ gold: 5 });
    render(<AugmentGearProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.change(screen.getByLabelText('Augment host'), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText('Augmentation'), { target: { value: 'coat-of-arms' } }); // 20 gp > 5
    expect(screen.getByText(/over your 5 gp/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start (1 day)' })).toBeDisabled();
  });

  it('warns that a swap destroys the current augmentation', () => {
    setup({ inventory: [{ ...targe, augmentation: { id: 'mirror', name: 'Mirror' } }] });
    render(<AugmentGearProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.change(screen.getByLabelText('Augment host'), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText('Augmentation'), { target: { value: 'coat-of-arms' } });
    expect(screen.getByText(/Replaces Mirror — the old one is destroyed/i)).toBeInTheDocument();
  });

  it('applies a completed project to the acquired overlay and drops it', () => {
    const project = { id: 'ag1', kind: 'augment', hostUid: 's1', hostName: 'Targe', augRef: 'mirror', augName: 'Mirror', name: 'Augment: Targe — Mirror', hours: 8, threshold: 8, status: 'in-progress' };
    const { sets } = setup({ store: { craft: { projects: [project] }, acquired: [], removed: [] } });
    render(<AugmentGearProjects character={character} />);

    // The augmentation binding is credited to acquired…
    const acq = sets.acquired.mock.calls.at(-1)[0];
    expect(acq).toHaveLength(1);
    expect(acq[0].augmentation).toEqual({ ref: 'mirror' });
    expect(acq[0].name).toBe('Targe');
    // …the authored host uid is masked via removed…
    expect(sets.removed.mock.calls.at(-1)[0]).toContain('s1');
    // …and the finished project is dropped.
    expect(sets.craft.mock.calls.at(-1)[0]({ projects: [project] }).projects).toEqual([]);
  });
});
