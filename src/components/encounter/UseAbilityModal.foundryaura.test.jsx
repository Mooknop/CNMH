// UseAbilityModal — Foundry-authoritative aura gating (#455). When an ability's
// foundryEffect is `authoritative` AND the bridge roster is present, casting
// suppresses the app's structured effects[] writes and relies on the foundryEffect
// (aura) + the cnmh_foundryeffects read-back. With no roster, the authored
// all-allies effect applies as the offline fallback.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
let mockSendUpdate;
let mockRoster; // what getState('global','roster') returns

const order = [{ entryId: 'e-caster', kind: 'pc', charId: 'Pellias', name: 'Pellias' }];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: (cid, key) => (cid === 'global' && key === 'roster' ? mockRoster : []),
    sendUpdate: (...args) => mockSendUpdate(...args),
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
  useSyncedState: (key, initial) => [initial, vi.fn()],
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const inspireCourage = {
  id: 'inspire-courage',
  name: 'Inspire Courage',
  actions: 'One Action',
  traits: ['Bard', 'Cantrip', 'Composition'],
  duration: '1 round',
  effects: [{ effectId: 'inspire-courage', applyTo: 'all-allies', duration: { until: 'caster-turn-start' } }],
  foundryEffect: { ref: 'slug:courageous-anthem-aura', applyTo: 'self', authoritative: true },
};

const character = { id: 'Pellias', name: 'Pellias' };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Cast', character, themeColor: '#0af' };

beforeEach(() => {
  vi.clearAllMocks();
  mockSendUpdate = vi.fn();
  mockRoster = [];
});

const keysWritten = () => mockSendUpdate.mock.calls.map(([, key]) => key);

describe('UseAbilityModal — Foundry-authoritative aura (#455)', () => {
  it('with the bridge present: emits the aura, suppresses the app effect write', () => {
    mockRoster = [{ actorId: 'a1', name: 'Pellias' }];
    render(<UseAbilityModal {...props} ability={inspireCourage} />);
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    expect(keysWritten()).toContain('applyeffect');
    expect(keysWritten()).not.toContain('effects');
  });

  it('with no bridge: applies the all-allies effect as the offline fallback', () => {
    mockRoster = [];
    render(<UseAbilityModal {...props} ability={inspireCourage} />);
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    expect(keysWritten()).toContain('effects');
  });
});
