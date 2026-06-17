import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionsList from './ActionsList';

const STANCE_ACTION = { name: 'Dragon Stance', traits: ['Monk', 'Stance'], actionCount: 1 };
const HUNT_PREY_ACTION = { name: 'Hunt Prey', traits: ['Concentrate', 'Ranger'], actionCount: 1 };
const STRIDE_ACTION = { name: 'Stride', traits: ['Move'], actionCount: 1, requiresTarget: false, controller: 'move', moveType: 'stride' };
// A worn healing potion → effective cost 2 (drink 1 + draw 1).
const CONSUMABLE_ITEM = { name: 'Healing Potion', traits: ['Potion'], consumable: { kind: 'healing' }, state: 'worn' };

// ActionGrid is mocked as an inert testid div, plus buttons that fire the onUse
// callback so we can exercise ActionsList.handleUse.
vi.mock('../encounter/commandsheet/ActionGrid', () => ({
  default: ({ onUse }) => (
    <div data-testid="action-grid">
      <button onClick={() => onUse?.(STANCE_ACTION, 1)}>use-stance</button>
      <button onClick={() => onUse?.(HUNT_PREY_ACTION, 1)}>use-hunt-prey</button>
      <button onClick={() => onUse?.(STRIDE_ACTION, 1)}>use-stride</button>
      <button onClick={() => onUse?.(CONSUMABLE_ITEM, 2)}>use-consumable</button>
    </div>
  ),
}));
vi.mock('../inventory/UseConsumableModal', () => ({
  default: ({ item, actionCost, defaultTargetId }) => (
    <div data-testid="consumable-modal">{item.name}:{actionCost}:{defaultTargetId || 'self'}</div>
  ),
}));
vi.mock('../encounter/MoveActionSheet', () => ({
  default: ({ moveType }) => <div data-testid="move-sheet">{moveType}</div>,
}));
vi.mock('../encounter/EncounterDoors', () => ({
  default: () => <div data-testid="encounter-doors" />,
}));
vi.mock('../spells/MagicModal', () => ({ default: () => null }));
vi.mock('../encounter/UseAbilityModal', () => ({ default: () => <div data-testid="use-ability-modal" /> }));
vi.mock('../encounter/HuntPreyModal', () => ({ default: () => <div data-testid="hunt-prey-modal" /> }));
vi.mock('../character-sheet/AnimalCompanionModal', () => ({
  default: ({ isOpen }) => (isOpen ? <div data-testid="companion-modal" /> : null),
}));
vi.mock('../character-sheet/FamiliarModal', () => ({
  default: ({ isOpen }) => (isOpen ? <div data-testid="familiar-modal" /> : null),
}));

vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: () => ({
    flags: {
      hasSpellcasting: false, hasFocusSpells: false, hasInnateSpells: false,
      hasScrolls: false, hasWands: false, hasStaff: false, hasEldPowers: false, hasHarrowing: false,
    },
  }),
}));

const mockUseFocusTarget = vi.fn(() => ({ focusAlly: null, focusEnemy: null }));
vi.mock('../../hooks/useFocusTarget', () => ({
  useFocusTarget: (...args) => mockUseFocusTarget(...args),
}));

const mockAppendLog = vi.fn();
const mockEncounterState = { active: false, phase: 'idle', order: [], log: [], round: 0, currentTurnIndex: 0 };
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounterState, appendLog: mockAppendLog }),
}));

const mockSpendActions = vi.fn();
const mockGrantActions = vi.fn();
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, actionsGranted: 0, reactionAvailable: false, reactionSpent: false, hasStartedFirstTurn: false, actionsLog: [] },
    spendActions: mockSpendActions,
    grantActions: mockGrantActions,
    spendReaction: vi.fn(),
  }),
}));

const mockEnterStance = vi.fn();
vi.mock('../../hooks/useStance', () => ({
  useStance: () => ({ active: false, stanceName: null, enter: mockEnterStance, leave: vi.fn() }),
}));

const mockCharacter = { id: '1', name: 'Test', level: 1, actions: [], reactions: [], freeActions: [] };

afterEach(() => {
  vi.clearAllMocks();
  mockUseFocusTarget.mockReturnValue({ focusAlly: null, focusEnemy: null });
  mockEncounterState.active = false;
  mockEncounterState.phase = 'idle';
});

describe('ActionsList', () => {
  it('renders without crashing', () => {
    expect(() => render(<ActionsList character={mockCharacter} />)).not.toThrow();
  });

  it('renders the Encounter heading', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.getByRole('heading', { name: 'Encounter' })).toBeInTheDocument();
  });

  it('renders the action grid directly (reactions/free live inside it now, #424)', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.getByTestId('action-grid')).toBeInTheDocument();
  });

  it('no longer renders Actions/Reactions/Free section-tabs', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Free Actions' })).not.toBeInTheDocument();
  });

  // ── Stance entry (#224) ──────────────────────────────────────────────────
  it('using a Stance action enters the stance without opening the ability modal', () => {
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'use-stance' }));
    expect(mockEnterStance).toHaveBeenCalledWith('Dragon Stance');
    expect(screen.queryByTestId('use-ability-modal')).not.toBeInTheDocument();
  });

  it('spends an action for a Stance entered during an encounter', () => {
    mockEncounterState.active = true;
    mockEncounterState.phase = 'in-progress';
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'use-stance' }));
    expect(mockEnterStance).toHaveBeenCalledWith('Dragon Stance');
    expect(mockSpendActions).toHaveBeenCalledWith(1, 'Dragon Stance');
  });

  it('does not spend an action for a Stance entered out of encounter', () => {
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'use-stance' }));
    expect(mockEnterStance).toHaveBeenCalledWith('Dragon Stance');
    expect(mockSpendActions).not.toHaveBeenCalled();
  });

  // ── Hunt Prey (#223) ─────────────────────────────────────────────────────
  it('using the Hunt Prey action opens the Hunt Prey modal (not the ability modal)', () => {
    render(<ActionsList character={mockCharacter} />);
    expect(screen.queryByTestId('hunt-prey-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'use-hunt-prey' }));
    expect(screen.getByTestId('hunt-prey-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('use-ability-modal')).not.toBeInTheDocument();
  });

  // ── Movement tile → Foundry controller (#415) ───────────────────────────
  it('using a movement action opens the move sheet, not the ability modal or a bare spend', () => {
    mockEncounterState.active = true;
    mockEncounterState.phase = 'in-progress';
    render(<ActionsList character={mockCharacter} />);
    expect(screen.queryByTestId('move-sheet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'use-stride' }));
    expect(screen.getByTestId('move-sheet')).toHaveTextContent('stride');
    expect(screen.queryByTestId('use-ability-modal')).not.toBeInTheDocument();
    expect(mockSpendActions).not.toHaveBeenCalled(); // the sheet charges actions, not handleUse
  });

  // ── Consumables (#428) ───────────────────────────────────────────────────
  it('using a consumable opens the consumable modal with the effective cost (not the ability modal)', () => {
    mockEncounterState.active = true;
    mockEncounterState.phase = 'in-progress';
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'use-consumable' }));
    // Worn potion → actionCost 2 (drink 1 + draw 1); routed to the consumable flow.
    expect(screen.getByTestId('consumable-modal')).toHaveTextContent('Healing Potion:2');
    expect(screen.queryByTestId('use-ability-modal')).not.toBeInTheDocument();
  });

  it('passes the focused ally to the consumable modal as the target (#434)', () => {
    mockEncounterState.active = true;
    mockEncounterState.phase = 'in-progress';
    mockUseFocusTarget.mockReturnValue({ focusAlly: { charId: 'ally-1' }, focusEnemy: null });
    render(<ActionsList character={mockCharacter} />);
    fireEvent.click(screen.getByRole('button', { name: 'use-consumable' }));
    expect(screen.getByTestId('consumable-modal')).toHaveTextContent('Healing Potion:2:ally-1');
  });

  // ── Command an Animal (#223) ─────────────────────────────────────────────
  const companionCharacter = {
    ...mockCharacter,
    animalCompanion: { name: 'Zevira', type: 'Young Shadow Hound' },
  };

  it('does not show the Companion section for a PC without an animal companion', () => {
    mockEncounterState.active = true;
    mockEncounterState.phase = 'in-progress';
    render(<ActionsList character={mockCharacter} />);
    expect(screen.queryByRole('button', { name: 'Command an Animal' })).not.toBeInTheDocument();
  });

  it('does not show the Companion section out of an encounter', () => {
    render(<ActionsList character={companionCharacter} />);
    expect(screen.queryByRole('button', { name: 'Command an Animal' })).not.toBeInTheDocument();
  });

  it('Command an Animal spends 1 action, grants the companion 2, and opens the companion surface', () => {
    mockEncounterState.active = true;
    mockEncounterState.phase = 'in-progress';
    render(<ActionsList character={companionCharacter} />);
    expect(screen.queryByTestId('companion-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Command an Animal' }));
    expect(mockSpendActions).toHaveBeenCalledWith(1, 'Command an Animal');
    expect(mockGrantActions).toHaveBeenCalledWith(2, 'Command an Animal');
    expect(screen.getByTestId('companion-modal')).toBeInTheDocument();
  });

  // ── Command a familiar (#391) ────────────────────────────────────────────
  const familiarCharacter = {
    ...mockCharacter,
    familiar: { name: 'Squox' },
  };

  it('does not show the Familiar section for a PC without a familiar', () => {
    mockEncounterState.active = true;
    mockEncounterState.phase = 'in-progress';
    render(<ActionsList character={mockCharacter} />);
    expect(screen.queryByRole('button', { name: /command squox/i })).not.toBeInTheDocument();
  });

  it('does not show the Familiar section out of an encounter', () => {
    render(<ActionsList character={familiarCharacter} />);
    expect(screen.queryByRole('button', { name: /command squox/i })).not.toBeInTheDocument();
  });

  it('Command a familiar spends 1 action, grants 2, and opens the familiar surface', () => {
    mockEncounterState.active = true;
    mockEncounterState.phase = 'in-progress';
    render(<ActionsList character={familiarCharacter} />);
    expect(screen.queryByTestId('familiar-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /command squox/i }));
    expect(mockSpendActions).toHaveBeenCalledWith(1, 'Command');
    expect(mockGrantActions).toHaveBeenCalledWith(2, 'Command');
    expect(screen.getByTestId('familiar-modal')).toBeInTheDocument();
  });
});
