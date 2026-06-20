// UseAbilityModal — chained per-action multi-ray (#581, Blazing Bolt).
// A per-action spell cast through a Spellshape fires one ray per chosen action,
// each its own spell-attack roll + damage entry. The chained log records one
// "ray N" line per ray and MAP steps once per ray.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockRecordAttack = vi.fn();

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
    recordAttack: mockRecordAttack,
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
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: (ability) =>
    ability?.traits?.includes('Spellshape')
      ? { mode: 'none', bonus: null, dc: null, defense: null }
      : { mode: 'actor-roll', bonus: 8, dc: null, defense: 'ac' },
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const blazingBolt = {
  id: 'bb', name: 'Blazing Bolt', actions: 'One to Three Actions', range: '60 feet',
  level: 2, traits: ['Attack', 'Fire'], targetDefense: 'ac', rolls: 'per-action',
  variants: [
    { actions: 1, note: '1 ray, 2d6 fire', damage: { base: '2d6', type: 'fire' } },
    { actions: 2, note: '2 rays, 4d6 fire each', damage: { base: '4d6', type: 'fire' } },
    { actions: 3, note: '3 rays, 4d6 fire each', damage: { base: '4d6', type: 'fire' } },
  ],
};

const reachSpell = {
  name: 'Reach Spell',
  actions: 'One Action',
  traits: ['Concentrate', 'Sorcerer', 'Spellshape'],
  chain: { into: 'spell', cost: 'added', spellFilter: 'has-range' },
};

const jade = { id: 'JadeInferno', name: 'Jade', spellcasting: { spells: [blazingBolt] } };
const props = { isOpen: true, onClose: vi.fn(), character: jade, themeColor: '#a0f' };

const loggedLines = () => mockAppendLog.mock.calls.map(([entry]) => entry.text);

beforeEach(() => vi.clearAllMocks());

describe('UseAbilityModal — chained per-action multi-ray (#581)', () => {
  it('2-action Blazing Bolt fires two rays, each logged with its own damage, MAP +2', () => {
    render(<UseAbilityModal {...props} ability={reachSpell} verb="Use" />);
    // Blazing Bolt is the only spell — pick 2 actions.
    fireEvent.click(screen.getByRole('button', { name: '2' }));

    const d20s = screen.getAllByLabelText(/raw d20/i);
    expect(d20s).toHaveLength(2);
    fireEvent.change(d20s[0], { target: { value: '10' } }); // 18 vs AC 15 → Hit
    fireEvent.change(d20s[1], { target: { value: '20' } }); // nat 20 → Critical Hit

    const dmgInputs = screen.getAllByLabelText(/rolled damage total/i);
    expect(dmgInputs).toHaveLength(2);
    // Both rays show the 2-action tier hint.
    expect(screen.getAllByText(/4d6/).length).toBeGreaterThanOrEqual(2);
    fireEvent.change(dmgInputs[0], { target: { value: '14' } });
    fireEvent.change(dmgInputs[1], { target: { value: '14' } });

    fireEvent.click(screen.getByLabelText('confirm-cast'));

    expect(loggedLines()).toContainEqual(
      expect.stringMatching(/ray 1 vs Goblin: 18 → Hit · damage 14/)
    );
    expect(loggedLines()).toContainEqual(
      expect.stringMatching(/ray 2 vs Goblin: .* → Critical Hit · damage 28 \(14 ×2\)/)
    );
    // Each ray is its own attack — MAP steps by the ray count.
    expect(mockRecordAttack).toHaveBeenCalledWith(2);
  });

  it('1-action default fires a single ray and MAP steps by 1', () => {
    render(<UseAbilityModal {...props} ability={reachSpell} verb="Use" />);
    const d20s = screen.getAllByLabelText(/raw d20/i);
    expect(d20s).toHaveLength(1);
    fireEvent.change(d20s[0], { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/rolled damage total/i), { target: { value: '7' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(loggedLines()).toContainEqual(
      expect.stringMatching(/ray 1 vs Goblin: 18 → Hit · damage 7/)
    );
    expect(mockRecordAttack).toHaveBeenCalledWith(1);
  });
});
