// UseAbilityModal — catalysts (#1209). Held catalysts whose target spell matches
// the cast are offered as opt-in adds; selecting one consumes it, folds its extra
// actions into the cast cost, and logs its rider effect.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSpendActions = vi.fn();
let mockConsumed = {};
const mockSetConsumed = vi.fn((next) => {
  mockConsumed = typeof next === 'function' ? next(mockConsumed) : next;
});

const order = [{ entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Izzy' }];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'char-a', name: 'Izzy' }] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 5, month: 2, year: 4725 }, time: { hour: 8, minute: 0, second: 0 } }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, phase: 'in-progress', round: 2, order, log: [] },
    appendLog: mockAppendLog,
    addSaveRequest: vi.fn(),
    removeSaveRequest: vi.fn(),
  }),
}));
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, attacksMade: 0, reactionAvailable: true },
    spendActions: mockSpendActions,
    spendReaction: vi.fn(),
    recordAttack: vi.fn(),
  }),
}));
vi.mock('../../hooks/useEffects', () => ({ useEffects: () => ({ effects: [], removeEffect: vi.fn() }) }));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({ targets: [], selectable: [], isTargeted: () => false, toggleTarget: vi.fn() }),
}));
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({
    optionsFor: () => [], // no resource picker → castCost = the spell's action cost
    spend: () => ({ label: '' }),
    slots: { remainingFor: () => 0, spend: vi.fn() },
  }),
}));
// Controlled inventory so eligibility reads exactly the catalysts under test.
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: (c) => (c ? { ...c, inventory: c.inventory || [] } : null),
}));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initial) => {
    if (String(key).startsWith('cnmh_consumed_')) return [mockConsumed, mockSetConsumed];
    return [initial, vi.fn()];
  },
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const blueSalt = { id: 'blue-salt-crystal', name: 'Blue Salt Crystal', uid: 'bs1', quantity: 1, traits: ['Catalyst', 'Consumable', 'Magical', '3rd Party'], catalyst: { catalystFor: 'drown', effect: 'persistent acid = rank' } };
const phoenix = { id: 'phoenix-tail-feather', name: 'Phoenix Tail Feather', uid: 'ph1', quantity: 1, traits: ['Catalyst', 'Consumable'], catalyst: { catalystFor: 'blazing-dive', addActions: 1, effect: 'temp HP 2/rank to allies' } };

const drown = { id: 'drown', name: 'Drown', level: 2, actions: 'Two Actions' };
const blazingDive = { id: 'blazing-dive', name: 'Blazing Dive', level: 3, actions: 'Two Actions' };

const cast = (ability, inventory) => render(
  <UseAbilityModal
    isOpen
    onClose={vi.fn()}
    ability={ability}
    verb="Cast"
    character={{ id: 'char-a', name: 'Izzy', inventory }}
    themeColor="#0af"
  />
);

beforeEach(() => {
  vi.clearAllMocks();
  mockConsumed = {};
});

describe('UseAbilityModal — catalysts', () => {
  it('offers a held catalyst whose target spell matches the cast', () => {
    cast(drown, [blueSalt]);
    expect(screen.getByText('Catalysts')).toBeInTheDocument();
    expect(screen.getByTestId('catalyst-bs1')).toBeInTheDocument();
  });

  it('does not offer a catalyst for a different spell', () => {
    cast(blazingDive, [blueSalt]); // Blue Salt is for drown, not blazing-dive
    expect(screen.queryByText('Catalysts')).toBeNull();
  });

  it('adding a catalyst consumes it and logs its rider effect', () => {
    cast(drown, [blueSalt]);
    fireEvent.click(screen.getByTestId('catalyst-bs1'));
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockConsumed).toEqual({ 'Blue Salt Crystal': 1 });
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => /adds Blue Salt Crystal to Drown — persistent acid = rank/.test(t))).toBe(true);
  });

  it('does not consume a catalyst that was not added', () => {
    cast(drown, [blueSalt]);
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockConsumed).toEqual({});
  });

  it('folds the catalyst extra actions into the cast cost (Phoenix +1)', () => {
    cast(blazingDive, [phoenix]);
    // the +1 action is annotated on the option label
    expect(screen.getByText(/Phoenix Tail Feather \(\+1 action\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('catalyst-ph1'));
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    // 2-action spell + 1 from the catalyst = 3
    expect(mockSpendActions).toHaveBeenCalledWith(3, expect.stringContaining('Blazing Dive'));
  });

  it('a zero-action catalyst does not change the cost', () => {
    cast(drown, [blueSalt]);
    fireEvent.click(screen.getByTestId('catalyst-bs1'));
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockSpendActions).toHaveBeenCalledWith(2, expect.stringContaining('Drown'));
  });
});
