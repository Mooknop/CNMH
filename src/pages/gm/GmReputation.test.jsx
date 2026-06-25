import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmReputation from './GmReputation';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn(), deleteDocument: vi.fn() }));
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';

const reputation = {
  Factions: [
    {
      id: 'bunyip-club',
      name: 'The Bunyip Club',
      reputation: -4,
      ranks: [{ id: 'r0', name: 'Ignored', min: -4, max: 4 }],
    },
  ],
};

const setContent = () => useContent.mockReturnValue({ reputation });

afterEach(() => vi.restoreAllMocks());

// Helper: select a faction list item to open its form in the detail pane.
const selectFaction = (name) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('GmReputation', () => {
  it('lists factions as master-list buttons', () => {
    setContent();
    render(<GmReputation />);
    expect(screen.getByRole('button', { name: 'The Bunyip Club' })).toBeInTheDocument();
    expect(screen.queryByTestId('faction-form-bunyip-club')).not.toBeInTheDocument();
    expect(screen.getByText('+ New faction')).toBeInTheDocument();
  });

  it('edits a faction and saves it with numeric coercion', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmReputation />);
    selectFaction('The Bunyip Club');
    const form = screen.getByTestId('faction-form-bunyip-club');
    fireEvent.change(within(form).getByLabelText('reputation'), { target: { value: '12' } });
    fireEvent.click(within(form).getByText('Save'));
    expect(await screen.findByRole('status')).toHaveTextContent(/live for every connected player/i);
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('faction');
    expect(id).toBe('bunyip-club');
    expect(data.reputation).toBe(12);
    expect(data.ranks[0]).toEqual({ id: 'r0', name: 'Ignored', min: -4, max: 4 });
  });

  it('blocks saving with an empty name', async () => {
    setContent();
    render(<GmReputation />);
    selectFaction('The Bunyip Club');
    const form = screen.getByTestId('faction-form-bunyip-club');
    fireEvent.change(within(form).getByLabelText('faction-name'), { target: { value: '  ' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/Name is required/));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('adds and removes rank tiers', () => {
    setContent();
    render(<GmReputation />);
    selectFaction('The Bunyip Club');
    const form = screen.getByTestId('faction-form-bunyip-club');
    expect(within(form).getByLabelText('rank-0-name')).toBeInTheDocument();
    fireEvent.click(within(form).getByText('Add tier'));
    expect(within(form).getByLabelText('rank-1-name')).toBeInTheDocument();
    fireEvent.click(within(form).getAllByText('Remove')[0]);
    expect(within(form).queryByLabelText('rank-1-name')).not.toBeInTheDocument();
  });

  it('creates a new faction with a slug id derived from the name', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmReputation />);
    fireEvent.click(screen.getByText('+ New faction'));
    const form = screen.getByTestId('faction-form-new');
    fireEvent.change(within(form).getByLabelText('faction-name'), { target: { value: 'Iron Harbor Watch' } });
    fireEvent.click(within(form).getByText('Create faction'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith(
        'faction',
        'iron-harbor-watch',
        expect.objectContaining({ id: 'iron-harbor-watch', reputation: 0 })
      )
    );
  });

  it('deletes a faction only after typed confirmation', async () => {
    setContent();
    deleteDocument.mockResolvedValue({ ok: true });
    render(<GmReputation />);
    selectFaction('The Bunyip Club');
    const form = screen.getByTestId('faction-form-bunyip-club');
    fireEvent.click(within(form).getByText('Delete'));
    expect(screen.getByText('Delete forever')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'The Bunyip Club' } });
    fireEvent.click(screen.getByText('Delete forever'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('faction', 'bunyip-club'));
  });

  it('warns before overwriting an existing id when creating a new faction', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmReputation />);
    fireEvent.click(screen.getByText('+ New faction'));
    const form = screen.getByTestId('faction-form-new');
    fireEvent.change(within(form).getByLabelText('faction-name'), { target: { value: 'Bunyip Club' } });
    fireEvent.click(within(form).getByText('Create faction'));
    expect(saveDocument).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Overwrite'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith('faction', 'bunyip-club', expect.objectContaining({ id: 'bunyip-club' }))
    );
  });
});
