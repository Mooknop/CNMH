import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GmCommandDock from './GmCommandDock';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/usePlayMode', () => ({ usePlayMode: vi.fn() }));
vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));
// Top-bar clock + campaign location (#1556 S1).
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ formatClockTime: () => '11:30 AM' }),
}));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: () => [{ location: 'Sandpoint Cathedral', locationLoreId: '' }, vi.fn()],
}));
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (character) => (character ? { ...character, flags: {} } : null),
}));
vi.mock('../../components/encounter/EncounterSkeleton', () => ({
  default: function DummyEncounterSkeleton({ character }) {
    return <div data-testid="encounter-skeleton">{character.name}</div>;
  },
}));
vi.mock('../../components/gm/DockReactionRail', () => ({
  default: function DummyDockReactionRail({ excludeEntryId }) {
    return <div data-testid="dock-rail" data-exclude={excludeEntryId || ''} />;
  },
}));
vi.mock('../../components/gm/DockEnemyPane', () => ({
  default: function DummyDockEnemyPane({ entry, tone }) {
    return <div data-testid="dock-enemy-pane" data-tone={tone}>{entry.name}</div>;
  },
}));
vi.mock('../../hooks/useAdvanceTurn', () => ({ useAdvanceTurn: vi.fn() }));
vi.mock('../../components/gm/DockGmConsole', () => ({
  default: function DummyDockGmConsole({ pcEntries }) {
    return <div data-testid="dock-console" data-pcs={pcEntries.length} />;
  },
}));
vi.mock('../../components/gm/DockOrderStrip', () => ({
  default: function DummyDockOrderStrip() {
    return <div data-testid="dock-order-strip" />;
  },
}));
vi.mock('../../components/gm/GmInitiativePanel', () => ({
  default: function DummyInitPanel({ pcs }) {
    return <div data-testid="init-panel" data-count={pcs.length} />;
  },
}));
import { useContent } from '../../contexts/ContentContext';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useEncounter } from '../../hooks/useEncounter';
import { useAdvanceTurn } from '../../hooks/useAdvanceTurn';

const CHARS = [
  { id: 'AshkaBGosh', name: 'Ashka' },
  { id: 'Pellias', name: 'Pellias' },
];

const encounterWith = (over = {}) => ({
  active: true,
  phase: 'in-progress',
  round: 2,
  currentTurnIndex: 0,
  order: [],
  ...over,
});

const advanceMock = vi.fn();

// The dock's close affordance is a router Link (#1556 S1).
const renderDock = () =>
  render(
    <MemoryRouter>
      <GmCommandDock />
    </MemoryRouter>
  );

beforeEach(() => {
  useContent.mockReturnValue({ characters: CHARS, theme: {} });
  usePlayMode.mockReturnValue({ mode: 'encounter' });
  useEncounter.mockReturnValue({ encounter: encounterWith() });
  advanceMock.mockClear();
  useAdvanceTurn.mockReturnValue({ advance: advanceMock });
});

describe('GmCommandDock', () => {
  it('stubs exploration mode', () => {
    usePlayMode.mockReturnValue({ mode: 'exploration' });
    useEncounter.mockReturnValue({ encounter: { active: false, phase: 'idle', order: [] } });
    renderDock();
    // Both the top-bar kicker and the stub carry the mode name (#1556 S1).
    expect(screen.getAllByText('Exploration').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Exploration controls arrive in a later slice.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('encounter-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dock-rail')).not.toBeInTheDocument();
    // The GM console (and its toggle) and order strip are encounter-mode only.
    expect(screen.queryByTestId('dock-console')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /GM console/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('dock-order-strip')).not.toBeInTheDocument();
  });

  it('mounts the order strip in encounter mode (#1537 S5)', () => {
    renderDock();
    expect(screen.getByTestId('dock-order-strip')).toBeInTheDocument();
  });

  describe('GM console (#1537 S2)', () => {
    const CONSOLE_ORDER = [
      { entryId: 'e1', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
      { entryId: 'e2', kind: 'pc', charId: 'ghost', name: 'Ghost' },
      { entryId: 'e3', kind: 'enemy', name: 'Ghoul' },
    ];

    it('renders open by default with every charId PC (roster-independent)', () => {
      useEncounter.mockReturnValue({
        encounter: encounterWith({ order: CONSOLE_ORDER }),
      });
      renderDock();
      // Ghost isn't roster-resolvable but can still receive a save prompt.
      expect(screen.getByTestId('dock-console')).toHaveAttribute('data-pcs', '2');
    });

    it('the header toggle collapses and reopens it', () => {
      renderDock();
      const toggle = screen.getByRole('button', { name: 'GM console' });
      expect(screen.getByTestId('dock-console')).toBeInTheDocument();

      fireEvent.click(toggle);
      expect(screen.queryByTestId('dock-console')).not.toBeInTheDocument();

      fireEvent.click(toggle);
      expect(screen.getByTestId('dock-console')).toBeInTheDocument();
    });

    it('badges the toggle with pending saves + armed payloads', () => {
      useEncounter.mockReturnValue({
        encounter: encounterWith({
          saveRequests: [
            { id: 's1', status: 'pending' },
            { id: 's2', status: 'resolved' },
          ],
          armedPayloads: [{ id: 'p1' }],
        }),
      });
      renderDock();
      expect(screen.getByRole('button', { name: 'GM console (2)' })).toBeInTheDocument();
    });
  });

  it('stubs downtime mode', () => {
    usePlayMode.mockReturnValue({ mode: 'downtime' });
    useEncounter.mockReturnValue({ encounter: { active: false, phase: 'idle', order: [] } });
    renderDock();
    expect(screen.getAllByText('Downtime').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Downtime controls arrive in a later slice.')
    ).toBeInTheDocument();
  });

  describe('battle-mode top bar (#1556 S1)', () => {
    it('shows the kicker, round, phase pill, clock and location in encounter mode', () => {
      renderDock();
      expect(screen.getByText('Battle Mode')).toBeInTheDocument();
      expect(screen.getByText('Round 2')).toBeInTheDocument();
      expect(screen.getByText('In progress')).toBeInTheDocument();
      expect(screen.getByText('11:30 AM')).toBeInTheDocument();
      expect(screen.getByText('Sandpoint Cathedral')).toBeInTheDocument();
    });

    it('close affordance links back to the GM dashboard', () => {
      renderDock();
      const close = screen.getByRole('link', { name: 'Close battle mode' });
      expect(close).toHaveAttribute('href', '/gm');
    });

    it('announces the next combatant, wrapping past the end of the order', () => {
      useEncounter.mockReturnValue({
        encounter: encounterWith({
          currentTurnIndex: 1,
          order: [
            { entryId: 'e1', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
            { entryId: 'e2', kind: 'enemy', name: 'Ghoul' },
          ],
        }),
      });
      renderDock();
      expect(screen.getByText('Up next')).toBeInTheDocument();
      // Ghoul is acting (index 1) — the wrap makes Pellias next.
      expect(screen.getByText('Up next').parentElement).toHaveTextContent('Pellias');
    });

    it('setup phase shows the Setup pill and hides round + up-next', () => {
      useEncounter.mockReturnValue({
        encounter: encounterWith({
          phase: 'setup',
          round: 0,
          order: [
            { entryId: 'e1', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
            { entryId: 'e2', kind: 'enemy', name: 'Ghoul' },
          ],
        }),
      });
      renderDock();
      // 'Setup' appears as both the phase pill and the setup pane kicker.
      expect(screen.getAllByText('Setup').length).toBeGreaterThan(0);
      expect(screen.queryByText(/^Round /)).not.toBeInTheDocument();
      expect(screen.queryByText('Up next')).not.toBeInTheDocument();
    });

    it('non-encounter modes drop the phase pill and up-next but keep the clock', () => {
      usePlayMode.mockReturnValue({ mode: 'exploration' });
      useEncounter.mockReturnValue({ encounter: { active: false, phase: 'idle', order: [] } });
      renderDock();
      expect(screen.queryByText('In progress')).not.toBeInTheDocument();
      expect(screen.queryByText('Up next')).not.toBeInTheDocument();
      expect(screen.getByText('11:30 AM')).toBeInTheDocument();
    });
  });

  it('setup phase mounts the initiative panel with the expected PCs (#1537 S1)', () => {
    useEncounter.mockReturnValue({
      encounter: encounterWith({
        phase: 'setup',
        round: 0,
        order: [
          { entryId: 'e1', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
          { entryId: 'e2', kind: 'enemy', name: 'Ghoul' },
          { entryId: 'e3', kind: 'pc', charId: 'AshkaBGosh', name: 'Ashka' },
        ],
      }),
    });
    renderDock();
    expect(screen.getByText('Rolling initiative')).toBeInTheDocument();
    expect(screen.getByTestId('init-panel')).toHaveAttribute('data-count', '2');
    expect(screen.queryByTestId('encounter-skeleton')).not.toBeInTheDocument();
    // During setup the rail shows every PC (no exclusion).
    expect(screen.getByTestId('dock-rail')).toHaveAttribute('data-exclude', '');
  });

  it("mounts the player encounter controls for the active PC's turn", () => {
    useEncounter.mockReturnValue({
      encounter: encounterWith({
        order: [
          { entryId: 'e1', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
          { entryId: 'e2', kind: 'enemy', name: 'Ghoul' },
        ],
      }),
    });
    renderDock();
    expect(screen.getByText('Acting as')).toBeInTheDocument();
    expect(screen.getByTestId('encounter-skeleton')).toHaveTextContent('Pellias');
    expect(screen.getByLabelText('Acting as Pellias')).toBeInTheDocument();
    // The rail excludes the acting PC's entry.
    expect(screen.getByTestId('dock-rail')).toHaveAttribute('data-exclude', 'e1');
  });

  it('follows currentTurnIndex, not the first entry', () => {
    useEncounter.mockReturnValue({
      encounter: encounterWith({
        currentTurnIndex: 1,
        order: [
          { entryId: 'e1', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
          { entryId: 'e2', kind: 'pc', charId: 'AshkaBGosh', name: 'Ashka' },
        ],
      }),
    });
    renderDock();
    expect(screen.getByTestId('encounter-skeleton')).toHaveTextContent('Ashka');
  });

  it('renders the enemy pane on enemy turns (#1531 S2)', () => {
    useEncounter.mockReturnValue({
      encounter: encounterWith({
        currentTurnIndex: 1,
        order: [
          { entryId: 'e1', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
          { entryId: 'e2', kind: 'enemy', name: 'Ghoul' },
        ],
      }),
    });
    renderDock();
    expect(screen.getByTestId('dock-enemy-pane')).toHaveTextContent('Ghoul');
    expect(screen.queryByTestId('encounter-skeleton')).not.toBeInTheDocument();
    // Rail still renders on enemy turns — every PC is an "other" then.
    expect(screen.getByTestId('dock-rail')).toBeInTheDocument();

    // #1537 S1: the GM advances the enemy turn without leaving the dock.
    fireEvent.click(screen.getByRole('button', { name: "End Ghoul's turn" }));
    expect(advanceMock).toHaveBeenCalledWith('Ghoul');
    // Hostile (or unmarked) disposition = the foe tone (#1537 S6).
    expect(screen.getByTestId('dock-enemy-pane')).toHaveAttribute('data-tone', 'foe');
  });

  it('a FRIENDLY no-charId combatant gets the ally-toned pane (#1537 S6)', () => {
    useEncounter.mockReturnValue({
      encounter: encounterWith({
        currentTurnIndex: 1,
        order: [
          { entryId: 'e1', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
          { entryId: 'e2', kind: 'enemy', name: 'Summoned Angel', disposition: 1 },
        ],
      }),
    });
    renderDock();
    expect(screen.getByTestId('dock-enemy-pane')).toHaveAttribute('data-tone', 'ally');
    expect(screen.getByRole('button', { name: "End Summoned Angel's turn" })).toBeInTheDocument();
  });

  it('an unresolved PC entry gets the generic Advance turn control (#1537 S1)', () => {
    useEncounter.mockReturnValue({
      encounter: encounterWith({
        order: [{ entryId: 'e1', kind: 'pc', charId: 'ghost', name: 'Ghost' }],
      }),
    });
    renderDock();
    expect(screen.getByText("Ghost's turn")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Advance turn' }));
    expect(advanceMock).toHaveBeenCalledWith('Ghost');
  });

  it('stubs a PC entry whose charId is not in the roster', () => {
    useEncounter.mockReturnValue({
      encounter: encounterWith({
        order: [{ entryId: 'e1', kind: 'pc', charId: 'ghost', name: 'Ghost' }],
      }),
    });
    renderDock();
    expect(screen.getByText("Ghost's turn")).toBeInTheDocument();
    expect(screen.queryByTestId('encounter-skeleton')).not.toBeInTheDocument();
  });

  it('stubs an empty initiative order', () => {
    renderDock();
    expect(screen.getByText('No combatants')).toBeInTheDocument();
  });

  describe('pin chips (S4)', () => {
    const TWO_PC_ORDER = [
      { entryId: 'e1', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
      { entryId: 'e2', kind: 'enemy', name: 'Ghoul' },
      { entryId: 'e3', kind: 'pc', charId: 'AshkaBGosh', name: 'Ashka' },
    ];

    it('hides the chips outside encounter mode', () => {
      usePlayMode.mockReturnValue({ mode: 'exploration' });
      useEncounter.mockReturnValue({ encounter: { active: false, phase: 'idle', order: [] } });
      renderDock();
      expect(screen.queryByRole('group', { name: 'Stage a character' })).not.toBeInTheDocument();
    });

    it('pinning a PC stages them during an enemy turn, and Follow turn returns to the enemy pane', () => {
      useEncounter.mockReturnValue({
        encounter: encounterWith({ currentTurnIndex: 1, order: TWO_PC_ORDER }),
      });
      renderDock();
      expect(screen.getByTestId('dock-enemy-pane')).toHaveTextContent('Ghoul');

      fireEvent.click(screen.getByRole('button', { name: 'Ashka' }));
      expect(screen.getByTestId('encounter-skeleton')).toHaveTextContent('Ashka');
      expect(screen.getByText('pinned')).toBeInTheDocument();
      // The pin overrides the enemy pane; the staged PC drops out of the rail.
      expect(screen.queryByTestId('dock-enemy-pane')).not.toBeInTheDocument();
      expect(screen.getByTestId('dock-rail')).toHaveAttribute('data-exclude', 'e3');

      fireEvent.click(screen.getByRole('button', { name: 'Follow turn' }));
      expect(screen.getByTestId('dock-enemy-pane')).toHaveTextContent('Ghoul');
      expect(screen.queryByTestId('encounter-skeleton')).not.toBeInTheDocument();
    });

    it('pin overrides turn-follow onto another PC', () => {
      useEncounter.mockReturnValue({
        encounter: encounterWith({ currentTurnIndex: 0, order: TWO_PC_ORDER }),
      });
      renderDock();
      expect(screen.getByTestId('encounter-skeleton')).toHaveTextContent('Pellias');

      fireEvent.click(screen.getByRole('button', { name: 'Ashka' }));
      expect(screen.getByTestId('encounter-skeleton')).toHaveTextContent('Ashka');
      expect(screen.getByTestId('dock-rail')).toHaveAttribute('data-exclude', 'e3');
    });

    it('clicking the active pin chip unpins back to turn-follow', () => {
      useEncounter.mockReturnValue({
        encounter: encounterWith({ currentTurnIndex: 0, order: TWO_PC_ORDER }),
      });
      renderDock();
      fireEvent.click(screen.getByRole('button', { name: 'Ashka' }));
      expect(screen.getByTestId('encounter-skeleton')).toHaveTextContent('Ashka');
      fireEvent.click(screen.getByRole('button', { name: 'Ashka' }));
      expect(screen.getByTestId('encounter-skeleton')).toHaveTextContent('Pellias');
      expect(screen.queryByText('pinned')).not.toBeInTheDocument();
    });

    it('a pin overrides the setup stub so the GM can prep a PC', () => {
      useEncounter.mockReturnValue({
        encounter: encounterWith({ phase: 'setup', round: 0, order: TWO_PC_ORDER }),
      });
      renderDock();
      expect(screen.getByText('Rolling initiative')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Pellias' }));
      expect(screen.getByTestId('encounter-skeleton')).toHaveTextContent('Pellias');
      expect(screen.getByTestId('dock-rail')).toHaveAttribute('data-exclude', 'e1');
    });
  });
});
