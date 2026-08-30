import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmResearch from './GmResearch';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({
  saveDocument: vi.fn(),
  deleteDocument: vi.fn(),
  fetchHistory: vi.fn(),
  restoreVersion: vi.fn(),
}));
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument, fetchHistory, restoreVersion } from '../../utils/gmApi';

const researchTopics = [
  {
    id: 'rusty-dragon-secrets',
    title: 'Rusty Dragon Secrets',
    level: 2,
    traits: ['secret', 'town'],
    description: 'What is Ameiko hiding?',
    sources: [
      {
        name: 'Ask around town',
        note: 'Locals gossip freely.',
        costNote: '',
        maxRp: 4,
        checks: [{ skill: 'Diplomacy', dc: 15 }],
      },
    ],
    unlocks: [{ rp: 4, text: 'Ameiko mentions the Rusty Dragon deed.', loreId: 'ameiko-deed' }],
    reward: '',
  },
];

const setContent = () => useContent.mockReturnValue({ researchTopics });

afterEach(() => vi.restoreAllMocks());

const selectTopic = (name) => fireEvent.click(screen.getByRole('button', { name }));

describe('GmResearch', () => {
  it('lists research topics as master-list buttons', () => {
    setContent();
    render(<GmResearch />);
    expect(screen.getByRole('button', { name: 'Rusty Dragon Secrets' })).toBeInTheDocument();
    expect(screen.queryByTestId('research-form-rusty-dragon-secrets')).not.toBeInTheDocument();
  });

  it('opens a topic and shows its fields populated', () => {
    setContent();
    render(<GmResearch />);
    selectTopic('Rusty Dragon Secrets');
    const form = screen.getByTestId('research-form-rusty-dragon-secrets');
    expect(within(form).getByLabelText('title')).toHaveValue('Rusty Dragon Secrets');
    expect(within(form).getByLabelText('level')).toHaveValue(2);
    expect(within(form).getByLabelText('traits')).toHaveValue('secret, town');
    expect(within(form).getByLabelText('source-0-name')).toHaveValue('Ask around town');
    expect(within(form).getByLabelText('source-0-check-0-skill')).toHaveValue('Diplomacy');
    expect(within(form).getByLabelText('source-0-check-0-dc')).toHaveValue(15);
    expect(within(form).getByLabelText('unlock-0-rp')).toHaveValue(4);
    expect(within(form).getByLabelText('unlock-0-loreId')).toHaveValue('ameiko-deed');
  });

  it('edits a topic and saves it with its id, traits split back to an array', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmResearch />);
    selectTopic('Rusty Dragon Secrets');
    const form = screen.getByTestId('research-form-rusty-dragon-secrets');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'Rusty Dragon Secrets!' } });
    fireEvent.change(within(form).getByLabelText('traits'), { target: { value: 'secret,  town ,gossip' } });
    fireEvent.click(within(form).getByText('Save'));
    expect(await screen.findByRole('status')).toHaveTextContent(/live for every connected player/i);
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('research');
    expect(id).toBe('rusty-dragon-secrets');
    expect(data.title).toBe('Rusty Dragon Secrets!');
    expect(data.traits).toEqual(['secret', 'town', 'gossip']);
  });

  it('blocks saving with an empty title', async () => {
    setContent();
    render(<GmResearch />);
    selectTopic('Rusty Dragon Secrets');
    const form = screen.getByTestId('research-form-rusty-dragon-secrets');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: '   ' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert').textContent).toMatch(/Title is required/));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('adds and removes a source, and adds/removes a nested check', () => {
    setContent();
    render(<GmResearch />);
    selectTopic('Rusty Dragon Secrets');
    const form = screen.getByTestId('research-form-rusty-dragon-secrets');

    fireEvent.click(within(form).getByText('Add source'));
    expect(within(form).getByLabelText('source-1-name')).toBeInTheDocument();

    fireEvent.click(within(within(form).getByTestId('research-source-1')).getByText('Add check'));
    expect(within(form).getByLabelText('source-1-check-0-skill')).toBeInTheDocument();
    fireEvent.click(within(within(form).getByTestId('research-source-1')).getByText('Remove'));
    expect(within(form).queryByLabelText('source-1-check-0-skill')).not.toBeInTheDocument();

    fireEvent.click(within(within(form).getByTestId('research-source-1')).getByText('Remove source'));
    expect(within(form).queryByLabelText('source-1-name')).not.toBeInTheDocument();
  });

  it('adds and removes an unlock', () => {
    setContent();
    render(<GmResearch />);
    selectTopic('Rusty Dragon Secrets');
    const form = screen.getByTestId('research-form-rusty-dragon-secrets');

    fireEvent.click(within(form).getByText('Add unlock'));
    expect(within(form).getByLabelText('unlock-1-rp')).toBeInTheDocument();
    fireEvent.click(within(within(form).getByTestId('research-unlock-1')).getByText('Remove unlock'));
    expect(within(form).queryByLabelText('unlock-1-rp')).not.toBeInTheDocument();
  });

  it('sorts unlocks ascending by rp on save', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmResearch />);
    selectTopic('Rusty Dragon Secrets');
    const form = screen.getByTestId('research-form-rusty-dragon-secrets');

    fireEvent.click(within(form).getByText('Add unlock'));
    const newUnlock = within(form).getByTestId('research-unlock-1');
    fireEvent.change(within(newUnlock).getByLabelText('unlock-1-rp'), { target: { value: '1' } });
    fireEvent.change(within(newUnlock).getByLabelText('unlock-1-text'), { target: { value: 'Early clue.' } });

    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, , data] = saveDocument.mock.calls[0];
    expect(data.unlocks.map((u) => u.rp)).toEqual([1, 4]);
    expect(data.unlocks[0].text).toBe('Early clue.');
  });

  it('creates a new topic with a slug id derived from the title', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmResearch />);
    fireEvent.click(screen.getByText('+ New topic'));
    const form = screen.getByTestId('research-form-new');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'Brand New Topic' } });
    fireEvent.click(within(form).getByText('Create topic'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith(
        'research',
        'brand-new-topic',
        expect.objectContaining({ id: 'brand-new-topic' })
      )
    );
  });

  it('deletes a topic only after typed confirmation', async () => {
    setContent();
    deleteDocument.mockResolvedValue({ ok: true });
    render(<GmResearch />);
    selectTopic('Rusty Dragon Secrets');
    const form = screen.getByTestId('research-form-rusty-dragon-secrets');
    fireEvent.click(within(form).getByText('Delete'));
    const confirmBtn = screen.getByText('Delete forever');
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(deleteDocument).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'Rusty Dragon Secrets' } });
    fireEvent.click(screen.getByText('Delete forever'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('research', 'rusty-dragon-secrets'));
  });

  it('opens History and restores a prior version, refreshing the form immediately', async () => {
    setContent();
    const restoredDoc = {
      id: 'rusty-dragon-secrets',
      title: 'Older Title',
      level: 1,
      traits: [],
      description: 'Old description.',
      sources: [],
      unlocks: [],
    };
    fetchHistory.mockResolvedValue({ history: [{ archived_at: 1717000000000, data: restoredDoc }] });
    restoreVersion.mockResolvedValue({ ok: true });
    render(<GmResearch />);
    selectTopic('Rusty Dragon Secrets');
    const form = screen.getByTestId('research-form-rusty-dragon-secrets');
    expect(within(form).getByLabelText('title')).toHaveValue('Rusty Dragon Secrets');

    fireEvent.click(within(form).getByText('History'));
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledWith('research', 'rusty-dragon-secrets'));
    fireEvent.click(screen.getByText('Restore this version'));
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'Rusty Dragon Secrets' } });
    fireEvent.click(screen.getByText('Restore'));
    await waitFor(() => expect(restoreVersion).toHaveBeenCalledWith('research', 'rusty-dragon-secrets', 1717000000000));
    expect(within(form).getByLabelText('title')).toHaveValue('Older Title');
    expect(await screen.findByRole('status')).toHaveTextContent(/Restored\. Changes are live/i);
  });

  it('warns before overwriting an existing id when creating a new topic', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmResearch />);
    fireEvent.click(screen.getByText('+ New topic'));
    const form = screen.getByTestId('research-form-new');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'Rusty Dragon Secrets' } });
    fireEvent.click(within(form).getByText('Create topic'));
    expect(saveDocument).not.toHaveBeenCalled();
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Overwrite'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith(
        'research',
        'rusty-dragon-secrets',
        expect.objectContaining({ id: 'rusty-dragon-secrets' })
      )
    );
  });
});
