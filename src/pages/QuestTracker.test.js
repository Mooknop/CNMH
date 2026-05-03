import React from 'react';
import { render, screen, act } from '@testing-library/react';
import QuestTracker from './QuestTracker';

jest.mock('../data', () => ({
  quests: [
    {
      id: 'q1',
      title: 'The Missing Merchant',
      status: 'active',
      priority: 'high',
      location: 'Korvosa',
      giver: 'Mayor Voth',
      description: 'Find the missing merchant.',
      notes: [{ id: 'n1', content: 'Seen near the docks.' }],
    },
    {
      id: 'q2',
      title: 'Ancient Ruins',
      status: 'pending',
      priority: 'medium',
      location: 'Mosswood',
      description: 'Investigate the ruins.',
      notes: [],
    },
    {
      id: 'q3',
      title: 'Deliver the Package',
      status: 'completed',
      priority: 'low',
      location: 'Absalom',
      description: 'Deliver it.',
      notes: [],
    },
  ],
  reputation: { Factions: [] },
}));

jest.mock('../components/shared/ReputationModal', () => ({ isOpen }) =>
  isOpen ? <div data-testid="reputation-modal" /> : null
);

jest.mock('../components/shared/ReputationRadarChart', () => () => (
  <div data-testid="reputation-radar" />
));

describe('QuestTracker', () => {
  it('renders without crashing', async () => {
    await act(async () => { render(<QuestTracker />); });
    expect(screen.getByText('Quests')).toBeInTheDocument();
  });

  it('shows all quests', async () => {
    await act(async () => { render(<QuestTracker />); });
    expect(screen.getByText('The Missing Merchant')).toBeInTheDocument();
    expect(screen.getByText('Ancient Ruins')).toBeInTheDocument();
    expect(screen.getByText('Deliver the Package')).toBeInTheDocument();
  });

  it('displays quest count', async () => {
    await act(async () => { render(<QuestTracker />); });
    expect(screen.getByText(/Showing 3 quests/)).toBeInTheDocument();
  });

  it('displays quest giver when present', async () => {
    await act(async () => { render(<QuestTracker />); });
    expect(screen.getByText(/Mayor Voth/)).toBeInTheDocument();
  });

  it('displays quest notes', async () => {
    await act(async () => { render(<QuestTracker />); });
    expect(screen.getByText('Seen near the docks.')).toBeInTheDocument();
  });

  it('shows empty notes message when no notes', async () => {
    await act(async () => { render(<QuestTracker />); });
    expect(screen.getAllByText('No notes have been added yet.').length).toBeGreaterThan(0);
  });

  it('renders the reputation radar chart', async () => {
    await act(async () => { render(<QuestTracker />); });
    expect(screen.getByTestId('reputation-radar')).toBeInTheDocument();
  });

  it('renders priority labels', async () => {
    await act(async () => { render(<QuestTracker />); });
    expect(screen.getByText('High Priority')).toBeInTheDocument();
    expect(screen.getByText('Medium Priority')).toBeInTheDocument();
    expect(screen.getByText('Low Priority')).toBeInTheDocument();
  });

  it('renders Reputation heading', async () => {
    await act(async () => { render(<QuestTracker />); });
    expect(screen.getByText('Reputation')).toBeInTheDocument();
  });
});
