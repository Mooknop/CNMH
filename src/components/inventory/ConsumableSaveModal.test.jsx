import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConsumableSaveModal from './ConsumableSaveModal';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useSyncedState } from '../../hooks/useSyncedState';
import { SessionContext } from '../../contexts/SessionContext';

vi.mock('../shared/Modal', () => ({
  default: function DummyModal({ isOpen, title, children }) {
    if (!isOpen) return null;
    return <div data-testid="modal"><h2>{title}</h2>{children}</div>;
  },
}));

vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));
vi.mock('../../hooks/useTurnState', () => ({ useTurnState: vi.fn() }));
vi.mock('../../hooks/useSessionLog', () => ({ useSessionLog: vi.fn() }));
vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
// useTargeting + the consumables helpers run for real.

const vera = { id: 'vera', name: 'Vera' };

const incense = {
  id: 'dbi', name: "Devil's Breath Incense", quantity: 2,
  traits: ['Consumable', 'Divine'],
  consumable: {
    kind: 'save',
    save: {
      defense: 'fortitude', dc: 23,
      conditions: {
        failure: [{ id: 'sickened', value: 1 }],
        criticalFailure: [{ id: 'sickened', value: 2 }],
      },
      note: 'Each creature within 10 feet attempts the save.',
    },
  },
};

const order = [
  { entryId: 'e-a', kind: 'enemy', name: 'Ogre', defenses: { ac: 25, saves: { fortitude: 14 } } },
  { entryId: 'e-b', kind: 'enemy', name: 'Goblin', defenses: { ac: 18, saves: { fortitude: 8 } } },
  { entryId: 'p-1', kind: 'pc', charId: 'vera', name: 'Vera' },
];

let appendLog, appendEvent, spendActions, addSaveRequest, consumed, setConsumed;

const session = () => ({
  connected: true, foundryConnected: true,
  getState: () => undefined, getAllState: () => ({}), sendUpdate: vi.fn(), subscribe: () => () => {},
});

const renderModal = (item = incense, { active = true } = {}) => {
  useEncounter.mockReturnValue({
    encounter: { order, active, phase: active ? 'in-progress' : 'idle' },
    appendLog, addSaveRequest,
  });
  useTurnState.mockReturnValue({ spendActions });
  useSessionLog.mockReturnValue({ appendEvent });
  useSyncedState.mockImplementation(() => [consumed, setConsumed]);
  return render(
    <SessionContext.Provider value={session()}>
      <ConsumableSaveModal isOpen onClose={() => {}} item={item} character={vera} actionCost={1} />
    </SessionContext.Provider>
  );
};

beforeEach(() => {
  appendLog = vi.fn();
  appendEvent = vi.fn();
  spendActions = vi.fn();
  addSaveRequest = vi.fn();
  consumed = {};
  setConsumed = vi.fn((next) => { consumed = typeof next === 'function' ? next(consumed) : next; });
});

describe('ConsumableSaveModal (#1085)', () => {
  it('summarizes the save and lists only enemies as targets', () => {
    renderModal();
    expect(screen.getByText(/Fortitude DC 23/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ogre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Goblin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vera' })).not.toBeInTheDocument();
  });

  it('confirm is disabled until at least one target is picked', () => {
    renderModal();
    const use = screen.getByRole('button', { name: /Use \(1 act\)/ });
    expect(use).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    expect(use).not.toBeDisabled();
  });

  it('emits a save request with per-degree conditions, consumes one, and spends the action', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    fireEvent.click(screen.getByRole('button', { name: /Use \(1 act\)/ }));

    expect(addSaveRequest).toHaveBeenCalledTimes(1);
    const req = addSaveRequest.mock.calls[0][0];
    expect(req).toMatchObject({
      casterId: 'vera', abilityName: "Devil's Breath Incense",
      save: 'fortitude', dc: 23, basic: false,
      conditions: {
        failure: [{ id: 'sickened', value: 1 }],
        criticalFailure: [{ id: 'sickened', value: 2 }],
      },
    });
    expect(req.damage).toBeUndefined();
    expect(req.targets.map((t) => t.name)).toEqual(['Ogre', 'Goblin']);
    expect(req.targets[0]).toMatchObject({ entryId: 'e-a', saveMod: 14 });

    expect(consumed).toEqual({ "Devil's Breath Incense": 1 });
    expect(spendActions).toHaveBeenCalledWith(1, expect.stringContaining("Devil's Breath Incense"));
  });

  it('carries a rolled-damage payload only for a damaging save consumable', () => {
    const bomb = {
      ...incense, name: 'Alchemical Vapor', quantity: 1,
      consumable: { kind: 'save', save: { defense: 'reflex', dc: 20, basic: true, damage: { dice: '4d6', type: 'acid' } } },
    };
    renderModal(bomb);
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    fireEvent.change(screen.getByLabelText('rolled damage'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /Use \(1 act\)/ }));

    const req = addSaveRequest.mock.calls[0][0];
    expect(req).toMatchObject({ save: 'reflex', dc: 20, basic: true });
    expect(req.damage).toMatchObject({ entered: 15, expression: '4d6', typeLabel: 'acid', riders: [] });
  });
});
