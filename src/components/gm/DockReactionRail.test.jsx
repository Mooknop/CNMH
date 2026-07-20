import React from 'react';
import { render, screen } from '@testing-library/react';
import DockReactionRail from './DockReactionRail';

vi.mock('../../hooks/useReactionOptions', () => ({ useReactionOptions: vi.fn() }));
vi.mock('./GmReactionBadge', () => ({
  default: ({ charId }) => <span data-testid={`badge-${charId}`} />,
}));
import { useReactionOptions } from '../../hooks/useReactionOptions';

const CHARS = [
  { id: 'AshkaBGosh', name: 'Ashka' },
  { id: 'Pellias', name: 'Pellias' },
  { id: 'IzzyUncut', name: 'Izzy' },
];

const ORDER = [
  { entryId: 'e1', kind: 'pc', charId: 'AshkaBGosh', name: 'Ashka' },
  { entryId: 'e2', kind: 'enemy', name: 'Ghoul' },
  { entryId: 'e3', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
  { entryId: 'e4', kind: 'pc', charId: 'IzzyUncut', name: 'Izzy' },
];

const OPTIONS = {
  AshkaBGosh: [
    {
      reaction: { name: 'Shield Block', trigger: 'You would take damage while your shield is raised' },
      castSource: null,
      live: false,
      liveReason: 'raise a shield first',
    },
  ],
  Pellias: [
    {
      reaction: { name: 'Retributive Strike', trigger: 'An enemy damages your ally' },
      castSource: null,
      live: true,
      liveReason: null,
    },
    {
      reaction: { name: 'Ready: trip the runner', readied: true, trigger: 'The ghoul moves past' },
      castSource: null,
      live: true,
      liveReason: null,
    },
  ],
  IzzyUncut: [],
};

beforeEach(() => {
  useReactionOptions.mockImplementation((character) => ({
    options: OPTIONS[character.id] || [],
  }));
});

describe('DockReactionRail', () => {
  it('renders a row per PC in initiative order, skipping enemies and the excluded entry', () => {
    render(
      <DockReactionRail encounter={{ order: ORDER }} characters={CHARS} excludeEntryId="e1" />
    );
    // Ashka (e1) is the acting PC — excluded. Ghoul is not a PC.
    expect(screen.queryByLabelText('Ashka reactions')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Pellias reactions')).toBeInTheDocument();
    expect(screen.getByLabelText('Izzy reactions')).toBeInTheDocument();
    expect(screen.getByTestId('badge-Pellias')).toBeInTheDocument();
  });

  it('shows every PC when nothing is excluded (setup / enemy turns)', () => {
    render(<DockReactionRail encounter={{ order: ORDER }} characters={CHARS} excludeEntryId={null} />);
    expect(screen.getByLabelText('Ashka reactions')).toBeInTheDocument();
    expect(screen.getByLabelText('Pellias reactions')).toBeInTheDocument();
  });

  it('renders armed reactions with their trigger text', () => {
    render(<DockReactionRail encounter={{ order: ORDER }} characters={CHARS} excludeEntryId="e1" />);
    expect(screen.getByText('Retributive Strike')).toBeInTheDocument();
    expect(screen.getByText('An enemy damages your ally')).toBeInTheDocument();
    expect(screen.getByText('armed')).toBeInTheDocument();
  });

  it('marks a readied action as readied', () => {
    render(<DockReactionRail encounter={{ order: ORDER }} characters={CHARS} excludeEntryId="e1" />);
    expect(screen.getByText('Ready: trip the runner')).toBeInTheDocument();
    expect(screen.getByText('readied')).toBeInTheDocument();
  });

  it('renders blocked reactions with the liveReason', () => {
    render(<DockReactionRail encounter={{ order: ORDER }} characters={CHARS} excludeEntryId={null} />);
    expect(screen.getByText('Shield Block')).toBeInTheDocument();
    expect(screen.getByText('raise a shield first')).toBeInTheDocument();
    expect(screen.getByText('Shield Block').closest('li')).toHaveClass('dock-rail-react--blocked');
  });

  it('shows the per-PC empty state when a PC has no reactions', () => {
    render(<DockReactionRail encounter={{ order: ORDER }} characters={CHARS} excludeEntryId="e1" />);
    expect(screen.getByText('No reactions.')).toBeInTheDocument();
  });

  it('shows the rail empty state when no other PCs are in the order', () => {
    render(
      <DockReactionRail
        encounter={{ order: [ORDER[0], ORDER[1]] }}
        characters={CHARS}
        excludeEntryId="e1"
      />
    );
    expect(screen.getByText('No other party members in the order.')).toBeInTheDocument();
  });
});
