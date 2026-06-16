// UseAbilityModal — Lingering Composition consumption (#226-B). A pending
// `lingering` flag on the caster extends the next 1-round composition's effect
// and is then cleared. Without the flag the composition keeps its native 1 round.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSendUpdate = vi.fn();
let mockLingering = null;

const order = [{ entryId: 'e-caster', kind: 'pc', charId: 'Izzy', name: 'Izzy' }];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    // Route the `lingering` key to the controllable flag; effects (and anything
    // else applyAbility reads) stay an empty array.
    getState: (_id, key) => (key === 'lingering' ? mockLingering : []),
    sendUpdate: (...a) => mockSendUpdate(...a),
    subscribe: () => () => {},
  }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'Izzy', name: 'Izzy' }] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 5, month: 2, year: 4725 }, time: { hour: 8, minute: 0, second: 0 } }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, phase: 'in-progress', round: 1, order, log: [] },
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
  useEffects: () => ({ effects: [], removeEffect: vi.fn() }),
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

// Inspire Courage-style 1-round composition with a self effect.
const inspireCourage = {
  id: 'inspire-courage',
  name: 'Inspire Courage',
  actions: 'One Action',
  traits: ['Bard', 'Cantrip', 'Composition', 'Emotion'],
  duration: '1 round',
  effects: [{ effectId: 'inspire-courage', applyTo: 'self', duration: { until: 'rounds', rounds: 1 } }],
};

const character = { id: 'Izzy', name: 'Izzy' };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Cast', character, themeColor: '#0af' };

const effectsCall = () => mockSendUpdate.mock.calls.find(([, key]) => key === 'effects');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockLingering = null;
});

describe('UseAbilityModal — Lingering Composition consumption', () => {
  it('extends the composition to 3 rounds and clears the pending flag', () => {
    mockLingering = { rounds: 3, ts: 1 };
    render(<UseAbilityModal {...props} ability={inspireCourage} />);
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    // round 1 + 3 → expireAt.round 4 (vs native 1 round → 2).
    expect(effectsCall()[2][0].expireAt).toMatchObject({ round: 4 });
    // Flag cleared after consumption.
    expect(mockSendUpdate).toHaveBeenCalledWith('Izzy', 'lingering', null);
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('extended to 3 rounds'))).toBe(true);
  });

  it('keeps the native 1-round duration when no extension is pending', () => {
    mockLingering = null;
    render(<UseAbilityModal {...props} ability={inspireCourage} />);
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    expect(effectsCall()[2][0].expireAt).toMatchObject({ round: 2 });
    // No lingering clear, no extension log.
    expect(mockSendUpdate.mock.calls.some(([, key]) => key === 'lingering')).toBe(false);
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('extended to'))).toBe(false);
  });
});
