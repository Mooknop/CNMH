// UseAbilityModal — kinetic aura gating (#228). Routes the cnmh_aura_* key to
// a controllable store so we can drive aura up/down and assert the gate
// section, override checkbox, Channel Elements activation, and overflow
// deactivation on confirm.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockSetAura = vi.fn();
let mockAuraState = { active: false, ts: 0 };

const order = [{ entryId: 'e-caster', kind: 'pc', charId: 'Pellias', name: 'Pellias' }];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
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
// Route the aura key to a controllable store; everything else echoes its initial.
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initial) =>
    key.startsWith('cnmh_aura_') ? [mockAuraState, mockSetAura] : [initial, vi.fn()],
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const channelElements = {
  name: 'Channel Elements',
  actions: 'One Action',
  traits: ['Aura', 'Kineticist', 'Metal', 'Primal'],
};

const shardStrike = {
  name: 'Shard Strike',
  actions: 'Two Actions',
  traits: ['Impulse', 'Kineticist', 'Metal', 'Primal'],
};

const overflowImpulse = {
  name: 'Big Overflow Impulse',
  actions: 'Two Actions',
  traits: ['Impulse', 'Overflow', 'Kineticist'],
};

const character = { id: 'Pellias', name: 'Pellias' };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#0af' };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuraState = { active: false, ts: 0 };
});

describe('UseAbilityModal — kinetic aura gating', () => {
  it('blocks an impulse while the aura is down', () => {
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    expect(screen.getByText('Kinetic Aura')).toBeInTheDocument();
    expect(screen.getByText(/use Channel Elements first/)).toBeInTheDocument();
    expect(screen.getByLabelText('confirm-cast')).toBeDisabled();
  });

  it('override re-enables confirm and tags the log line', () => {
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    fireEvent.click(screen.getByLabelText(/Override \(GM ruling\) — use anyway/));
    const confirm = screen.getByLabelText('confirm-cast');
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('(override — aura inactive)'))).toBe(true);
  });

  it('no gate section while the aura is up', () => {
    mockAuraState = { active: true, ts: 1 };
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    expect(screen.queryByText('Kinetic Aura')).not.toBeInTheDocument();
    expect(screen.getByLabelText('confirm-cast')).toBeEnabled();
  });

  it('Channel Elements is never gated and activates the aura on confirm', () => {
    render(<UseAbilityModal {...props} ability={channelElements} />);
    expect(screen.queryByText('Kinetic Aura')).not.toBeInTheDocument();
    const confirm = screen.getByLabelText('confirm-cast');
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(mockSetAura).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes("kinetic aura activates"))).toBe(true);
  });

  it('confirming an overflow impulse deactivates the aura', () => {
    mockAuraState = { active: true, ts: 1 };
    render(<UseAbilityModal {...props} ability={overflowImpulse} />);
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockSetAura).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('kinetic aura deactivates (overflow)'))).toBe(true);
  });

  it('non-impulse abilities never render the gate', () => {
    render(<UseAbilityModal {...props} ability={{ name: 'Sneak', actions: 'One Action' }} />);
    expect(screen.queryByText('Kinetic Aura')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockSetAura).not.toHaveBeenCalled();
  });
});
