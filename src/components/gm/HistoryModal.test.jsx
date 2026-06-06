import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HistoryModal from './HistoryModal';

vi.mock('../../utils/gmApi', () => ({ fetchHistory: vi.fn(), restoreVersion: vi.fn() }));
import { fetchHistory, restoreVersion } from '../../utils/gmApi';

const props = (over = {}) => ({
  isOpen: true,
  collection: 'quest',
  id: 'find-orb',
  name: 'Find the Orb',
  onClose: vi.fn(),
  onRestored: vi.fn(),
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe('HistoryModal', () => {
  it('renders nothing when closed', () => {
    fetchHistory.mockResolvedValue({ history: [] });
    const { container } = render(<HistoryModal {...props({ isOpen: false })} />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchHistory).not.toHaveBeenCalled();
  });

  it('lists versions newest-first with a preview', async () => {
    fetchHistory.mockResolvedValue({
      history: [
        { archived_at: 2000, data: { title: 'Newer' } },
        { archived_at: 1000, data: null },
      ],
    });
    render(<HistoryModal {...props()} />);
    expect(await screen.findByTestId('version-2000')).toHaveTextContent('Newer');
    expect(screen.getByTestId('version-1000')).toHaveTextContent('(unreadable version)');
    expect(fetchHistory).toHaveBeenCalledWith('quest', 'find-orb');
  });

  it('shows an empty state when there is no history', async () => {
    fetchHistory.mockResolvedValue({ history: [] });
    render(<HistoryModal {...props()} />);
    expect(await screen.findByText(/No saved versions yet/i)).toBeInTheDocument();
  });

  it('surfaces a load error', async () => {
    fetchHistory.mockRejectedValue(new Error('boom'));
    render(<HistoryModal {...props()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });

  it('restores a version only after typed confirmation', async () => {
    fetchHistory.mockResolvedValue({ history: [{ archived_at: 2000, data: { title: 'Old' } }] });
    restoreVersion.mockResolvedValue({ ok: true });
    const onRestored = vi.fn();
    const onClose = vi.fn();
    render(<HistoryModal {...props({ onRestored, onClose })} />);

    fireEvent.click(await screen.findByText('Restore this version'));
    const confirmBtn = screen.getByText('Restore');
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(restoreVersion).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'Find the Orb' } });
    fireEvent.click(screen.getByText('Restore'));
    await waitFor(() => expect(restoreVersion).toHaveBeenCalledWith('quest', 'find-orb', 2000));
    expect(onRestored).toHaveBeenCalledWith({ title: 'Old' });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the modal open and shows an error if restore fails', async () => {
    fetchHistory.mockResolvedValue({ history: [{ archived_at: 2000, data: {} }] });
    restoreVersion.mockRejectedValue(new Error('nope'));
    const onClose = vi.fn();
    render(<HistoryModal {...props({ onClose })} />);
    fireEvent.click(await screen.findByText('Restore this version'));
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'Find the Orb' } });
    fireEvent.click(screen.getByText('Restore'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('nope'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
