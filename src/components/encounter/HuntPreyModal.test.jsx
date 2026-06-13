import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockAppendLog = vi.fn();
const mockEncounterState = { active: false, phase: 'idle', order: [] };
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounterState, appendLog: mockAppendLog }),
}));

const mockSpendActions = vi.fn();
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({ spendActions: mockSpendActions }),
}));

const mockDesignate = vi.fn();
vi.mock('../../hooks/useHuntPrey', () => ({
  useHuntPrey: () => ({ prey: null, designate: mockDesignate, clear: vi.fn() }),
}));

import HuntPreyModal from './HuntPreyModal';

const character = { id: 'AshkaBGosh', name: 'Ashka' };
const props = { isOpen: true, onClose: vi.fn(), character, themeColor: '#aaa', actionCost: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mockEncounterState.active = true;
  mockEncounterState.phase = 'in-progress';
  mockEncounterState.order = [
    { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', creatureKey: 'gob' },
    { entryId: 'e-orc', kind: 'enemy', name: 'Orc', creatureKey: 'orc' },
    { entryId: 'e-ash', kind: 'pc', name: 'Ashka', charId: 'AshkaBGosh' },
  ];
});

describe('HuntPreyModal', () => {
  it('renders null when closed', () => {
    const { container } = render(<HuntPreyModal {...props} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists encounter enemies (not PCs)', () => {
    render(<HuntPreyModal {...props} />);
    expect(screen.getByRole('button', { name: 'Goblin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Orc' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ashka' })).not.toBeInTheDocument();
  });

  it('shows a notice when there are no enemies', () => {
    mockEncounterState.order = [{ entryId: 'e-ash', kind: 'pc', name: 'Ashka', charId: 'AshkaBGosh' }];
    render(<HuntPreyModal {...props} />);
    expect(screen.getByText(/No enemies/i)).toBeInTheDocument();
  });

  it('confirm is disabled until an enemy is picked', () => {
    render(<HuntPreyModal {...props} />);
    expect(screen.getByRole('button', { name: /Hunt Prey/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    expect(screen.getByRole('button', { name: /Hunt Prey/ })).not.toBeDisabled();
  });

  it('designates the picked enemy by its rkKey and spends the action', () => {
    const onClose = vi.fn();
    render(<HuntPreyModal {...props} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    fireEvent.click(screen.getByRole('button', { name: /Hunt Prey/ }));
    expect(mockDesignate).toHaveBeenCalledWith({ targetKey: 'gob', targetName: 'Goblin' });
    expect(mockSpendActions).toHaveBeenCalledWith(1, 'Hunt Prey');
    expect(mockAppendLog).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('does not spend an action when actionCost is 0', () => {
    render(<HuntPreyModal {...props} actionCost={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Orc' }));
    fireEvent.click(screen.getByRole('button', { name: /Hunt Prey/ }));
    expect(mockDesignate).toHaveBeenCalledWith({ targetKey: 'orc', targetName: 'Orc' });
    expect(mockSpendActions).not.toHaveBeenCalled();
  });
});
