import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmQuests from './GmQuests';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({
  saveDocument: vi.fn(),
  deleteDocument: vi.fn(),
  fetchHistory: vi.fn(),
  restoreVersion: vi.fn(),
}));
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument, fetchHistory, restoreVersion } from '../../utils/gmApi';

const quests = [
  {
    id: 'find-orb',
    title: 'Find the Orb',
    status: 'pending',
    priority: 'low',
    location: 'Ruins',
    giver: 'Blu',
    description: 'Look into it.',
    notes: [{ id: 'n0', content: 'It feels awake.' }],
  },
];

const setContent = (source = 'server') => useContent.mockReturnValue({ quests, source });

afterEach(() => vi.restoreAllMocks());

describe('GmQuests', () => {
  it('lists a form per quest and a fallback banner when not seeded', () => {
    setContent('fallback');
    render(<GmQuests />);
    expect(screen.getByTestId('quest-form-find-orb')).toBeInTheDocument();
    expect(screen.getByText(/Showing bundled defaults/i)).toBeInTheDocument();
  });

  it('edits a quest and saves it with its id', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmQuests />);
    const form = screen.getByTestId('quest-form-find-orb');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'Find the Orb!' } });
    fireEvent.click(within(form).getByText('Save'));
    expect(await screen.findByRole('status')).toHaveTextContent(/live for every connected player/i);
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('quest');
    expect(id).toBe('find-orb');
    expect(data.title).toBe('Find the Orb!');
  });

  it('blocks saving with an empty title', async () => {
    setContent();
    render(<GmQuests />);
    const form = screen.getByTestId('quest-form-find-orb');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: '   ' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert').textContent).toMatch(/Title is required/));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('adds and removes notes', () => {
    setContent();
    render(<GmQuests />);
    const form = screen.getByTestId('quest-form-find-orb');
    expect(within(form).getByLabelText('note-0')).toBeInTheDocument();
    fireEvent.click(within(form).getByText('Add note'));
    expect(within(form).getByLabelText('note-1')).toBeInTheDocument();
    fireEvent.click(within(form).getAllByText('Remove')[0]);
    expect(within(form).queryByLabelText('note-1')).not.toBeInTheDocument();
  });

  it('creates a new quest with a slug id derived from the title', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmQuests />);
    fireEvent.click(screen.getByText('+ New quest'));
    const form = screen.getByTestId('quest-form-new');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'Brand New Quest' } });
    fireEvent.click(within(form).getByText('Create quest'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalledWith('quest', 'brand-new-quest', expect.objectContaining({ id: 'brand-new-quest' })));
  });

  it('deletes a quest only after typed confirmation', async () => {
    setContent();
    deleteDocument.mockResolvedValue({ ok: true });
    render(<GmQuests />);
    const form = screen.getByTestId('quest-form-find-orb');
    fireEvent.click(within(form).getByText('Delete'));
    const confirmBtn = within(form).getByText('Delete forever');
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(deleteDocument).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText('confirm-input'), { target: { value: 'Find the Orb' } });
    fireEvent.click(within(form).getByText('Delete forever'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('quest', 'find-orb'));
  });

  it('cancels a delete without calling the API', () => {
    setContent();
    render(<GmQuests />);
    const form = screen.getByTestId('quest-form-find-orb');
    fireEvent.click(within(form).getByText('Delete'));
    fireEvent.click(within(form).getByText('Cancel'));
    expect(within(form).queryByLabelText('confirm-input')).not.toBeInTheDocument();
    expect(deleteDocument).not.toHaveBeenCalled();
  });

  it('warns before overwriting an existing id when creating a new quest', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmQuests />);
    fireEvent.click(screen.getByText('+ New quest'));
    const form = screen.getByTestId('quest-form-new');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'Find Orb' } });
    fireEvent.click(within(form).getByText('Create quest'));
    expect(saveDocument).not.toHaveBeenCalled();
    expect(within(form).getByText(/already exists/i)).toBeInTheDocument();
    fireEvent.click(within(form).getByText('Overwrite'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith('quest', 'find-orb', expect.objectContaining({ id: 'find-orb' }))
    );
  });

  it('opens History and restores a prior version, refreshing the form immediately', async () => {
    setContent();
    const restoredDoc = {
      id: 'find-orb',
      title: 'Older Title',
      status: 'active',
      priority: 'high',
      location: 'Ruins',
      giver: 'Blu',
      description: 'Old description.',
      notes: [],
    };
    fetchHistory.mockResolvedValue({ history: [{ archived_at: 1717000000000, data: restoredDoc }] });
    restoreVersion.mockResolvedValue({ ok: true });
    render(<GmQuests />);
    const form = screen.getByTestId('quest-form-find-orb');
    expect(within(form).getByLabelText('title')).toHaveValue('Find the Orb');

    fireEvent.click(within(form).getByText('History'));
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledWith('quest', 'find-orb'));
    fireEvent.click(screen.getByText('Restore this version'));
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'Find the Orb' } });
    fireEvent.click(screen.getByText('Restore'));
    await waitFor(() =>
      expect(restoreVersion).toHaveBeenCalledWith('quest', 'find-orb', 1717000000000)
    );
    // Form re-seeds from the restored doc without a reload.
    expect(within(form).getByLabelText('title')).toHaveValue('Older Title');
    expect(within(form).getByLabelText('status')).toHaveValue('active');
    expect(await screen.findByRole('status')).toHaveTextContent(/Restored\. Changes are live/i);
  });
});
