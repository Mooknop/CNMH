import React from 'react';
import { render, screen } from '@testing-library/react';
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
import { useContent } from '../../contexts/ContentContext';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useEncounter } from '../../hooks/useEncounter';

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

beforeEach(() => {
  useContent.mockReturnValue({ characters: CHARS, theme: {} });
  usePlayMode.mockReturnValue({ mode: 'encounter' });
  useEncounter.mockReturnValue({ encounter: encounterWith() });
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

  it('shows the setup notice while initiative is being rolled', () => {
    useEncounter.mockReturnValue({
      encounter: encounterWith({ phase: 'setup', round: 0 }),
    });
    render(<GmCommandDock />);
    expect(screen.getByText('Rolling initiative')).toBeInTheDocument();
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

  it('stubs enemy turns with the entry name', () => {
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
    expect(screen.getByText("Ghoul's turn")).toBeInTheDocument();
    expect(screen.queryByTestId('encounter-skeleton')).not.toBeInTheDocument();
    // Rail still renders on enemy turns — every PC is an "other" then.
    expect(screen.getByTestId('dock-rail')).toBeInTheDocument();
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
});
