import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EarnIncomeApproval from './EarnIncomeApproval';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSession } from '../../contexts/SessionContext';
import { useEncounter } from '../../hooks/useEncounter';

vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../contexts/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));

const mockSetResults = vi.fn();
const mockSendUpdate = vi.fn();
const mockAppendLog = vi.fn();

const pendingEntry = {
  id: 'r1', charId: 'c1', charName: 'Ashka',
  skillLabel: 'Crafting', taskLevel: 8, dc: 24,
  d20: 15, total: 27, degree: 'success', payoutCp: 300, status: 'pending',
};

const setup = (entries) => {
  useSyncedState.mockReturnValue([{ entries }, mockSetResults]);
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useSession.mockReturnValue({ getState: vi.fn(() => 10), sendUpdate: mockSendUpdate });
  useEncounter.mockReturnValue({ appendLog: mockAppendLog });
});

describe('EarnIncomeApproval', () => {
  it('renders nothing when there are no pending results', () => {
    setup([{ ...pendingEntry, status: 'confirmed' }]);
    const { container } = render(<EarnIncomeApproval />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists a pending result with its payout', () => {
    setup([pendingEntry]);
    render(<EarnIncomeApproval />);
    expect(screen.getByText('Ashka')).toBeInTheDocument();
    expect(screen.getByText(/Crafting · Lvl 8 DC 24 · rolled 27/)).toBeInTheDocument();
    expect(screen.getByText('3 gp')).toBeInTheDocument();
  });

  it('Confirm credits gold (10 + 3), logs, and marks the entry confirmed', () => {
    setup([pendingEntry]);
    render(<EarnIncomeApproval />);
    fireEvent.click(screen.getByRole('button', { name: /confirm ashka/i }));

    expect(mockSendUpdate).toHaveBeenCalledWith('c1', 'gold', 13);
    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.objectContaining({ charId: 'c1', text: expect.stringContaining('earned income') }),
    );
    const next = mockSetResults.mock.calls[0][0]({ entries: [pendingEntry] });
    expect(next.entries[0].status).toBe('confirmed');
  });

  it('Reject removes the entry and credits nothing', () => {
    setup([pendingEntry]);
    render(<EarnIncomeApproval />);
    fireEvent.click(screen.getByRole('button', { name: /reject ashka/i }));

    expect(mockSendUpdate).not.toHaveBeenCalled();
    const next = mockSetResults.mock.calls[0][0]({ entries: [pendingEntry] });
    expect(next.entries).toEqual([]);
  });
});
