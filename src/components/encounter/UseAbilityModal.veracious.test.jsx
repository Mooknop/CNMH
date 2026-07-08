// UseAbilityModal — Veracious Spell clear-on-cast (#967 R7 / #974). The armed
// power-ring bonus applies to the NEXT spell attack, so confirming any cast
// consumes the armed state; non-cast verbs and an unarmed ring never write.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSetVeracious = vi.fn();
let mockVeraciousState; // cnmh_veracious_<charId>
let mockInvested;       // cnmh_invested_<charId>

const order = [{ entryId: 'e-caster', kind: 'pc', charId: 'Pellias', name: 'Pellias' }];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: () => [],
    sendUpdate: vi.fn(),
    subscribe: () => () => {},
  }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'Pellias', name: 'Pellias' }] }),
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
  useSyncedState: (key, initial) => {
    if (key.startsWith('cnmh_veracious_')) return [mockVeraciousState, mockSetVeracious];
    if (key.startsWith('cnmh_invested_')) return [mockInvested, vi.fn()];
    return [typeof initial === 'function' ? initial() : initial, vi.fn()];
  },
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const shieldSpell = {
  id: 'shield-spell',
  name: 'Shield',
  actions: 'One Action',
  traits: ['Cantrip', 'Abjuration'],
};

// An invested power ring in the caster's inventory, so useVeracious finds it.
const character = {
  id: 'Pellias',
  name: 'Pellias',
  level: 5,
  abilities: {},
  inventory: [{ uid: 'pr1', name: 'Power Ring', powerRing: true, itemBonus: 2, weight: 0, state: 'worn', traits: ['Invested', 'Magical'] }],
};
const props = { isOpen: true, onClose: vi.fn(), character, themeColor: '#0af' };

beforeEach(() => {
  vi.clearAllMocks();
  mockVeraciousState = { armed: false, ts: 0 };
  mockInvested = { pr1: true };
});

describe('UseAbilityModal — Veracious clear-on-cast (#974)', () => {
  it('confirming a cast disarms an armed Veracious Spell', () => {
    mockVeraciousState = { armed: true, ts: 1 };
    render(<UseAbilityModal {...props} verb="Cast" ability={shieldSpell} />);
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    expect(mockSetVeracious).toHaveBeenCalledWith(expect.objectContaining({ armed: false }));
  });

  it('confirming a cast while unarmed writes nothing', () => {
    render(<UseAbilityModal {...props} verb="Cast" ability={shieldSpell} />);
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    expect(mockSetVeracious).not.toHaveBeenCalled();
  });

  it('a non-cast verb leaves the armed state alone', () => {
    mockVeraciousState = { armed: true, ts: 1 };
    render(<UseAbilityModal {...props} verb="Use" ability={{ ...shieldSpell, name: 'Battle Medicine', traits: ['General'] }} />);
    fireEvent.click(screen.getByLabelText('confirm-cast')); // label is verb-agnostic



    expect(mockSetVeracious).not.toHaveBeenCalled();
  });
});
