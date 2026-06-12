// UseAbilityModal — rider choice (#225). Either/or riders picked at use time
// (the electric Eld powers' "become Charged" vs "Discharge"): section render,
// requiresEffectId gating, and the apply/remove + log wiring on confirm.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSendUpdate = vi.fn();
let mockCharEffects = []; // the caster's cnmh_effects entries

const order = [{ entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Izzy' }];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: vi.fn((id, key) => (key === 'effects' ? mockCharEffects : [])),
    sendUpdate: mockSendUpdate,
    subscribe: () => () => {},
  }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'char-a', name: 'Izzy' }] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 5, month: 2, year: 4725 }, time: { hour: 8, minute: 0, second: 0 } }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, phase: 'in-progress', round: 2, order, log: [] },
    appendLog: mockAppendLog,
    addSaveRequest: vi.fn(),
    removeSaveRequest: vi.fn(),
  }),
}));
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, attacksMade: 0, reactionAvailable: true },
    spendActions: vi.fn(),
    spendReaction: vi.fn(),
    recordAttack: vi.fn(),
  }),
}));
vi.mock('../../hooks/useEffects', () => ({
  useEffects: () => ({ effects: mockCharEffects, removeEffect: vi.fn() }),
}));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({ targets: [], selectable: [], isTargeted: () => false, toggleTarget: vi.fn() }),
}));
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({
    optionsFor: () => [],
    spend: () => ({ label: '' }),
    slots: { remainingFor: () => 0, spend: vi.fn() },
  }),
}));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initial) => [initial, vi.fn()],
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const electricSurge = {
  name: 'Electric Surge',
  actions: 'Two Actions',
  riderChoice: {
    prompt: 'Rider',
    options: [
      { id: 'charge', label: 'Become Charged', appliesEffect: { effectId: 'eld-charged' } },
      {
        id: 'discharge',
        label: 'Discharge',
        note: '40-foot line and the damage increases to d8s',
        removesEffectId: 'eld-charged',
        requiresEffectId: 'eld-charged',
      },
    ],
  },
};

const character = { id: 'char-a', name: 'Izzy' };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#0af' };

beforeEach(() => {
  vi.clearAllMocks();
  mockCharEffects = [];
});

describe('UseAbilityModal — rider choice', () => {
  it('renders the rider options with the gated option disabled', () => {
    render(<UseAbilityModal {...props} ability={electricSurge} />);
    expect(screen.getByText('Rider')).toBeInTheDocument();
    expect(screen.getByLabelText('Become Charged')).toBeEnabled();
    expect(screen.getByLabelText(/Discharge/)).toBeDisabled();
  });

  it('renders no rider section for abilities without a riderChoice', () => {
    render(<UseAbilityModal {...props} ability={{ name: 'Erode', actions: 'Two Actions' }} />);
    expect(screen.queryByText('Rider')).toBeNull();
  });

  it('confirming with the default option applies its effect to the caster', () => {
    render(<UseAbilityModal {...props} ability={electricSurge} />);
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    const call = mockSendUpdate.mock.calls.find(([, key]) => key === 'effects');
    expect(call).toBeDefined();
    expect(call[0]).toBe('char-a');
    expect(call[2]).toHaveLength(1);
    expect(call[2][0]).toMatchObject({ effectId: 'eld-charged', source: 'Electric Surge' });
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts).toContain('Izzy chose Become Charged (Electric Surge)');
  });

  it('with Charged active, Discharge is selectable and consumes the effect', () => {
    mockCharEffects = [{ id: 'e1', effectId: 'eld-charged' }];
    render(<UseAbilityModal {...props} ability={electricSurge} />);
    const discharge = screen.getByLabelText(/Discharge/);
    expect(discharge).toBeEnabled();
    fireEvent.click(discharge);
    // The chosen option's note renders below the picker.
    expect(screen.getByText('40-foot line and the damage increases to d8s')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    const call = mockSendUpdate.mock.calls.find(([, key]) => key === 'effects');
    expect(call[2]).toEqual([]);
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts).toContain('Izzy chose Discharge (Electric Surge) — 40-foot line and the damage increases to d8s');
  });
});
