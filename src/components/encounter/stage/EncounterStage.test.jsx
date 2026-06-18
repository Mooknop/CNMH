import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EncounterStage from './EncounterStage';

const mockUseEncounter = vi.fn();
vi.mock('../../../hooks/useEncounter', () => ({
  useEncounter: () => mockUseEncounter(),
}));

// ActionGrid carries its own hook web; the stage test only cares that the peek
// mounts/unmounts it, so stub it to a marker.
vi.mock('../commandsheet/ActionGrid', () => ({
  default: ({ readOnly }) => (
    <div data-testid="action-grid" data-readonly={String(!!readOnly)} />
  ),
}));

const character = { id: 'p1', name: 'Kestrel' };

const encWith = (actor, currentTurnIndex = 0) => ({
  encounter: { order: [actor], currentTurnIndex, phase: 'in-progress' },
});

describe('EncounterStage', () => {
  beforeEach(() => {
    mockUseEncounter.mockReturnValue(
      encWith({ entryId: 'o1', kind: 'enemy', name: 'Ogre Warrior', bestiary: { level: 3 } })
    );
  });

  it('spotlights the acting combatant with a monogram and sub-line', () => {
    render(<EncounterStage character={character} characterColor="#c0440e" />);
    expect(screen.getByText('Ogre Warrior')).toBeInTheDocument();
    expect(screen.getByText('Level 3')).toBeInTheDocument();
    expect(screen.getByText('O')).toBeInTheDocument(); // monogram
    expect(screen.getByText('Acting')).toBeInTheDocument();
  });

  it('labels a PC actor as an ally', () => {
    mockUseEncounter.mockReturnValue(
      encWith({ entryId: 'b', kind: 'pc', charId: 'p2', name: 'Brakk' })
    );
    render(<EncounterStage character={character} />);
    expect(screen.getByText('Brakk')).toBeInTheDocument();
    expect(screen.getByText('Ally')).toBeInTheDocument();
  });

  it('renders the feed + reaction placeholder regions', () => {
    render(<EncounterStage character={character} />);
    expect(screen.getByText('Live · this turn')).toBeInTheDocument();
    expect(screen.getByLabelText('Your reactions')).toBeInTheDocument();
  });

  it('grid peek is collapsed by default and toggles the inert grid open', () => {
    render(<EncounterStage character={character} />);
    const handle = screen.getByRole('button', { name: /your command grid/i });
    expect(handle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('action-grid')).not.toBeInTheDocument();

    fireEvent.click(handle);
    expect(handle).toHaveAttribute('aria-expanded', 'true');
    const grid = screen.getByTestId('action-grid');
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveAttribute('data-readonly', 'true'); // mounted read-only

    fireEvent.click(handle);
    expect(screen.queryByTestId('action-grid')).not.toBeInTheDocument();
  });

  it('renders nothing when there is no acting entry', () => {
    mockUseEncounter.mockReturnValue({ encounter: { order: [], currentTurnIndex: 0 } });
    const { container } = render(<EncounterStage character={character} />);
    expect(container).toBeEmptyDOMElement();
  });
});
