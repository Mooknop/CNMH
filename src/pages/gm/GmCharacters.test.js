import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmCharacters from './GmCharacters';

jest.mock('../../contexts/ContentContext', () => ({ useContent: jest.fn() }));
jest.mock('../../utils/gmApi', () => ({ saveDocument: jest.fn(), deleteDocument: jest.fn() }));
const { useContent } = require('../../contexts/ContentContext');
const { saveDocument, deleteDocument } = require('../../utils/gmApi');

const characters = [
  {
    id: 'pellias',
    name: 'Pellias',
    ancestry: 'Human',
    class: 'Champion',
    level: 4,
    maxHp: 60,
    ac: 22,
    speed: 20,
    abilities: { strength: 18, dexterity: 10, constitution: 16, intelligence: 10, wisdom: 12, charisma: 12 },
    saves: { fortitude: 11, reflex: 6, will: 9 },
    skills: { athletics: 5 },
    spells: { focus: [] },
  },
];

const setContent = () => useContent.mockReturnValue({ characters });

afterEach(() => jest.restoreAllMocks());

describe('GmCharacters', () => {
  it('renders a form per character', () => {
    setContent();
    render(<GmCharacters />);
    expect(screen.getByTestId('character-form-pellias')).toBeInTheDocument();
    expect(screen.getByText('+ New character')).toBeInTheDocument();
  });

  it('edits identity and saves, coercing numbers and merging the advanced JSON', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('level'), { target: { value: '5' } });
    fireEvent.click(within(form).getByText('Save'));
    expect(await screen.findByRole('status')).toHaveTextContent(/live for every connected player/i);
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('character');
    expect(id).toBe('pellias');
    expect(data.level).toBe(5);
    expect(data.abilities.strength).toBe(18);
    expect(data.saves.will).toBe(9);
    // deep nested sections survive via the Advanced blob
    expect(data.skills).toEqual({ athletics: 5 });
    expect(data.spells).toEqual({ focus: [] });
  });

  it('blocks saving with an empty name', async () => {
    setContent();
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: '' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/Name is required/));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('rejects invalid advanced JSON', async () => {
    setContent();
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('advanced'), { target: { value: '{ not json' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/not valid JSON/i));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('rejects advanced JSON that is not an object', async () => {
    setContent();
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('advanced'), { target: { value: '[]' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/must be an object/i));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('creates a new character with a slug id derived from the name', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    fireEvent.click(screen.getByText('+ New character'));
    const form = screen.getByTestId('character-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Bob the Brave' } });
    fireEvent.click(within(form).getByText('Create character'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith(
        'character',
        'bob-the-brave',
        expect.objectContaining({ id: 'bob-the-brave', name: 'Bob the Brave' })
      )
    );
  });

  it('deletes a character after confirmation', async () => {
    setContent();
    deleteDocument.mockResolvedValue({ ok: true });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.click(within(form).getByText('Delete'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('character', 'pellias'));
  });
});
