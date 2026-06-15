import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import BestiaryBrowser from './BestiaryBrowser';
import { defaultRecord } from '../utils/recallKnowledge';

let mockParams = {};
vi.mock('react-router-dom', () => ({
  useParams: () => mockParams,
}));

vi.mock('../components/shared/TraitTag', () => ({
  default: ({ trait }) => <span data-testid="trait-tag">{trait}</span>,
}));

let mockMonsters = [];
vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ monsters: mockMonsters }),
}));

let mockRecords = {};
vi.mock('../hooks/useRecallKnowledge', () => ({
  useRecallKnowledge: () => ({ recordFor: (k) => mockRecords[k] || defaultRecord() }),
}));

let mockIsGm = false;
vi.mock('../hooks/useGmAuth', () => ({
  useGmAuth: () => ({ isGm: mockIsGm }),
}));

const mockOpenLore = vi.fn();
vi.mock('../contexts/LoreContext', () => ({
  useLore: () => ({ openLore: mockOpenLore }),
}));

// Out-of-combat RK is covered by its own test; stub it here to a sentinel.
vi.mock('../components/bestiary/BestiaryRecallKnowledge', () => ({
  default: ({ enemy }) => <div data-testid="bestiary-rk-mock">{enemy?.id}</div>,
}));

const goblin = {
  id: 'goblin-warrior',
  name: 'Goblin Warrior',
  bestiary: { level: 1, rarity: 'common', traits: ['goblin'], hp: { current: 6, max: 6 }, description: 'desc' },
  defenses: { ac: 16, saves: {}, immunities: [], resistances: [], weaknesses: [] },
  lastSeenAt: 1700000000000,
  locations: { sandpoint: { name: 'Sandpoint', lastSeenAt: 1700000000000 } },
};
const ogre = {
  id: 'ogre',
  name: 'Ogre',
  bestiary: { level: 3, rarity: 'common', traits: ['giant'], hp: { current: 50, max: 50 } },
  defenses: { ac: 19, saves: {}, immunities: [], resistances: [], weaknesses: [] },
  lastSeenAt: 1700000000000,
};
const overrideOnly = { id: 'legacy', name: 'Legacy', descriptionOverride: 'x' }; // no bestiary

beforeEach(() => {
  vi.clearAllMocks();
  mockParams = {};
  mockMonsters = [goblin, ogre, overrideOnly];
  mockRecords = {};
  mockIsGm = false;
});

describe('BestiaryBrowser (#334)', () => {
  test('lists captured monsters and skips override-only docs', () => {
    mockRecords = { 'goblin-warrior': { ...defaultRecord(), identity: true } };
    render(<BestiaryBrowser />);
    const list = screen.getByRole('listbox', { name: 'Creature list' });
    expect(within(list).getByText('Goblin Warrior')).toBeInTheDocument();
    expect(screen.queryByText('Legacy')).not.toBeInTheDocument();
  });

  test('redacts unidentified creatures for players', () => {
    render(<BestiaryBrowser />); // no records → nothing identified
    expect(screen.queryByText('Goblin Warrior')).not.toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Creature list' })).toBeInTheDocument();
  });

  test('GM sees all names without learning', () => {
    mockIsGm = true;
    render(<BestiaryBrowser />);
    const list = screen.getByRole('listbox', { name: 'Creature list' });
    expect(within(list).getByText('Goblin Warrior')).toBeInTheDocument();
    expect(within(list).getByText('Ogre')).toBeInTheDocument();
  });

  test('search filters by name (GM)', () => {
    mockIsGm = true;
    render(<BestiaryBrowser />);
    fireEvent.change(screen.getByLabelText('Search creatures by name'), { target: { value: 'ogre' } });
    const list = screen.getByRole('listbox', { name: 'Creature list' });
    expect(within(list).queryByText('Goblin Warrior')).not.toBeInTheDocument();
    expect(within(list).getByText('Ogre')).toBeInTheDocument();
  });

  test('deep-link param focuses a creature', () => {
    mockIsGm = true;
    mockParams = { creatureKey: 'ogre' };
    render(<BestiaryBrowser />);
    // The focused detail pane shows the Ogre's AC.
    expect(screen.getByText('19')).toBeInTheDocument();
  });

  test('renders out-of-combat Recall Knowledge for the focused creature (#396)', () => {
    mockIsGm = true;
    mockParams = { creatureKey: 'ogre' };
    render(<BestiaryBrowser />);
    expect(screen.getByTestId('bestiary-rk-mock')).toHaveTextContent('ogre');
  });

  test('"Encountered at" link opens the location lore', () => {
    mockIsGm = true;
    mockParams = { creatureKey: 'goblin-warrior' };
    render(<BestiaryBrowser />);
    fireEvent.click(screen.getByRole('button', { name: 'Sandpoint' }));
    expect(mockOpenLore).toHaveBeenCalledWith('sandpoint');
  });
});
