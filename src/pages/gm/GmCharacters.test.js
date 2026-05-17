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
    skills: {
      athletics: { proficiency: 2 },
      religion: { proficiency: 1 },
      lore: [{ name: 'Thassilonian', proficiency: 1 }],
    },
    proficiencies: {
      class: 1,
      weapons: {
        simple: { proficiency: 1, name: 'Trained' },
        martial: { proficiency: 1, name: 'Trained' },
        advanced: { proficiency: 0, name: 'Untrained' },
        unarmed: { proficiency: 1, name: 'Trained' },
      },
      armor: {
        unarmored: { proficiency: 1, name: 'Trained' },
        light: { proficiency: 1, name: 'Trained' },
        medium: { proficiency: 1, name: 'Trained' },
        heavy: { proficiency: 0, name: 'Untrained' },
      },
    },
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

  it('keeps skills/proficiencies out of the Advanced blob but leaves spells in', () => {
    setContent();
    render(<GmCharacters />);
    const advanced = within(screen.getByTestId('character-form-pellias')).getByLabelText('advanced-json');
    expect(advanced.value).toContain('spells');
    expect(advanced.value).not.toContain('athletics');
    expect(advanced.value).not.toContain('proficiencies');
  });

  it('rebuilds skills/proficiencies from the bespoke forms and merges Advanced', async () => {
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
    // skills: trained+ kept, untrained omitted, lore preserved
    expect(data.skills.athletics).toEqual({ proficiency: 2 });
    expect(data.skills.religion).toEqual({ proficiency: 1 });
    expect(data.skills.acrobatics).toBeUndefined();
    expect(data.skills.lore).toEqual([{ name: 'Thassilonian', proficiency: 1 }]);
    // proficiencies rebuilt with synced tier names
    expect(data.proficiencies.class).toBe(1);
    expect(data.proficiencies.weapons.simple).toEqual({ proficiency: 1, name: 'Trained' });
    expect(data.proficiencies.armor.heavy).toEqual({ proficiency: 0, name: 'Untrained' });
    // deep section still flows through Advanced
    expect(data.spells).toEqual({ focus: [] });
  });

  it('edits a skill tier and a weapon tier with synced labels', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('arcana'), { target: { value: '3' } });
    fireEvent.change(within(form).getByLabelText('martial'), { target: { value: '2' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const data = saveDocument.mock.calls[0][2];
    expect(data.skills.arcana).toEqual({ proficiency: 3 });
    expect(data.proficiencies.weapons.martial).toEqual({ proficiency: 2, name: 'Expert' });
  });

  it('adds and removes lore entries', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.click(within(form).getByText('Add lore'));
    fireEvent.change(within(form).getByLabelText('lore-1-name'), { target: { value: 'Heraldry' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].skills.lore).toEqual([
      { name: 'Thassilonian', proficiency: 1 },
      { name: 'Heraldry', proficiency: 1 },
    ]);
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

  it('rejects invalid or non-object Advanced JSON', async () => {
    setContent();
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('advanced-json'), { target: { value: '{ not json' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/not valid JSON/i));

    fireEvent.change(within(form).getByLabelText('advanced-json'), { target: { value: '[]' } });
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
