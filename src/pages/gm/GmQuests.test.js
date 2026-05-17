import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmQuests from './GmQuests';

jest.mock('../../contexts/ContentContext', () => ({ useContent: jest.fn() }));
jest.mock('../../utils/gmApi', () => ({ saveDocument: jest.fn(), deleteDocument: jest.fn() }));
const { useContent } = require('../../contexts/ContentContext');
const { saveDocument, deleteDocument } = require('../../utils/gmApi');

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

afterEach(() => jest.restoreAllMocks());

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

  it('deletes a quest after confirmation', async () => {
    setContent();
    deleteDocument.mockResolvedValue({ ok: true });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GmQuests />);
    const form = screen.getByTestId('quest-form-find-orb');
    fireEvent.click(within(form).getByText('Delete'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('quest', 'find-orb'));
  });
});
