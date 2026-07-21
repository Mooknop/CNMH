import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GmCommandDock from './GmCommandDock';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/usePlayMode', () => ({ usePlayMode: vi.fn() }));
vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));
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
  default: function DummyDockEnemyPane({ entry }) {
    return <div data-testid="dock-enemy-pane">{entry.name}</div>;
  },
}));
vi.mock('../../hooks/useAdvanceTurn', () => ({ useAdvanceTurn: vi.fn() }));
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
    render(<GmCommandDock />);
    expect(screen.getByText('Exploration')).toBeInTheDocument();
    expect(screen.queryByTestId('encounter-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dock-rail')).not.toBeInTheDocument();
  });

  it('stubs downtime mode', () => {
    usePlayMode.mockReturnValue({ mode: 'downtime' });
    useEncounter.mockReturnValue({ encounter: { active: false, phase: 'idle', order: [] } });
    render(<GmCommandDock />);
    expect(screen.getByText('Downtime')).toBeInTheDocument();
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
    render(<GmCommandDock />);
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
    render(<GmCommandDock />);
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
    render(<GmCommandDock />);
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
    render(<GmCommandDock />);
    expect(screen.getByTestId('dock-enemy-pane')).toHaveTextContent('Ghoul');
    expect(screen.queryByTestId('encounter-skeleton')).not.toBeInTheDocument();
    // Rail still renders on enemy turns — every PC is an "other" then.
    expect(screen.getByTestId('dock-rail')).toBeInTheDocument();

    // #1537 S1: the GM advances the enemy turn without leaving the dock.
    fireEvent.click(screen.getByRole('button', { name: "End Ghoul's turn" }));
    expect(advanceMock).toHaveBeenCalledWith('Ghoul');
  });

  it('an unresolved PC entry gets the generic Advance turn control (#1537 S1)', () => {
    useEncounter.mockReturnValue({
      encounter: encounterWith({
        order: [{ entryId: 'e1', kind: 'pc', charId: 'ghost', name: 'Ghost' }],
      }),
    });
    render(<GmCommandDock />);
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
    render(<GmCommandDock />);
    expect(screen.getByText("Ghost's turn")).toBeInTheDocument();
    expect(screen.queryByTestId('encounter-skeleton')).not.toBeInTheDocument();
  });

  it('stubs an empty initiative order', () => {
    render(<GmCommandDock />);
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
      render(<GmCommandDock />);
      expect(screen.queryByRole('group', { name: 'Stage a character' })).not.toBeInTheDocument();
    });

    it('pinning a PC stages them during an enemy turn, and Follow turn returns to the enemy pane', () => {
      useEncounter.mockReturnValue({
        encounter: encounterWith({ currentTurnIndex: 1, order: TWO_PC_ORDER }),
      });
      render(<GmCommandDock />);
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
      render(<GmCommandDock />);
      expect(screen.getByTestId('encounter-skeleton')).toHaveTextContent('Pellias');

      fireEvent.click(screen.getByRole('button', { name: 'Ashka' }));
      expect(screen.getByTestId('encounter-skeleton')).toHaveTextContent('Ashka');
      expect(screen.getByTestId('dock-rail')).toHaveAttribute('data-exclude', 'e3');
    });

    it('clicking the active pin chip unpins back to turn-follow', () => {
      useEncounter.mockReturnValue({
        encounter: encounterWith({ currentTurnIndex: 0, order: TWO_PC_ORDER }),
      });
      render(<GmCommandDock />);
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
      render(<GmCommandDock />);
      expect(screen.getByText('Rolling initiative')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Pellias' }));
      expect(screen.getByTestId('encounter-skeleton')).toHaveTextContent('Pellias');
      expect(screen.getByTestId('dock-rail')).toHaveAttribute('data-exclude', 'e1');
    });
  });
});
