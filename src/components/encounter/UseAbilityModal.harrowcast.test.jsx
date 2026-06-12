// UseAbilityModal — Harrow Casting confirm (#227). Drives the chained-spell
// harrow section end-to-end: drawn suit → confirm applies the suit's
// mechanics (Key ward entry, Shields healing), and a failed DC 11 flat check
// flags the omen for end-of-turn loss.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSendUpdate = vi.fn();
const mockSetOmen = vi.fn();
let mockOmenState = { suit: null, ts: 0 };
let mockHp = { current: 10, max: 30, temp: 0, dying: 0, wounded: 0, doomed: 0 };

const order = [{ entryId: 'e-caster', kind: 'pc', charId: 'JadeInferno', name: 'Jade' }];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: vi.fn((charId, key) => {
      if (key === 'hp') return mockHp;
      return [];
    }),
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
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initial) =>
    String(key).startsWith('cnmh_omen_') ? [mockOmenState, mockSetOmen] : [initial, vi.fn()],
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const harrowCasting = {
  name: 'Harrow Casting',
  actions: 'One Action',
  traits: ['Concentrate', 'Harrower', 'Spellshape'],
  chain: { into: 'spell', cost: 'added', spellFilter: 'any', harrow: true },
};

const character = {
  id: 'JadeInferno',
  name: 'Jade',
  maxHp: 30,
  spellcasting: { spells: [{ id: 'gw', name: 'Glass Wall', actions: 'Two Actions', level: 2 }] },
};
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockOmenState = { suit: null, ts: 0 };
  mockHp = { current: 10, max: 30, temp: 0, dying: 0, wounded: 0, doomed: 0 };
});

describe('UseAbilityModal — Harrow Casting confirm', () => {
  it('Keys with a matching omen applies the +2 ward to the caster and logs the match', () => {
    mockOmenState = { suit: 'Keys', ts: 1 };
    render(<UseAbilityModal {...props} ability={harrowCasting} />);
    fireEvent.click(screen.getByLabelText('drawn-Keys'));
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    const effectWrites = mockSendUpdate.mock.calls.filter(([, key]) => key === 'effects');
    expect(effectWrites).toHaveLength(1);
    const [charId, , entries] = effectWrites[0];
    expect(charId).toBe('JadeInferno');
    expect(entries[0]).toMatchObject({
      effectId: 'harrow-key-ward-2',
      appliedBy: 'JadeInferno',
      expireAt: { boundary: 'turn-start', round: 2, entryId: 'e-caster' },
    });
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('Jade draws Keys — omen match!'))).toBe(true);
  });

  it('a failed DC 11 flat check flags the omen for end-of-turn loss', () => {
    mockOmenState = { suit: 'Stars', ts: 1 };
    render(<UseAbilityModal {...props} ability={harrowCasting} />);
    fireEvent.click(screen.getByLabelText('drawn-Books'));
    fireEvent.change(screen.getByLabelText('harrow flat check d20'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    expect(mockSetOmen).toHaveBeenCalledTimes(1);
    const updater = mockSetOmen.mock.calls[0][0];
    expect(typeof updater).toBe('function');
    expect(updater(mockOmenState)).toMatchObject({ suit: 'Stars', pendingLoss: true });
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('flat check DC 11: 5 (failed)'))).toBe(true);
    expect(texts.some((t) => t.includes('will be lost at the end of their turn'))).toBe(true);
  });

  it('a passed flat check leaves the omen alone', () => {
    mockOmenState = { suit: 'Stars', ts: 1 };
    render(<UseAbilityModal {...props} ability={harrowCasting} />);
    fireEvent.click(screen.getByLabelText('drawn-Books'));
    fireEvent.change(screen.getByLabelText('harrow flat check d20'), { target: { value: '17' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    expect(mockSetOmen).not.toHaveBeenCalled();
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('flat check DC 11: 17 (passed)'))).toBe(true);
  });

  it('Shields applies the entered healing to the caster', () => {
    render(<UseAbilityModal {...props} ability={harrowCasting} />);
    fireEvent.click(screen.getByLabelText('drawn-Shields'));
    fireEvent.change(screen.getByLabelText('harrow healing rolled'), { target: { value: '9' } });
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    const hpWrites = mockSendUpdate.mock.calls.filter(([, key]) => key === 'hp');
    expect(hpWrites).toHaveLength(1);
    expect(hpWrites[0][2]).toMatchObject({ current: 19 });
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('Jade healed 9 HP (Harrow Casting — Shields)'))).toBe(true);
  });

  it('Hammers logs the manual damage rider note', () => {
    render(<UseAbilityModal {...props} ability={harrowCasting} />);
    fireEvent.click(screen.getByLabelText('drawn-Hammers'));
    fireEvent.click(screen.getByLabelText('confirm-cast'));

    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('+2 force damage'))).toBe(true);
  });
});
