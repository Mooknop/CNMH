// UseAbilityModal — Split Shot confirm (#227). The chained single-target
// attack spell gains a second target: one roll is compared to both ACs, and
// the designated second target's log line carries the half-damage note.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSendUpdate = vi.fn();
const mockRecordAttack = vi.fn();

const order = [
  { entryId: 'e-caster', kind: 'pc', charId: 'JadeInferno', name: 'Jade' },
  { entryId: 'g1', kind: 'enemy', name: 'Goblin', defenses: { ac: 15 } },
  { entryId: 'g2', kind: 'enemy', name: 'Orc',    defenses: { ac: 17 } },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: vi.fn(() => []),
    sendUpdate: mockSendUpdate,
    subscribe: () => () => {},
  }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'JadeInferno', name: 'Jade', maxHp: 30 }], effects: [] }),
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
    recordAttack: mockRecordAttack,
  }),
}));
vi.mock('../../hooks/useEffects', () => ({
  useEffects: () => ({ effects: [], removeEffect: vi.fn() }),
}));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({
    targets: ['g1', 'g2'],
    selectable: [],
    isTargeted: (id) => id === 'g1' || id === 'g2',
    toggleTarget: vi.fn(),
  }),
}));
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({
    optionsFor: () => [],
    spend: () => ({ label: '' }),
    slots: { remainingFor: () => 1, spend: vi.fn() },
  }),
}));
vi.mock('../../hooks/useShield', () => ({
  useShield: () => ({ raised: false }),
}));
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { inventory: [] } : null),
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const splitShot = {
  name: 'Split Shot',
  actions: 'One Action',
  traits: ['Concentrate', 'Sorcerer', 'Spellshape'],
  chain: {
    into: 'spell',
    cost: 'added',
    spellFilter: 'single-target-attack',
    splitShot: true,
  },
};

// targetDefense 'ac' without a derivable bonus → manual-total resolver input.
const tkProjectile = {
  id: 'tkp',
  name: 'Telekinetic Projectile',
  actions: 'Two Actions',
  range: '30 feet',
  targets: '1 creature',
  targetDefense: 'ac',
  traits: ['Attack', 'Cantrip'],
  level: 0,
};

const jade = {
  id: 'JadeInferno',
  name: 'Jade',
  maxHp: 30,
  spellcasting: { spells: [tkProjectile] },
};

const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character: jade, themeColor: '#a0f' };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('UseAbilityModal — Split Shot confirm', () => {
  it('compares one roll to both ACs and tags the second target with the half-damage note', () => {
    render(<UseAbilityModal {...props} ability={splitShot} />);

    // 16 beats Goblin's AC 15, misses Orc's AC 17 — one roll, two outcomes.
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '16' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) =>
      t.includes('vs Goblin: 16 → Hit') && !t.includes('second target')
    )).toBe(true);
    expect(texts.some((t) =>
      t.includes('vs Orc: 16 → Miss · second target — half damage, no other effects')
    )).toBe(true);
  });

  it('re-designating the second target moves the half-damage note', () => {
    render(<UseAbilityModal {...props} ability={splitShot} />);
    fireEvent.click(screen.getByLabelText('second-target-Goblin'));
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '18' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) =>
      t.includes('vs Goblin: 18 → Hit · second target — half damage, no other effects')
    )).toBe(true);
    expect(texts.some((t) =>
      t.includes('vs Orc: 18 → Hit') && !t.includes('second target')
    )).toBe(true);
  });

  it('counts the split cast as a single attack for MAP', () => {
    render(<UseAbilityModal {...props} ability={splitShot} />);
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '16' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockRecordAttack).toHaveBeenCalledTimes(1);
    expect(mockRecordAttack).toHaveBeenCalledWith(1);
  });
});
