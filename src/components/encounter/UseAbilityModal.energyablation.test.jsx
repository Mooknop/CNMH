// UseAbilityModal — Energy Ablation spellshape confirm (#1001 S2). Drives the
// chained-cast self-effect end-to-end: pick a spell + energy type → confirm
// applies a caster resistance effect parametrized by the cast rank, with inline
// modifiers (no static catalog def).

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSendUpdate = vi.fn();

const order = [{ entryId: 'e-caster', kind: 'pc', charId: 'Wizzo', name: 'Wizzo' }];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: vi.fn(() => []),
    sendUpdate: mockSendUpdate,
    subscribe: () => () => {},
  }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'Wizzo', name: 'Wizzo', maxHp: 30 }], effects: [] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 5, month: 2, year: 4725 }, time: { hour: 8, minute: 0, second: 0 } }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, phase: 'in-progress', round: 1, currentTurnIndex: 0, order, log: [] },
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
    slots: { remainingFor: () => 1, spend: vi.fn() },
  }),
}));
vi.mock('../../hooks/useShield', () => ({ useShield: () => ({ raised: false }) }));
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { inventory: [] } : null),
}));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initial) => [initial, vi.fn()],
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const energyAblation = {
  name: 'Energy Ablation',
  actions: 'One Action',
  traits: ['Manipulate', 'Spellshape'],
  chain: {
    into: 'spell',
    modifier: 'Gain resistance to an energy type = the spell rank',
    selfEffect: {
      effectId: 'energy-ablation', name: 'Energy Ablation', stat: 'resistance', amount: 'castRank',
      choose: { key: 'vs', label: 'Energy type', options: ['acid', 'cold', 'electricity', 'fire'] },
      duration: { until: 'rounds', rounds: 1 },
    },
  },
};

const character = {
  id: 'Wizzo',
  name: 'Wizzo',
  maxHp: 30,
  // A rank-3 damaging spell → castRank 3 with no slot options mocked.
  spellcasting: { spells: [{ id: 'fb', name: 'Fireball', actions: 'Two Actions', level: 3 }] },
};
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('UseAbilityModal — Energy Ablation self-effect confirm', () => {
  it('applies a caster resistance effect vs the chosen type = the cast rank', () => {
    render(<UseAbilityModal {...props} ability={energyAblation} />);
    fireEvent.change(screen.getByLabelText('Energy type'), { target: { value: 'fire' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    const effectWrites = mockSendUpdate.mock.calls.filter(([, key]) => key === 'effects');
    expect(effectWrites).toHaveLength(1);
    const [charId, , entries] = effectWrites[0];
    expect(charId).toBe('Wizzo');
    expect(entries[entries.length - 1]).toMatchObject({
      effectId: 'energy-ablation',
      name: 'Energy Ablation (fire)',
      appliedBy: 'Wizzo',
      modifiers: [{ stat: 'resistance', vs: 'fire', amount: 3 }],
    });
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('gains Energy Ablation (fire)'))).toBe(true);
  });

  it('defaults to the first energy type when the caster does not change it', () => {
    render(<UseAbilityModal {...props} ability={energyAblation} />);
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    const effectWrites = mockSendUpdate.mock.calls.filter(([, key]) => key === 'effects');
    expect(effectWrites[0][2].slice(-1)[0].modifiers).toEqual([
      { stat: 'resistance', vs: 'acid', amount: 3 },
    ]);
  });
});
