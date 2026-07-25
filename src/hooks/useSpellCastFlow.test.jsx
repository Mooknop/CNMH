// Warn-not-hide (#1575 D1): the cast chip shows on ANY live-encounter turn —
// only outside a live encounter does makeOnCast return undefined (chip hides).
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSpellCastFlow } from './useSpellCastFlow';

const mockUseEncounter = vi.fn();
vi.mock('./useEncounter', () => ({
  useEncounter: (...args) => mockUseEncounter(...args),
}));

const character = { id: 'p1', name: 'Hero' };

const Probe = () => {
  const { isMyTurn, makeOnCast } = useSpellCastFlow(character);
  return (
    <div>
      <span data-testid="my-turn">{String(isMyTurn)}</span>
      <span data-testid="on-cast">{typeof makeOnCast('slot')}</span>
    </div>
  );
};

const liveEncounter = (order, currentTurnIndex = 0) => ({
  active: true, phase: 'in-progress', order, currentTurnIndex,
});

describe('useSpellCastFlow', () => {
  beforeEach(() => mockUseEncounter.mockReset());

  it('my turn: chip shows, isMyTurn true', () => {
    mockUseEncounter.mockReturnValue({
      encounter: liveEncounter([{ entryId: 'e1', kind: 'pc', charId: 'p1' }]),
    });
    render(<Probe />);
    expect(screen.getByTestId('my-turn')).toHaveTextContent('true');
    expect(screen.getByTestId('on-cast')).toHaveTextContent('function');
  });

  it("someone else's turn: chip still shows (warn-not-hide), isMyTurn false", () => {
    mockUseEncounter.mockReturnValue({
      encounter: liveEncounter([{ entryId: 'e1', kind: 'enemy', name: 'Ogre' }]),
    });
    render(<Probe />);
    expect(screen.getByTestId('my-turn')).toHaveTextContent('false');
    expect(screen.getByTestId('on-cast')).toHaveTextContent('function');
  });

  it('no live encounter: chip hides', () => {
    mockUseEncounter.mockReturnValue({ encounter: null });
    render(<Probe />);
    expect(screen.getByTestId('on-cast')).toHaveTextContent('undefined');
  });

  it('setup phase is not live — chip hides until round 1', () => {
    mockUseEncounter.mockReturnValue({
      encounter: {
        active: true, phase: 'setup',
        order: [{ entryId: 'e1', kind: 'pc', charId: 'p1' }],
        currentTurnIndex: 0,
      },
    });
    render(<Probe />);
    expect(screen.getByTestId('on-cast')).toHaveTextContent('undefined');
  });
});
