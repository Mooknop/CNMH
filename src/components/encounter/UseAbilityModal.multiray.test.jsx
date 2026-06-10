// UseAbilityModal — multi-ray attack spell integration (issue #234, Blazing Bolt).
// Mocks targeting + roll resolution + MultiRayResolver so we can drive the ray-count
// picker and assert the cast cost, per-ray log lines, and MAP increment.

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSpendActions = vi.fn();
const mockRecordAttack = vi.fn();

const enemyOrder = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Jade' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { ac: 15 } },
  { entryId: 'e-orc', kind: 'enemy', name: 'Orc', defenses: { ac: 18 } },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'char-a', name: 'Jade' }] }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, order: enemyOrder, log: [] },
    appendLog: mockAppendLog,
    addSaveRequest: vi.fn(),
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
// Both enemy targets pre-selected so the resolver section renders.
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({
    targets: ['e-gob', 'e-orc'],
    selectable: enemyOrder,
    isTargeted: (id) => id === 'e-gob' || id === 'e-orc',
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
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: () => ({ mode: 'actor-roll', bonus: 9, defense: 'ac', dc: null }),
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

// Stub MultiRayResolver: echoes the rayCount it received and returns canned per-ray
// results so the modal's logging path can be asserted.
vi.mock('./MultiRayResolver', () => {
  const { forwardRef, useImperativeHandle, createElement } = require('react');
  return {
    default: forwardRef(({ rayCount }, ref) => {
      useImperativeHandle(ref, () => ({
        getResults: () => [
          { rayIndex: 0, results: [{ entryId: 'e-gob', name: 'Goblin', dc: 15, total: 22, degree: 'success' }] },
          { rayIndex: 1, results: [{ entryId: 'e-orc', name: 'Orc', dc: 18, total: 12, degree: 'failure' }] },
          { rayIndex: 2, results: [{ entryId: 'e-gob', name: 'Goblin', dc: 15, total: 30, degree: 'criticalSuccess' }] },
        ],
      }));
      return createElement('div', { 'data-testid': 'multi-ray-resolver' }, `rays=${rayCount}`);
    }),
  };
});

const blazingBolt = {
  id: 'blazing-bolt',
  name: 'Blazing Bolt',
  actions: 'One to Three Actions',
  rolls: 'per-action',
  traits: ['Attack', 'Fire'],
};

const character = { id: 'char-a', name: 'Jade' };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Cast', character, themeColor: '#a0f' };

beforeEach(() => vi.clearAllMocks());

describe('UseAbilityModal — multi-ray (Blazing Bolt)', () => {
  it('defaults to 1 ray / 1 action', () => {
    render(<UseAbilityModal {...props} ability={blazingBolt} />);
    expect(screen.getByTestId('multi-ray-resolver')).toHaveTextContent('rays=1');
    expect(screen.getByLabelText('confirm-cast')).toHaveTextContent('Cast (1)');
  });

  it('shows a ray-count picker for the 1–3 range', () => {
    render(<UseAbilityModal {...props} ability={blazingBolt} />);
    const group = screen.getByRole('radiogroup', { name: 'Number of rays' });
    expect(within(group).getByText('1')).toBeInTheDocument();
    expect(within(group).getByText('2')).toBeInTheDocument();
    expect(within(group).getByText('3')).toBeInTheDocument();
  });

  it('choosing 3 rays renders three rows and sets the cast cost to 3', () => {
    render(<UseAbilityModal {...props} ability={blazingBolt} />);
    const group = screen.getByRole('radiogroup', { name: 'Number of rays' });
    fireEvent.click(within(group).getByText('3'));
    expect(screen.getByTestId('multi-ray-resolver')).toHaveTextContent('rays=3');
    expect(screen.getByLabelText('confirm-cast')).toHaveTextContent('Cast (3)');
  });

  it('logs one line per ray with degree per target on confirm', () => {
    render(<UseAbilityModal {...props} ability={blazingBolt} />);
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts).toContain('Jade cast Blazing Bolt — ray 1 vs Goblin (AC 15): 22 → Hit');
    expect(texts).toContain('Jade cast Blazing Bolt — ray 2 vs Orc (AC 18): 12 → Miss');
    expect(texts).toContain('Jade cast Blazing Bolt — ray 3 vs Goblin (AC 15): 30 → Critical Hit');
  });

  it('spends the chosen action count and raises MAP by the ray count', () => {
    render(<UseAbilityModal {...props} ability={blazingBolt} />);
    const group = screen.getByRole('radiogroup', { name: 'Number of rays' });
    fireEvent.click(within(group).getByText('3'));
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockSpendActions).toHaveBeenCalledWith(3, 'Cast Blazing Bolt');
    expect(mockRecordAttack).toHaveBeenCalledWith(3);
  });

  it('single-roll attack spells are unaffected (one attack recorded, no ray rows)', () => {
    const scorchingRay = { id: 'sr', name: 'Scorching Ray', actions: 'Two Actions', traits: ['Attack', 'Fire'] };
    render(<UseAbilityModal {...props} ability={scorchingRay} />);
    expect(screen.queryByTestId('multi-ray-resolver')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Number of rays' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockRecordAttack).toHaveBeenCalledWith(1);
  });
});
