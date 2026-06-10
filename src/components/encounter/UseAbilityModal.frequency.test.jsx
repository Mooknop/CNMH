// UseAbilityModal — frequency gating (#218). Mocks the synced ledger so we can
// drive locked/unlocked states and assert the lock note, override checkbox,
// clear-lock button, and that uses are recorded on confirm.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';
import { toGameSeconds } from '../../utils/gameTime';

const mockAppendLog = vi.fn();
const mockSetLedger = vi.fn();
let mockLedger = {};

const GAME_DATE = { day: 5, month: 2, year: 4725 };
const GAME_TIME = { hour: 8, minute: 0, second: 0 };
const NOW = toGameSeconds({ ...GAME_DATE, ...GAME_TIME });

const order = [{ entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Izzy' }];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'char-a', name: 'Izzy' }] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: GAME_DATE, time: GAME_TIME }),
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
// Route the frequency ledger key to a controllable store; everything else
// (conditions) just echoes its initial value.
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initial) =>
    key.startsWith('cnmh_freq_') ? [mockLedger, mockSetLedger] : [initial, vi.fn()],
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const eldPower = {
  name: 'Entropic Lash',
  actions: 'One Action',
  frequencyRule: { per: 'hour', uses: 1 },
};

const character = { id: 'char-a', name: 'Izzy' };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#0af' };

beforeEach(() => {
  vi.clearAllMocks();
  mockLedger = {};
});

describe('UseAbilityModal — frequency gating', () => {
  it('renders no frequency section and records the use for an available ability', () => {
    render(<UseAbilityModal {...props} ability={eldPower} />);
    expect(screen.queryByText('Frequency')).not.toBeInTheDocument();
    const confirm = screen.getByLabelText('confirm-cast');
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(mockSetLedger).toHaveBeenCalledTimes(1);
    const next = mockSetLedger.mock.calls[0][0](mockLedger);
    expect(next['entropic-lash']).toHaveLength(1);
    expect(next['entropic-lash'][0]).toMatchObject({ gameSecs: NOW, per: 'hour', round: 2, entryId: 'e-caster' });
  });

  it('locks a used ability: note shown, confirm disabled', () => {
    mockLedger = { 'entropic-lash': [{ gameSecs: NOW - 23 * 60, realTs: 1, per: 'hour' }] };
    render(<UseAbilityModal {...props} ability={eldPower} />);
    expect(screen.getByText('Frequency')).toBeInTheDocument();
    expect(screen.getByText(/Once per hour — used 23m ago, available at/)).toBeInTheDocument();
    expect(screen.getByLabelText('confirm-cast')).toBeDisabled();
  });

  it('override re-enables confirm, records the use, and tags the log line', () => {
    mockLedger = { 'entropic-lash': [{ gameSecs: NOW - 23 * 60, realTs: 1, per: 'hour' }] };
    render(<UseAbilityModal {...props} ability={eldPower} />);
    fireEvent.click(screen.getByLabelText(/Override \(GM ruling\) — use anyway/));
    const confirm = screen.getByLabelText('confirm-cast');
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(mockSetLedger).toHaveBeenCalledTimes(1);
    const texts = mockAppendLog.mock.calls.map((c) => c[0].text);
    expect(texts.some((t) => t.includes('(override — frequency)'))).toBe(true);
  });

  it('clear lock drops the ledger entry', () => {
    mockLedger = { 'entropic-lash': [{ gameSecs: NOW - 23 * 60, realTs: 1, per: 'hour' }] };
    render(<UseAbilityModal {...props} ability={eldPower} />);
    fireEvent.click(screen.getByText('Clear lock (GM ruling)'));
    expect(mockSetLedger).toHaveBeenCalledTimes(1);
    const next = mockSetLedger.mock.calls[0][0](mockLedger);
    expect(next['entropic-lash']).toBeUndefined();
  });

  it('Flourish abilities lock for the rest of the turn', () => {
    const flurry = { name: 'Flurry of Blows', actions: '1', traits: ['Flourish', 'Monk'] };
    mockLedger = {
      'flurry-of-blows': [{ gameSecs: NOW - 6, realTs: 1, per: 'turn', round: 2, entryId: 'e-caster' }],
    };
    render(<UseAbilityModal {...props} ability={flurry} />);
    expect(screen.getByText('Once per turn — already used this turn')).toBeInTheDocument();
    expect(screen.getByLabelText('confirm-cast')).toBeDisabled();
  });

  it('abilities without a frequency never touch the ledger', () => {
    const strike = { name: 'Sneak', actions: 'One Action' };
    render(<UseAbilityModal {...props} ability={strike} />);
    expect(screen.queryByText('Frequency')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('confirm-cast'));
    expect(mockSetLedger).not.toHaveBeenCalled();
  });
});
