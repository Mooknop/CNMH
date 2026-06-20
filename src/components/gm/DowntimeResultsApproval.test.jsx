import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DowntimeResultsApproval from './DowntimeResultsApproval';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { saveDocument } from '../../utils/gmApi';

vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../contexts/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn(() => Promise.resolve()) }));

const mockSetResults = vi.fn();
const mockSendUpdate = vi.fn();
const mockAppendLog = vi.fn();

const earnEntry = {
  id: 'r1', kind: 'earn-income', charId: 'c1', charName: 'Ashka',
  skillLabel: 'Crafting', taskLevel: 8, dc: 24,
  d20: 15, total: 27, degree: 'success', payoutCp: 300, status: 'pending',
};

const craftEntry = {
  id: 'r2', kind: 'crafting', charId: 'c2', charName: 'Blu',
  ref: 'shield', level: null, itemName: 'Sturdy Shield', degree: 'success', paidCp: 3000, status: 'pending',
};

const setup = (entries) => {
  useSyncedState.mockReturnValue([{ entries }, mockSetResults]);
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useSession.mockReturnValue({ getState: vi.fn(() => 10), sendUpdate: mockSendUpdate });
  useContent.mockReturnValue({ rawCharacters: [], refresh: vi.fn() });
  useEncounter.mockReturnValue({ appendLog: mockAppendLog });
});

describe('DowntimeResultsApproval', () => {
  it('renders nothing when there are no pending results', () => {
    setup([{ ...earnEntry, status: 'confirmed' }]);
    const { container } = render(<DowntimeResultsApproval />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists a pending Earn Income result with its payout', () => {
    setup([earnEntry]);
    render(<DowntimeResultsApproval />);
    expect(screen.getByText('Ashka')).toBeInTheDocument();
    expect(screen.getByText(/Crafting · Lvl 8 DC 24 · rolled 27/)).toBeInTheDocument();
    expect(screen.getByText('3 gp')).toBeInTheDocument();
  });

  it('Confirm on Earn Income credits gold (10 + 3), logs, and marks confirmed', () => {
    setup([earnEntry]);
    render(<DowntimeResultsApproval />);
    fireEvent.click(screen.getByRole('button', { name: /confirm ashka earn income/i }));

    expect(mockSendUpdate).toHaveBeenCalledWith('c1', 'gold', 13);
    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.objectContaining({ charId: 'c1', text: expect.stringContaining('earned income') }),
    );
    const next = mockSetResults.mock.calls[0][0]({ entries: [earnEntry] });
    expect(next.entries[0].status).toBe('confirmed');
  });

  it('Reject removes the entry and commits nothing', () => {
    setup([earnEntry]);
    render(<DowntimeResultsApproval />);
    fireEvent.click(screen.getByRole('button', { name: /reject ashka earn income/i }));

    expect(mockSendUpdate).not.toHaveBeenCalled();
    const next = mockSetResults.mock.calls[0][0]({ entries: [earnEntry] });
    expect(next.entries).toEqual([]);
  });

  it('lists a pending Crafting result as an item grant', () => {
    setup([craftEntry]);
    render(<DowntimeResultsApproval />);
    expect(screen.getByText('Blu')).toBeInTheDocument();
    expect(screen.getByText(/Crafted Sturdy Shield \(Success\)/)).toBeInTheDocument();
    expect(screen.getByText('item')).toBeInTheDocument();
  });

  it('Confirm on a Crafting result appends the item to the doc, persists, and confirms', async () => {
    const refresh = vi.fn();
    useContent.mockReturnValue({
      rawCharacters: [{ id: 'c2', name: 'Blu', inventory: [{ ref: 'dagger' }] }],
      refresh,
    });
    setup([craftEntry]);
    render(<DowntimeResultsApproval />);
    fireEvent.click(screen.getByRole('button', { name: /confirm blu craft/i }));

    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [collection, id, doc] = saveDocument.mock.calls[0];
    expect(collection).toBe('character');
    expect(id).toBe('c2');
    expect(doc.inventory).toHaveLength(2);
    expect(doc.inventory[1].ref).toBe('shield');
    expect(refresh).toHaveBeenCalled();

    await waitFor(() => expect(mockSetResults).toHaveBeenCalled());
    const next = mockSetResults.mock.calls.at(-1)[0]({ entries: [craftEntry] });
    expect(next.entries[0].status).toBe('confirmed');
  });

  it('Reject on a Crafting result discards without granting', () => {
    setup([craftEntry]);
    render(<DowntimeResultsApproval />);
    fireEvent.click(screen.getByRole('button', { name: /reject blu craft/i }));
    expect(saveDocument).not.toHaveBeenCalled();
    const next = mockSetResults.mock.calls[0][0]({ entries: [craftEntry] });
    expect(next.entries).toEqual([]);
  });
});
