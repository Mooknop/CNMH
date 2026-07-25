import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OutOfTurnNotice from './OutOfTurnNotice';

const mockUseEncounter = vi.fn();
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: (...args) => mockUseEncounter(...args),
}));

const live = (order, currentTurnIndex = 0) => ({
  active: true, phase: 'in-progress', order, currentTurnIndex,
});

describe('OutOfTurnNotice (#1575 D1)', () => {
  beforeEach(() => mockUseEncounter.mockReset());

  it('names the acting combatant off-turn', () => {
    mockUseEncounter.mockReturnValue({
      encounter: live([{ entryId: 'e1', kind: 'enemy', name: 'Ogre' }]),
    });
    render(<OutOfTurnNotice charId="p1" cost={1} />);
    const notice = screen.getByTestId('out-of-turn-notice');
    expect(notice).toHaveTextContent('Not your turn — Ogre is acting');
  });

  it('renders nothing on the character’s own turn', () => {
    mockUseEncounter.mockReturnValue({
      encounter: live([{ entryId: 'e1', kind: 'pc', charId: 'p1' }]),
    });
    render(<OutOfTurnNotice charId="p1" cost={2} />);
    expect(screen.queryByTestId('out-of-turn-notice')).not.toBeInTheDocument();
  });

  it('renders nothing for reaction-cost uses (reacting off-turn is normal)', () => {
    mockUseEncounter.mockReturnValue({
      encounter: live([{ entryId: 'e1', kind: 'enemy', name: 'Ogre' }]),
    });
    render(<OutOfTurnNotice charId="p1" cost="reaction" />);
    expect(screen.queryByTestId('out-of-turn-notice')).not.toBeInTheDocument();
  });

  it('renders nothing outside a live encounter (setup, idle, none)', () => {
    mockUseEncounter.mockReturnValue({ encounter: null });
    const { rerender } = render(<OutOfTurnNotice charId="p1" cost={1} />);
    expect(screen.queryByTestId('out-of-turn-notice')).not.toBeInTheDocument();

    mockUseEncounter.mockReturnValue({
      encounter: { active: true, phase: 'setup', order: [], currentTurnIndex: 0 },
    });
    rerender(<OutOfTurnNotice charId="p1" cost={1} />);
    expect(screen.queryByTestId('out-of-turn-notice')).not.toBeInTheDocument();
  });
});
