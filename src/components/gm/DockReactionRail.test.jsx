import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DockReactionRail from './DockReactionRail';
import { APP } from '../../sync/keys';

const mockSendUpdate = vi.fn();
const mockAppendEvent = vi.fn();
vi.mock('../../hooks/useReactionOptions', () => ({ useReactionOptions: vi.fn() }));
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate }),
}));
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent }),
}));
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
      // Blocked despite a triggerType — must NOT be promptable.
      reaction: {
        name: 'Shield Block',
        triggerType: 'attack-any',
        trigger: 'You would take damage while your shield is raised',
      },
      castSource: null,
      live: false,
      liveReason: 'raise a shield first',
    },
    {
      // Armed but no authored triggerType — nothing to fire.
      reaction: { name: 'Untyped Parry', trigger: 'A melee attack hits you' },
      castSource: null,
      live: true,
      liveReason: null,
    },
  ],
  Pellias: [
    {
      reaction: {
        name: 'Retributive Strike',
        triggerType: 'damaged-ally',
        trigger: 'An enemy damages your ally',
      },
      castSource: null,
      live: true,
      liveReason: null,
    },
    {
      // Readied actions are player-initiated — never promptable.
      reaction: { name: 'Ready: trip the runner', readied: true, trigger: 'The ghoul moves past' },
      castSource: null,
      live: true,
      liveReason: null,
    },
  ],
  IzzyUncut: [],
};

beforeEach(() => {
  mockSendUpdate.mockClear();
  mockAppendEvent.mockClear();
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

  it('offers Prompt only on armed reactions with a fireable triggerType', () => {
    render(<DockReactionRail encounter={{ order: ORDER, round: 3 }} characters={CHARS} excludeEntryId={null} />);
    // Retributive Strike: armed + typed → promptable.
    expect(screen.getByLabelText('Prompt Retributive Strike')).toBeInTheDocument();
    // Blocked (Shield Block), untyped (Untyped Parry), readied → not promptable.
    expect(screen.queryByLabelText('Prompt Shield Block')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Prompt Untyped Parry')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Prompt Ready: trip the runner')).not.toBeInTheDocument();
  });

  it('fires the matching trigger event at that PC and logs it', () => {
    render(<DockReactionRail encounter={{ order: ORDER, round: 3 }} characters={CHARS} excludeEntryId={null} />);
    fireEvent.click(screen.getByLabelText('Prompt Retributive Strike'));

    expect(mockSendUpdate).toHaveBeenCalledTimes(1);
    const [charId, key, payload] = mockSendUpdate.mock.calls[0];
    expect(charId).toBe('Pellias');
    expect(key).toBe(APP.REACTPROMPT);
    // damaged-ally's first matching GM event is "Ally damaged nearby".
    expect(payload.eventId).toBe('ally-damaged');
    expect(payload.label).toBe('Ally damaged nearby');
    expect(payload.round).toBe(3);
    expect(payload.reqId).toEqual(expect.stringContaining('react-'));

    expect(mockAppendEvent).toHaveBeenCalledWith({
      type: 'trigger',
      text: 'Trigger: Ally damaged nearby → Pellias (Retributive Strike)',
    });
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
