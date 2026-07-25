import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
// Store-backed useSyncedState (same shape as ReactionPrompt.test's) so the D4
// outstanding-prompt chip can be seeded and cleared.
vi.mock('../../hooks/useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => {
      store[key] = typeof u === 'function' ? u(store[key]) : u;
      subs.forEach((f) => f());
    };
    return [store[key], set];
  };
  return {
    __esModule: true,
    useSyncedState,
    __set: (key, value) => {
      store[key] = value;
      subs.forEach((f) => f());
    },
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});
import { useReactionOptions } from '../../hooks/useReactionOptions';
import { __set, __reset } from '../../hooks/useSyncedState';

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
  __reset();
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
    // D4: every fired prompt carries the countdown ttl.
    expect(payload.ttlSec).toBe(30);
    expect(payload.ts).toEqual(expect.any(Number));

    expect(mockAppendEvent).toHaveBeenCalledWith({
      type: 'trigger',
      text: 'Trigger: Ally damaged nearby → Pellias (Retributive Strike)',
    });
  });

  // D4 (#1575): the waiting chip while a prompt is outstanding.
  describe('outstanding-prompt chip', () => {
    it('counts down on the GM clock and reads "no answer" when it drains', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(1_000_000);
        __set('cnmh_reactprompt_Pellias', {
          reqId: 'react-x', eventId: 'ally-damaged', label: 'Ally damaged nearby',
          round: 3, ttlSec: 30, ts: 1_000_000,
        });
        render(
          <DockReactionRail
            encounter={{ order: ORDER, round: 3 }}
            characters={CHARS}
            excludeEntryId={null}
          />
        );
        expect(screen.getByTestId('dock-rail-wait')).toHaveTextContent('⏳ 30s');

        act(() => { vi.advanceTimersByTime(31_000); });
        expect(screen.getByTestId('dock-rail-wait')).toHaveTextContent('⏳ no answer');

        // The player answering (key cleared) settles the chip.
        act(() => { __set('cnmh_reactprompt_Pellias', null); });
        expect(screen.queryByTestId('dock-rail-wait')).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('a prompt without ttlSec (pre-D4 shape) shows the plain prompted chip', () => {
      __set('cnmh_reactprompt_Pellias', {
        reqId: 'react-y', eventId: 'ally-damaged', label: 'Ally damaged nearby', round: 3, ts: 5,
      });
      render(
        <DockReactionRail
          encounter={{ order: ORDER, round: 3 }}
          characters={CHARS}
          excludeEntryId={null}
        />
      );
      expect(screen.getByTestId('dock-rail-wait')).toHaveTextContent('⏳ prompted');
    });

    it('a prompt stamped for an earlier round shows no chip', () => {
      __set('cnmh_reactprompt_Pellias', {
        reqId: 'react-z', eventId: 'ally-damaged', label: 'Ally damaged nearby',
        round: 2, ttlSec: 30, ts: 5,
      });
      render(
        <DockReactionRail
          encounter={{ order: ORDER, round: 3 }}
          characters={CHARS}
          excludeEntryId={null}
        />
      );
      expect(screen.queryByTestId('dock-rail-wait')).not.toBeInTheDocument();
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
