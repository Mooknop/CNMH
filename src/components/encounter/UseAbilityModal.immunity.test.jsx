// UseAbilityModal — target immunity timers (#218). Mocks the session effect
// store so we can drive an immune / not-immune target and assert the immunity
// note, confirm gating + override, and that confirm stamps the immunity.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';
import { toGameSeconds } from '../../utils/gameTime';

const mockAppendLog = vi.fn();
const effectStore = {}; // charId -> effects[]
const mockSendUpdate = vi.fn((charId, key, value) => {
  if (key === 'effects') effectStore[charId] = value;
});
const mockGetState = vi.fn((charId, key) => (key === 'effects' ? effectStore[charId] : undefined));

const GAME_DATE = { day: 5, month: 2, year: 4725 };
const GAME_TIME = { hour: 8, minute: 0, second: 0 };
const NOW = toGameSeconds({ ...GAME_DATE, ...GAME_TIME });

const order = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-p', name: 'Pellias' },
  { entryId: 'e-ally', kind: 'pc', charId: 'char-a', name: 'Ashka' },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate, subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [
    { id: 'char-p', name: 'Pellias' },
    { id: 'char-a', name: 'Ashka' },
  ] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: GAME_DATE, time: GAME_TIME }),
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
// Ashka (the ally) is the picked target.
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({
    targets: ['e-ally'],
    selectable: order,
    isTargeted: (id) => id === 'e-ally',
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
vi.mock('../../hooks/useFrequency', () => ({
  useFrequency: () => ({ gateFor: () => ({ available: true }), record: vi.fn(), clear: vi.fn() }),
}));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initial) => [initial, vi.fn()],
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const guidance = {
  id: 'guidance',
  name: 'Guidance',
  actions: 'One Action',
  immunity: { duration: { value: 1, unit: 'hour' } },
};

const character = { id: 'char-p', name: 'Pellias' };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Cast', character, themeColor: '#fa0' };

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(effectStore).forEach((k) => delete effectStore[k]);
});

describe('UseAbilityModal — target immunity', () => {
  it('stamps immunity on the target when not yet immune', () => {
    render(<UseAbilityModal {...props} ability={guidance} />);
    expect(screen.queryByText('Immunity')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    const eff = effectStore['char-a'];
    expect(eff).toHaveLength(1);
    expect(eff[0]).toMatchObject({
      effectId: 'ability-immunity',
      abilityKey: 'guidance',
      appliedBy: 'char-p',
      expireAtSecs: NOW + 3600,
    });
  });

  it('shows an immunity note and disables confirm when the target is already immune', () => {
    effectStore['char-a'] = [{
      id: 'x', effectId: 'ability-immunity', abilityKey: 'guidance', appliedBy: 'char-p', expireAtSecs: NOW + 1800,
    }];
    render(<UseAbilityModal {...props} ability={guidance} />);
    expect(screen.getByText('Immunity')).toBeInTheDocument();
    expect(screen.getByText(/Ashka is immune/)).toBeInTheDocument();
    expect(screen.getByLabelText('confirm-cast')).toBeDisabled();
  });

  it('override re-enables confirm when all targets are immune', () => {
    effectStore['char-a'] = [{
      id: 'x', effectId: 'ability-immunity', abilityKey: 'guidance', appliedBy: 'char-p', expireAtSecs: NOW + 1800,
    }];
    render(<UseAbilityModal {...props} ability={guidance} />);
    fireEvent.click(screen.getByLabelText(/Override \(GM ruling\) — use anyway/));
    expect(screen.getByLabelText('confirm-cast')).toBeEnabled();
  });

  it('does not re-stamp immunity for an already-immune target', () => {
    effectStore['char-a'] = [{
      id: 'x', effectId: 'ability-immunity', abilityKey: 'guidance', appliedBy: 'char-p', expireAtSecs: NOW + 1800,
    }];
    render(<UseAbilityModal {...props} ability={guidance} />);
    fireEvent.click(screen.getByLabelText(/Override \(GM ruling\) — use anyway/));
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    // sendUpdate('effects') is never called — the target stays as seeded.
    expect(mockSendUpdate.mock.calls.filter((c) => c[1] === 'effects')).toHaveLength(0);
  });
});
