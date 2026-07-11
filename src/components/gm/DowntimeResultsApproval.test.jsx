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

const retrainEntry = {
  id: 'r3', kind: 'retrain', charId: 'c3', charName: 'Pellias',
  retrainType: 'Feat', fromLabel: 'Toughness', toLabel: 'Fleet', status: 'pending',
};

const researchEntry = {
  id: 'r4', kind: 'research', charId: 'c3', charName: 'Pellias',
  topic: 'The Sealed Vault', status: 'pending',
};

const trainingEntry = {
  id: 'r5', kind: 'training', charId: 'c1', charName: 'Ashka',
  vendorId: 'sandpoint-garrison', vendorName: 'Sandpoint Garrison',
  offeringId: 'shield-block', offeringName: 'Shield Block',
  choiceId: null, choiceName: null,
  grant: { kind: 'reaction', reaction: { name: 'Shield Block', trigger: 'While raised…' } },
  status: 'pending',
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

  it('lists a pending Earn Income result with its payout, marked freelance', () => {
    setup([earnEntry]);
    render(<DowntimeResultsApproval />);
    expect(screen.getByText('Ashka')).toBeInTheDocument();
    expect(screen.getByText(/Crafting \(freelance\) · Lvl 8 DC 24 · rolled 27/)).toBeInTheDocument();
    expect(screen.getByText('3 gp')).toBeInTheDocument();
  });

  it('names the work location when the result carries one', () => {
    setup([{ ...earnEntry, skillLabel: 'Performance', locationName: 'The Rusty Dragon' }]);
    render(<DowntimeResultsApproval />);
    expect(screen.getByText(/Performance at The Rusty Dragon · Lvl 8/)).toBeInTheDocument();
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

  it('lists a Training result as an ability grant, naming the choice when picked', () => {
    setup([{ ...trainingEntry, choiceName: 'Aiding Shield', offeringName: 'Specialized Shield Training (Medium)' }]);
    render(<DowntimeResultsApproval />);
    expect(screen.getByText('Training: Specialized Shield Training (Medium) — Aiding Shield at Sandpoint Garrison')).toBeInTheDocument();
    expect(screen.getByText('ability')).toBeInTheDocument();
  });

  it('Confirm on a Training result appends the grant to trained[], persists, and confirms', async () => {
    const refresh = vi.fn();
    useContent.mockReturnValue({
      rawCharacters: [{ id: 'c1', name: 'Ashka' }],
      refresh,
    });
    setup([trainingEntry]);
    render(<DowntimeResultsApproval />);
    fireEvent.click(screen.getByRole('button', { name: /confirm ashka training/i }));

    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [collection, id, doc] = saveDocument.mock.calls[0];
    expect(collection).toBe('character');
    expect(id).toBe('c1');
    expect(doc.trained).toHaveLength(1);
    expect(doc.trained[0]).toMatchObject({
      kind: 'reaction',
      reaction: { name: 'Shield Block' },
      vendorId: 'sandpoint-garrison',
      offeringId: 'shield-block',
    });
    expect(refresh).toHaveBeenCalled();
    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.objectContaining({
        charId: 'c1',
        text: expect.stringContaining('completed training at Sandpoint Garrison: Shield Block learned'),
      }),
    );

    await waitFor(() => expect(mockSetResults).toHaveBeenCalled());
    const next = mockSetResults.mock.calls.at(-1)[0]({ entries: [trainingEntry] });
    expect(next.entries[0].status).toBe('confirmed');
  });

  it('Reject on a Training result discards without granting', () => {
    setup([trainingEntry]);
    render(<DowntimeResultsApproval />);
    fireEvent.click(screen.getByRole('button', { name: /reject ashka training/i }));
    expect(saveDocument).not.toHaveBeenCalled();
    const next = mockSetResults.mock.calls[0][0]({ entries: [trainingEntry] });
    expect(next.entries).toEqual([]);
  });

  it('lists a Retrain result with its structured swap and Confirm logs it', () => {
    setup([retrainEntry]);
    render(<DowntimeResultsApproval />);
    expect(screen.getByText('Retrain: Feat — Toughness → Fleet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm pellias retrain/i }));

    expect(mockSendUpdate).not.toHaveBeenCalled(); // no gold
    expect(saveDocument).not.toHaveBeenCalled();   // no item
    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.objectContaining({ charId: 'c3', text: expect.stringContaining('retrained — Feat — Toughness → Fleet') }),
    );
    const next = mockSetResults.mock.calls[0][0]({ entries: [retrainEntry] });
    expect(next.entries[0].status).toBe('confirmed');
  });

  it('lists a Research result handing off to #206 and Confirm logs it', () => {
    setup([researchEntry]);
    render(<DowntimeResultsApproval />);
    expect(screen.getByText(/Research: The Sealed Vault — resolve via #206/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm pellias research/i }));
    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.objectContaining({ charId: 'c3', text: expect.stringContaining('completed research: The Sealed Vault') }),
    );
    const next = mockSetResults.mock.calls[0][0]({ entries: [researchEntry] });
    expect(next.entries[0].status).toBe('confirmed');
  });
});
