// UseAbilityModal — variable action-cost abilities (#215).
// Drives the unified action-count picker for non-per-action variable abilities
// (Force Barrage, Elemental Blast) and asserts the spend, the variant scaling
// note, and the variant DC adjustment on save requests.

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSpendActions = vi.fn();
const mockRecordAttack = vi.fn();
const mockAddSaveRequest = vi.fn();

// Per-test roll profile — reassigned before render (mode 'none' = no resolver).
let mockRollProfile = { mode: 'none', bonus: 0, defense: null, dc: null };

const enemyOrder = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Jade' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { ac: 15, saves: { fortitude: 8 } } },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'char-a', name: 'Jade' }] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, order: enemyOrder, log: [] },
    appendLog: mockAppendLog,
    addSaveRequest: mockAddSaveRequest,
    removeSaveRequest: vi.fn(),
  }),
}));
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, attacksMade: 0, reactionAvailable: true },
    spendActions: mockSpendActions,
    spendReaction: vi.fn(),
    recordAttack: mockRecordAttack,
  }),
}));
vi.mock('../../hooks/useEffects', () => ({
  useEffects: () => ({ effects: [], removeEffect: vi.fn() }),
}));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({
    targets: ['e-gob'],
    selectable: enemyOrder,
    isTargeted: (id) => id === 'e-gob',
    toggleTarget: vi.fn(),
  }),
}));
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({
    optionsFor: () => [],
    spend: () => ({ label: '' }),
    slots: { remainingFor: () => 0, spend: vi.fn() },
  }),
}));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: () => [[], vi.fn()],
}));
vi.mock('../../utils/rollResolution', async (importActual) => ({
  ...(await importActual()),
  resolveActionRoll: () => mockRollProfile,
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const forceBarrage = {
  id: 'force-barrage',
  name: 'Force Barrage',
  actions: 'One to Three Actions',
  traits: ['Concentrate', 'Force', 'Manipulate'],
  variants: [
    { actions: 1, note: '1 shard' },
    { actions: 2, note: '2 shards' },
    { actions: 3, note: '3 shards' },
  ],
};

const character = { id: 'char-a', name: 'Jade' };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Cast', character, themeColor: '#a0f' };

beforeEach(() => {
  vi.clearAllMocks();
  mockRollProfile = { mode: 'none', bonus: 0, defense: null, dc: null };
});

describe('UseAbilityModal — variable action cost (#215)', () => {
  it('shows the picker for a no-roll variable spell and spends the chosen count', () => {
    render(<UseAbilityModal {...props} ability={forceBarrage} />);
    const group = screen.getByRole('radiogroup', { name: 'Number of actions' });
    fireEvent.click(within(group).getByText('3'));
    expect(screen.getByLabelText('confirm-cast')).toHaveTextContent('Cast (3)');
    expect(screen.getByText('3 shards')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockSpendActions).toHaveBeenCalledWith(3, 'Cast Force Barrage');
    // No attack roll, no MAP increment, no resolver rows.
    expect(mockRecordAttack).not.toHaveBeenCalled();
    expect(screen.queryByTestId('multi-ray-resolver')).not.toBeInTheDocument();
  });

  it('defaults to the range minimum and shows its variant note', () => {
    render(<UseAbilityModal {...props} ability={forceBarrage} />);
    expect(screen.getByLabelText('confirm-cast')).toHaveTextContent('Cast (1)');
    expect(screen.getByText('1 shard')).toBeInTheDocument();
  });

  it('an explicit cost seeds the picker selection but stays changeable', () => {
    render(<UseAbilityModal {...props} ability={forceBarrage} cost={2} />);
    const group = screen.getByRole('radiogroup', { name: 'Number of actions' });
    expect(within(group).getByText('2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('confirm-cast')).toHaveTextContent('Cast (2)');
    fireEvent.click(within(group).getByText('1'));
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockSpendActions).toHaveBeenCalledWith(1, 'Cast Force Barrage');
  });

  it('applies the variant dcDelta to the save request and its preview', () => {
    mockRollProfile = { mode: 'target-save', bonus: 0, defense: 'fortitude', dc: 25 };
    const staunch = {
      id: 'staunch',
      name: 'Staunch Bleeding',
      actions: 'One to Two Actions',
      variants: [
        { actions: 2, note: 'DC reduced by 10', dcDelta: -10 },
      ],
    };
    const { container } = render(<UseAbilityModal {...props} ability={staunch} verb="Use" />);
    const preview = () => container.querySelector('.ct-save-request-preview');
    // Default 1 action: base DC.
    expect(preview()).toHaveTextContent('DC 25');
    const group = screen.getByRole('radiogroup', { name: 'Number of actions' });
    fireEvent.click(within(group).getByText('2'));
    expect(preview()).toHaveTextContent('DC 15');
    expect(screen.getByText('DC reduced by 10')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockAddSaveRequest).toHaveBeenCalledWith(expect.objectContaining({ dc: 15 }));
    expect(mockSpendActions).toHaveBeenCalledWith(2, 'Use Staunch Bleeding');
  });

  it('a variable attack strike spends the picked count but records one attack', () => {
    mockRollProfile = { mode: 'actor-roll', bonus: 9, defense: 'ac', dc: null };
    const metalBlast = {
      name: 'Melee Metal Blast',
      type: 'melee',
      actions: 'One to Two Actions',
      variableActionCount: { min: 1, max: 2 },
      traits: ['Attack', 'Kineticist'],
      attackMod: 11,
      damage: '1d8+4',
      targetDefense: 'ac',
      variants: [
        { actions: 2, note: '+Con status bonus to damage' },
      ],
    };
    render(<UseAbilityModal {...props} ability={metalBlast} verb="Use" cost={1} />);
    const group = screen.getByRole('radiogroup', { name: 'Number of actions' });
    fireEvent.click(within(group).getByText('2'));
    expect(screen.getByText('+Con status bonus to damage')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockSpendActions).toHaveBeenCalledWith(2, 'Use Melee Metal Blast');
    expect(mockRecordAttack).toHaveBeenCalledWith(1);
  });

  it('fixed-cost abilities are unaffected even when variants are present', () => {
    const fixed = {
      name: 'Fireball',
      actions: 'Two Actions',
      traits: ['Fire'],
      variants: [{ actions: 2, note: 'should never show' }],
    };
    render(<UseAbilityModal {...props} ability={fixed} />);
    expect(screen.queryByRole('radiogroup', { name: 'Number of actions' })).not.toBeInTheDocument();
    expect(screen.queryByText('should never show')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockSpendActions).toHaveBeenCalledWith(2, 'Cast Fireball');
  });

  it('reactions never get the picker', () => {
    const reaction = {
      name: 'Weird Parry',
      actions: 'Reaction',
      // Hostile data shape: a variants array on a reaction must not crash or render.
      variants: [{ actions: 1, note: 'nope' }],
    };
    render(<UseAbilityModal {...props} ability={reaction} verb="Use" cost="reaction" />);
    expect(screen.queryByRole('radiogroup', { name: 'Number of actions' })).not.toBeInTheDocument();
  });
});
