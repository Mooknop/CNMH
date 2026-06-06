import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FollowExpertModal from './FollowExpertModal';
import { CharacterContext } from '../../contexts/CharacterContext';

vi.mock('../shared/Modal', () => ({
  default: function DummyModal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null;
    return <div data-testid="modal"><h2>{title}</h2><button onClick={onClose}>×</button>{children}</div>;
  }
}));

const mockSendUpdate = vi.fn();
const mockGetState   = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate }),
}));

vi.mock('../../contexts/CharacterContext', async () => {
  const { createContext } = await vi.importActual('react');
  return { CharacterContext: createContext({ characters: [] }) };
});

vi.mock('../../data/explorationActivities', () => ({
  EXPLORATION_ACTIVITIES: [
    { name: 'Avoid Notice', highlightSkills: ['stealth'] },
    { name: 'Defend',       highlightSkills: ['perception'] },
    { name: 'Scout',        highlightSkills: ['perception'] },
  ],
}));

const follower = { id: 'jade', name: 'Jade' };

const partyChars = [
  { id: 'jade', name: 'Jade',  skills: { perception: { proficiency: 1 } } },
  { id: 'izzy', name: 'Izzy',  skills: { stealth: { proficiency: 3 } } },  // Expert+ stealth
  { id: 'blu',  name: 'Blu',   skills: { perception: { proficiency: 2 } } }, // Expert perception
];

const withCtx = (ui) => (
  <CharacterContext.Provider value={{ characters: partyChars }}>
    {ui}
  </CharacterContext.Provider>
);

describe('FollowExpertModal', () => {
  beforeEach(() => {
    mockGetState.mockImplementation((charId, key) => {
      if (key === 'exploration') {
        if (charId === 'izzy') return 'Avoid Notice'; // stealth 3 → Expert+
        if (charId === 'blu')  return 'Scout';        // perception 2 → Expert+
        if (charId === 'jade') return 'Defend';       // perception 1 → NOT Expert
      }
      return null;
    });
  });

  it('renders nothing when isOpen=false', () => {
    const { container } = render(withCtx(
      <FollowExpertModal isOpen={false} onClose={() => {}} follower={follower} />
    ));
    expect(container.firstChild).toBeNull();
  });

  it('shows only PCs that are Expert+ in their active activity\'s skill', () => {
    render(withCtx(
      <FollowExpertModal isOpen={true} onClose={() => {}} follower={follower} />
    ));
    expect(screen.getByText('Izzy')).toBeInTheDocument();
    expect(screen.getByText('Blu')).toBeInTheDocument();
    // Jade is the follower (self) — should not appear
    expect(screen.queryAllByText('Jade').length).toBe(0);
  });

  it('shows empty message when no eligible experts exist', () => {
    mockGetState.mockReturnValue(null); // nobody has an activity
    render(withCtx(
      <FollowExpertModal isOpen={true} onClose={() => {}} follower={follower} />
    ));
    expect(screen.getByText(/No party member is currently/)).toBeInTheDocument();
  });

  it('calls sendUpdate for followexpert and exploration keys when a PC is picked', () => {
    render(withCtx(
      <FollowExpertModal isOpen={true} onClose={() => {}} follower={follower} />
    ));
    fireEvent.click(screen.getByText('Izzy').closest('button'));
    expect(mockSendUpdate).toHaveBeenCalledWith('jade', 'followexpert',
      expect.objectContaining({ expertCharId: 'izzy', skillId: 'stealth' })
    );
    expect(mockSendUpdate).toHaveBeenCalledWith('jade', 'exploration', 'Follow the Expert');
  });
});
