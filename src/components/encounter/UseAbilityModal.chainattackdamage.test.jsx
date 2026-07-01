// UseAbilityModal — chained attack-spell damage panel (#571).
// A spell-attack spell cast through a Spellshape (Reach Spell) builds its damage
// profile inside ChainedSpellSection and forwards it to the resolver, which owns
// the damage panel + per-target math. The hit line logs the real total, the same
// way a direct attack cast does.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();

const order = [
  { entryId: 'e-caster', kind: 'pc', charId: 'JadeInferno', name: 'Jade' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { ac: 15 } },
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
// The Spellshape parent has no roll of its own; only the chained spell-attack
// spell resolves to actor-roll.
vi.mock('../../utils/rollResolution', async (importActual) => ({
  ...(await importActual()),
  resolveActionRoll: (ability) =>
    ability?.traits?.includes('Spellshape')
      ? { mode: 'none', bonus: null, dc: null, defense: null }
      : { mode: 'actor-roll', bonus: 8, dc: null, defense: 'ac' },
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const scorchingRay = {
  id: 'scorch', name: 'Scorching Ray', actions: 'Two Actions', range: '120 feet',
  level: 3, traits: ['Attack', 'Fire'], targetDefense: 'ac',
  damageData: { base: '6d6', type: 'fire' },
};
const light = { id: 'li', name: 'Light', actions: 'Two Actions', range: '120 feet', level: 0 };

const reachSpell = {
  name: 'Reach Spell',
  actions: 'One Action',
  traits: ['Concentrate', 'Sorcerer', 'Spellshape'],
  chain: { into: 'spell', cost: 'added', spellFilter: 'has-range' },
};

const jade = { id: 'JadeInferno', name: 'Jade', spellcasting: { spells: [light, scorchingRay] } };
const props = { isOpen: true, onClose: vi.fn(), character: jade, themeColor: '#a0f' };

const loggedLines = () => mockAppendLog.mock.calls.map(([entry]) => entry.text);

beforeEach(() => vi.clearAllMocks());

describe('UseAbilityModal — chained attack damage panel (#571)', () => {
  it('hit on a chained attack spell → damage panel, and the total lands in the log', () => {
    const { container } = render(<UseAbilityModal {...props} ability={reachSpell} verb="Use" />);
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 'scorch' } });
    fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '10' } }); // 10 + 8 = 18 vs AC 15 → Hit
    expect(container.querySelector('.dmg-panel')).not.toBeNull();
    expect(screen.getByText(/6d6/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/rolled damage total/i), { target: { value: '21' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(loggedLines()).toContainEqual(
      expect.stringMatching(/→ Scorching Ray .*vs Goblin: 18 → Hit · damage 21/)
    );
  });

  it('crit doubles the entered total in the chained hit line', () => {
    render(<UseAbilityModal {...props} ability={reachSpell} verb="Use" />);
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 'scorch' } });
    fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '20' } }); // nat 20 → Critical Hit
    fireEvent.change(screen.getByLabelText(/rolled damage total/i), { target: { value: '21' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(loggedLines()).toContainEqual(expect.stringContaining('Critical Hit · damage 42 (21 ×2)'));
  });

  it('miss → no damage panel and no damage suffix in the log', () => {
    const { container } = render(<UseAbilityModal {...props} ability={reachSpell} verb="Use" />);
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 'scorch' } });
    fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '3' } }); // 3 + 8 = 11 vs AC 15 → Miss
    expect(container.querySelector('.dmg-panel')).toBeNull();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(loggedLines().join('\n')).not.toContain('· damage');
  });
});
