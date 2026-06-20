// UseAbilityModal — chained save-damage payload (#281).
// A damaging basic-save spell cast through a Spellshape (Reach Spell) builds its
// damage profile inside ChainedSpellSection and surfaces the entered total +
// rider snapshot through getResults(); the chained addSaveRequest attaches it
// the same way the direct path does, with the spell's own `basic` flag.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAddSaveRequest = vi.fn();

const order = [
  { entryId: 'e-caster', kind: 'pc', charId: 'JadeInferno', name: 'Jade' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { saves: { reflex: 8 } } },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'JadeInferno', name: 'Jade' }], effects: [] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, order, log: [] },
    appendLog: vi.fn(),
    addSaveRequest: mockAddSaveRequest,
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
  useTargeting: () => ({
    targets: ['e-gob'],
    selectable: order,
    isTargeted: (id) => id === 'e-gob',
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
vi.mock('../../hooks/useExploitVulnerability', () => ({
  useExploitVulnerability: () => ({ exploitFor: () => null }),
}));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: () => [[], vi.fn()],
}));
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { inventory: [] } : null),
}));
// Spellshape parents have no roll of their own; only the chained damaging save
// spell (carrying a `defense`) resolves to target-save.
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: (ability) =>
    ability?.defense
      ? { mode: 'target-save', bonus: null, dc: 22, defense: 'reflex' }
      : { mode: 'none', bonus: null, dc: null, defense: null },
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const fireball = {
  id: 'fb', name: 'Fireball', actions: 'Two Actions', range: '500 feet',
  level: 3, defense: 'Reflex', basic: true,
  damageData: { base: '6d6', type: 'fire' },
};
const light = { id: 'li', name: 'Light', actions: 'Two Actions', range: '120 feet', level: 0 };

const reachSpell = {
  name: 'Reach Spell',
  actions: 'One Action',
  traits: ['Concentrate', 'Sorcerer', 'Spellshape'],
  chain: { into: 'spell', cost: 'added', spellFilter: 'has-range' },
};

const jade = { id: 'JadeInferno', name: 'Jade', spellcasting: { spells: [light, fireball] } };
const props = { isOpen: true, onClose: vi.fn(), character: jade, themeColor: '#a0f' };

const requestArg = () => mockAddSaveRequest.mock.calls[0][0];

beforeEach(() => vi.clearAllMocks());

describe('UseAbilityModal — chained save-damage payload (#281)', () => {
  it('attaches the entered total + basic flag to the chained save request', () => {
    render(<UseAbilityModal {...props} ability={reachSpell} verb="Use" />);
    // Chain into the damaging basic-save spell.
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 'fb' } });
    // The save-mode damage panel is rendered inside the section.
    fireEvent.change(screen.getByLabelText(/rolled damage total/i), { target: { value: '28' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    expect(requestArg()).toMatchObject({
      abilityName: 'Reach Spell → Fireball',
      save: 'reflex',
      dc: 22,
      basic: true,
      rank: 3,
      targets: [{ entryId: 'e-gob', name: 'Goblin', saveMod: 8 }],
      damage: { entered: 28, expression: '6d6', typeLabel: 'fire', riders: [] },
    });
    // Crosses the WebSocket — must round-trip as plain JSON.
    const { damage } = requestArg();
    expect(JSON.parse(JSON.stringify(damage))).toEqual(damage);
  });

  it('omits damage when the caster enters no total (bare chained save request)', () => {
    render(<UseAbilityModal {...props} ability={reachSpell} verb="Use" />);
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 'fb' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(requestArg().damage).toBeUndefined();
    expect(requestArg().basic).toBe(true);
  });
});
