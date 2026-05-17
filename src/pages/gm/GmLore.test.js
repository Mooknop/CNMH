import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmLore from './GmLore';

jest.mock('../../contexts/ContentContext', () => ({ useContent: jest.fn() }));
jest.mock('../../utils/gmApi', () => ({ saveDocument: jest.fn(), deleteDocument: jest.fn() }));
const { useContent } = require('../../contexts/ContentContext');
const { saveDocument, deleteDocument } = require('../../utils/gmApi');

const loreEntries = [
  {
    id: 'sandpoint',
    title: 'Sandpoint',
    category: 'Location',
    summary: 'A town.',
    content: 'Sandpoint sits in a cove.',
    related: ['varisia'],
    tags: ['town', 'hub'],
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'aroden',
    title: 'Aroden',
    category: 'History',
    summary: 'A dead god.',
    content: 'He died.',
    related: [],
    tags: ['deity'],
  },
];

const setContent = () => useContent.mockReturnValue({ loreEntries });

afterEach(() => jest.restoreAllMocks());

describe('GmLore', () => {
  it('lists all entries and a count', () => {
    setContent();
    render(<GmLore />);
    expect(screen.getByTestId('lore-form-sandpoint')).toBeInTheDocument();
    expect(screen.getByTestId('lore-form-aroden')).toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();
  });

  it('filters the list by title, category, tag or id', () => {
    setContent();
    render(<GmLore />);
    fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'history' } });
    expect(screen.getByTestId('lore-form-aroden')).toBeInTheDocument();
    expect(screen.queryByTestId('lore-form-sandpoint')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
  });

  it('edits an entry and saves arrays parsed from CSV, preserving createdAt', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmLore />);
    const form = screen.getByTestId('lore-form-sandpoint');
    fireEvent.change(within(form).getByLabelText('tags'), { target: { value: 'town, hub, port' } });
    fireEvent.click(within(form).getByText('Save'));
    expect(await screen.findByRole('status')).toHaveTextContent(/live for every connected player/i);
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('lore');
    expect(id).toBe('sandpoint');
    expect(data.tags).toEqual(['town', 'hub', 'port']);
    expect(data.related).toEqual(['varisia']);
    expect(data.createdAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('requires a title and a category', async () => {
    setContent();
    render(<GmLore />);
    const form = screen.getByTestId('lore-form-aroden');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: '' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/Title is required/));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('creates a new entry with a slug id and a createdAt', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmLore />);
    fireEvent.click(screen.getByText('+ New entry'));
    const form = screen.getByTestId('lore-form-new');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'The Old Light' } });
    fireEvent.change(within(form).getByLabelText('category'), { target: { value: 'Location' } });
    fireEvent.click(within(form).getByText('Create entry'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id, data] = saveDocument.mock.calls[0];
    expect(id).toBe('the-old-light');
    expect(typeof data.createdAt).toBe('string');
  });

  it('deletes an entry after confirmation', async () => {
    setContent();
    deleteDocument.mockResolvedValue({ ok: true });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GmLore />);
    const form = screen.getByTestId('lore-form-aroden');
    fireEvent.click(within(form).getByText('Delete'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('lore', 'aroden'));
  });
});
