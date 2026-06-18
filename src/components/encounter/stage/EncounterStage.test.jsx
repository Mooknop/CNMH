import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EncounterStage from './EncounterStage';

const mockUseEncounter = vi.fn();
vi.mock('../../../hooks/useEncounter', () => ({
  useEncounter: () => mockUseEncounter(),
}));

let mockCharacters;
vi.mock('../../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: mockCharacters }),
}));

// The armed-reaction bar carries its own hook web (#474); the stage test only
// cares that it mounts, so stub it.
vi.mock('./ArmedReactionBar', () => ({
  __esModule: true,
  default: () => <div data-testid="armed-reaction-bar" />,
}));

const encWith = (actor, currentTurnIndex = 0) => ({
  encounter: { order: [actor], currentTurnIndex, phase: 'in-progress' },
});

describe('EncounterStage', () => {
  beforeEach(() => {
    mockCharacters = [];
    mockUseEncounter.mockReturnValue(
      encWith({ entryId: 'o1', kind: 'enemy', name: 'Ogre Warrior', bestiary: { level: 3 } })
    );
  });

  it('spotlights the acting combatant with a monogram and sub-line', () => {
    render(<EncounterStage characterColor="#c0440e" />);
    expect(screen.getByText('Ogre Warrior')).toBeInTheDocument();
    expect(screen.getByText('Level 3')).toBeInTheDocument();
    expect(screen.getByText('O')).toBeInTheDocument(); // monogram (no token art)
    expect(screen.getByText('Acting')).toBeInTheDocument();
  });

  it('shows the enemy token art when the bridge has resolved it', () => {
    mockUseEncounter.mockReturnValue(
      encWith({ entryId: 'o1', kind: 'enemy', name: 'Ogre Warrior', bestiary: { level: 3, img: '/api/images/tok-ogre.png' } })
    );
    render(<EncounterStage />);
    expect(screen.getByRole('img', { name: 'Portrait of Ogre Warrior' }))
      .toHaveAttribute('src', '/api/images/tok-ogre.png');
  });

  it('labels a PC actor as an ally and shows their content portrait', () => {
    mockCharacters = [{ id: 'p2', name: 'Brakk', image: 'brakk.png' }];
    mockUseEncounter.mockReturnValue(
      encWith({ entryId: 'b', kind: 'pc', charId: 'p2', name: 'Brakk' })
    );
    render(<EncounterStage />);
    expect(screen.getByText('Brakk')).toBeInTheDocument();
    expect(screen.getByText('Ally')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Portrait of Brakk' }))
      .toHaveAttribute('src', '/api/images/brakk.png');
  });

  it('renders the live-feed scaffold region', () => {
    render(<EncounterStage />);
    expect(screen.getByText('Live · this turn')).toBeInTheDocument();
    expect(screen.getByLabelText('Action feed')).toBeInTheDocument();
  });

  it('renders nothing when there is no acting entry', () => {
    mockUseEncounter.mockReturnValue({ encounter: { order: [], currentTurnIndex: 0 } });
    const { container } = render(<EncounterStage />);
    expect(container).toBeEmptyDOMElement();
  });
});
