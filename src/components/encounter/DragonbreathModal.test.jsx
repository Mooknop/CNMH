import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DragonbreathModal from './DragonbreathModal';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useSessionLog } from '../../hooks/useSessionLog';
import { SessionContext } from '../../contexts/SessionContext';

// Inline dummy modal so queries work without a portal.
vi.mock('../shared/Modal', () => ({
  default: function DummyModal({ isOpen, title, children }) {
    if (!isOpen) return null;
    return <div data-testid="modal"><h2>{title}</h2>{children}</div>;
  },
}));

vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));
vi.mock('../../hooks/useTurnState', () => ({ useTurnState: vi.fn() }));
vi.mock('../../hooks/useSessionLog', () => ({ useSessionLog: vi.fn() }));
// Fixed game clock for the once-per-minute gate (#1246) — the frequency ledger
// itself (useFrequency → useSyncedState → localStorage) runs for real.
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 1, month: 0, year: 4725 },
    time: { hour: 12, minute: 0, second: 0 },
  }),
}));
// useTargeting + the dragonbreath spine run for real.

const vera = { id: 'vera', name: 'Vera' };

const greaterRed = { id: 'db', name: 'Longsword', strikes: [{}], dragonbreath: { tier: 'greater', dragonType: 'Red' } };
const baseMirage = { id: 'db2', name: 'Rapier', strikes: [{}], dragonbreath: { tier: 'base', dragonType: 'Mirage' } };

const order = [
  { entryId: 'e-a', kind: 'enemy', name: 'Ogre', defenses: { ac: 25, saves: { reflex: 12 } } },
  { entryId: 'e-b', kind: 'enemy', name: 'Goblin', defenses: { ac: 18, saves: { reflex: 9 } } },
  { entryId: 'p-1', kind: 'pc', charId: 'vera', name: 'Vera' },
];

let appendLog, appendEvent, spendActions, addSaveRequest;

const session = () => ({
  connected: true, foundryConnected: true,
  getState: () => undefined, getAllState: () => ({}), sendUpdate: vi.fn(), subscribe: () => () => {},
});

const renderModal = (item = greaterRed, { active = true } = {}) => {
  useEncounter.mockReturnValue({
    encounter: { order, active, phase: active ? 'in-progress' : 'idle' },
    appendLog, addSaveRequest,
  });
  useTurnState.mockReturnValue({ spendActions });
  useSessionLog.mockReturnValue({ appendEvent });
  return render(
    <SessionContext.Provider value={session()}>
      <DragonbreathModal isOpen onClose={() => {}} item={item} character={vera} />
    </SessionContext.Provider>
  );
};

beforeEach(() => {
  window.localStorage.clear(); // frequency ledger persists via useSyncedState
  appendLog = vi.fn();
  appendEvent = vi.fn();
  spendActions = vi.fn();
  addSaveRequest = vi.fn();
});

describe('DragonbreathModal', () => {
  it('summarizes the tier dice / DC and offers cone + emanation shapes', () => {
    renderModal();
    expect(screen.getByLabelText('area')).toHaveTextContent('30-ft cone');
    expect(screen.getByRole('button', { name: '30-ft cone' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '5-ft emanation' })).toBeInTheDocument();
    expect(screen.getByText(/6d6 fire · basic Reflex DC 27/)).toBeInTheDocument();
  });

  it('lists only enemies as targets', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Ogre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Goblin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vera' })).not.toBeInTheDocument();
  });

  it('confirm is disabled until at least one target is picked', () => {
    renderModal();
    const breathe = screen.getByTestId('dbm-breathe');
    expect(breathe).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    expect(breathe).not.toBeDisabled();
  });

  it('creates a basic-Reflex save request with the rolled damage and spends 2 actions', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    fireEvent.change(screen.getByLabelText(/Rolled damage/), { target: { value: '21' } });
    fireEvent.click(screen.getByTestId('dbm-breathe'));

    expect(addSaveRequest).toHaveBeenCalledTimes(1);
    const req = addSaveRequest.mock.calls[0][0];
    expect(req).toMatchObject({
      casterId: 'vera', save: 'reflex', dc: 27, basic: true,
      damage: { entered: 21, typeLabel: 'fire', expression: '6d6', riders: [] },
    });
    expect(req.targets.map((t) => t.name)).toEqual(['Ogre', 'Goblin']);
    expect(req.targets[0]).toMatchObject({ entryId: 'e-a', saveMod: 12 });
    expect(spendActions).toHaveBeenCalledWith(2, expect.stringContaining('Unleash Dragonbreath'));
  });

  it('requests saves only (no damage payload) when the roll is left blank', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    fireEvent.click(screen.getByTestId('dbm-breathe'));
    expect(addSaveRequest.mock.calls[0][0].damage).toBeUndefined();
  });

  it('offers a damage-type choice for a multi-option dragon kind', () => {
    renderModal(baseMirage);
    // Mirage = force | mental
    expect(screen.getByRole('button', { name: 'force' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'mental' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'mental' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    fireEvent.change(screen.getByLabelText(/Rolled damage/), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('dbm-breathe'));
    expect(addSaveRequest.mock.calls[0][0].damage.typeLabel).toBe('mental');
  });

  it('logs to the session (not the encounter) outside combat', () => {
    renderModal(greaterRed, { active: false });
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    fireEvent.click(screen.getByTestId('dbm-breathe'));
    expect(appendEvent).toHaveBeenCalledTimes(1);
    expect(spendActions).not.toHaveBeenCalled(); // no action spend outside an active encounter
  });

  it('gates Breathe once per minute — reopening shows the lock; Clear lock reopens it (#1246)', () => {
    const { unmount } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    fireEvent.click(screen.getByTestId('dbm-breathe'));
    unmount();

    // Second open inside the same game minute: blocked section + disabled confirm.
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    expect(screen.getByTestId('dbm-breathe')).toBeDisabled();
    expect(screen.getByText(/Once per minute/)).toBeInTheDocument();

    // GM "Clear lock" drops the ledger records and re-enables the breath.
    fireEvent.click(screen.getByRole('button', { name: /Clear lock/ }));
    expect(screen.getByTestId('dbm-breathe')).not.toBeDisabled();
  });

  it('GM override re-enables Breathe and the log notes the bypass (#1246)', () => {
    const { unmount } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    fireEvent.click(screen.getByTestId('dbm-breathe'));
    unmount();
    appendLog.mockClear();

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    expect(screen.getByTestId('dbm-breathe')).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Override/ }));
    expect(screen.getByTestId('dbm-breathe')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('dbm-breathe'));
    expect(appendLog).toHaveBeenCalledTimes(1);
    expect(appendLog.mock.calls[0][0].text).toContain('(override — frequency)');
  });
});
