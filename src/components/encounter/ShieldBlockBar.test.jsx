import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

let mockShield;
const mockLowerShield = vi.fn();
const mockApplyBlock = vi.fn();
vi.mock('../../hooks/useShield', () => ({
  useShield: () => ({ ...mockShield, lowerShield: mockLowerShield, applyBlock: mockApplyBlock }),
}));

let mockTurnState;
const mockSpendReaction = vi.fn();
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({ turnState: mockTurnState, spendReaction: mockSpendReaction }),
}));

const mockAppendLog = vi.fn();
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ appendLog: mockAppendLog }),
}));

import ShieldBlockBar from './ShieldBlockBar';

beforeEach(() => {
  mockShield = {
    heldShield: { uid: 'u1', name: 'Steel Shield', shield: { hardness: 5, hp: 20 } },
    raised: true,
    broken: false,
  };
  mockTurnState = { hasStartedFirstTurn: true, reactionAvailable: true, reactionSpent: false };
});

const setup = () =>
  render(<ShieldBlockBar charId="Pellias" characterName="Pellias" inventory={[]} />);

describe('ShieldBlockBar', () => {
  it('renders nothing when the shield is not raised', () => {
    mockShield.raised = false;
    const { container } = setup();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing without a held shield', () => {
    mockShield.heldShield = null;
    const { container } = setup();
    expect(container.firstChild).toBeNull();
  });

  it('blocking runs applyBlock, spends the reaction, and logs the split', () => {
    mockApplyBlock.mockReturnValue({ prevented: 5, shieldHpAfter: 13, broken: false });
    setup();
    fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText('Shield Block'));

    expect(mockApplyBlock).toHaveBeenCalledWith(12);
    expect(mockSpendReaction).toHaveBeenCalledWith('Shield Block');
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      charId: 'Pellias',
      text: expect.stringContaining('5 prevented, shield → 13 HP'),
    }));
    expect(screen.getByLabelText('Shield Block damage')).toHaveValue(null); // cleared
    expect(mockLowerShield).not.toHaveBeenCalled();
  });

  it('a breaking block lowers the shield and logs the break', () => {
    mockApplyBlock.mockReturnValue({ prevented: 5, shieldHpAfter: 0, broken: true });
    setup();
    fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '40' } });
    fireEvent.click(screen.getByLabelText('Shield Block'));

    expect(mockLowerShield).toHaveBeenCalled();
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('shield broke!'),
    }));
  });

  it('is disabled once the reaction is spent', () => {
    mockTurnState = { ...mockTurnState, reactionSpent: true };
    setup();
    fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
    expect(screen.getByLabelText('Shield Block')).toBeDisabled();
  });

  it('is disabled before the PC has started their first turn', () => {
    mockTurnState = { hasStartedFirstTurn: false, reactionAvailable: false, reactionSpent: false };
    setup();
    fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
    expect(screen.getByLabelText('Shield Block')).toBeDisabled();
  });
});
