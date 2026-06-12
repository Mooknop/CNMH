// UseAbilityModal — blood magic (#227). Casting a bloodline-flagged spell
// (directly, or as the spell a Spellshape chains into) prompts the Imperial
// blood magic choice and stamps the picked +1 status effect on the caster
// until the start of her next turn.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSendUpdate = vi.fn();

const order = [{ entryId: 'e-caster', kind: 'pc', charId: 'JadeInferno', name: 'Jade' }];

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
vi.mock('../../hooks/useShield', () => ({
  useShield: () => ({ raised: false }),
}));
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { inventory: [] } : null),
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const bloodline = {
  name: 'Imperial',
  blood_magic: 'Until the start of your next turn, you gain +1 to either your AC or to Saving Throws.',
};

const forceBarrage = { id: 'fb', name: 'Force Barrage', actions: 'One Action', bloodline: true, level: 1 };
const light        = { id: 'li', name: 'Light',         actions: 'Two Actions', level: 0 };

const jade = {
  id: 'JadeInferno',
  name: 'Jade',
  maxHp: 30,
  spellcasting: { bloodline, spells: [light, forceBarrage] },
};

const props = { isOpen: true, onClose: vi.fn(), character: jade, themeColor: '#a0f' };

const effectWrites = () => mockSendUpdate.mock.calls.filter(([, key]) => key === 'effects');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('UseAbilityModal — blood magic (direct cast)', () => {
  it('shows the picker for a bloodline spell and applies the AC ward by default', () => {
    render(<UseAbilityModal {...props} ability={forceBarrage} verb="Cast" />);
    expect(screen.getByText('Blood Magic (Imperial)')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Blood magic choice' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('confirm-cast'));
    const writes = effectWrites();
    expect(writes).toHaveLength(1);
    const [charId, , entries] = writes[0];
    expect(charId).toBe('JadeInferno');
    expect(entries[0]).toMatchObject({
      effectId: 'imperial-blood-magic-ac',
      appliedBy: 'JadeInferno',
      expireAt: { boundary: 'turn-start', round: 2, entryId: 'e-caster' },
    });
  });

  it('applies the saves ward when picked', () => {
    render(<UseAbilityModal {...props} ability={forceBarrage} verb="Cast" />);
    fireEvent.click(screen.getByLabelText(/saving throws/));
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(effectWrites()[0][2][0]).toMatchObject({ effectId: 'imperial-blood-magic-saves' });
  });

  it('does not prompt for a non-bloodline spell', () => {
    render(<UseAbilityModal {...props} ability={light} verb="Cast" />);
    expect(screen.queryByText(/Blood Magic/)).toBeNull();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(effectWrites()).toHaveLength(0);
  });

  it('does not prompt for a caster without blood magic', () => {
    const noBloodline = { ...jade, spellcasting: { spells: [forceBarrage] } };
    render(<UseAbilityModal {...props} character={noBloodline} ability={forceBarrage} verb="Cast" />);
    expect(screen.queryByText(/Blood Magic/)).toBeNull();
  });
});

describe('UseAbilityModal — blood magic (chained cast)', () => {
  const reachSpell = {
    name: 'Reach Spell',
    actions: 'One Action',
    traits: ['Concentrate', 'Sorcerer', 'Spellshape'],
    chain: { into: 'spell', cost: 'added', spellFilter: 'any' },
  };

  it('prompts and applies when the chained spell is bloodline-flagged', () => {
    render(<UseAbilityModal {...props} ability={reachSpell} verb="Use" />);
    // Default chained pick is Light (first spell) — no prompt yet.
    expect(screen.queryByText(/Blood Magic/)).toBeNull();

    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 'fb' } });
    expect(screen.getByText('Blood Magic (Imperial)')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(effectWrites()[0][2][0]).toMatchObject({
      effectId: 'imperial-blood-magic-ac',
      expireAt: { boundary: 'turn-start', round: 2, entryId: 'e-caster' },
    });
  });

  it('does not apply when the chained spell is not bloodline-flagged', () => {
    render(<UseAbilityModal {...props} ability={reachSpell} verb="Use" />);
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(effectWrites()).toHaveLength(0);
  });
});
