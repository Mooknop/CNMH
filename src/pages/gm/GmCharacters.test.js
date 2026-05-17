import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmCharacters from './GmCharacters';

jest.mock('../../contexts/ContentContext', () => ({ useContent: jest.fn() }));
jest.mock('../../utils/gmApi', () => ({ saveDocument: jest.fn(), deleteDocument: jest.fn() }));
const { useContent } = require('../../contexts/ContentContext');
const { saveDocument, deleteDocument } = require('../../utils/gmApi');

const pellias = {
  id: 'pellias',
  name: 'Pellias',
  class: 'Champion',
  level: 4,
  abilities: { strength: 18, dexterity: 10, constitution: 16, intelligence: 10, wisdom: 12, charisma: 12 },
  saves: { fortitude: 11, reflex: 6, will: 9 },
  skills: { athletics: { proficiency: 2 }, lore: [{ name: 'Thassilonian', proficiency: 1 }] },
  proficiencies: {
    class: 1,
    weapons: { simple: { proficiency: 1, name: 'Trained' }, martial: { proficiency: 1, name: 'Trained' }, advanced: { proficiency: 0, name: 'Untrained' }, unarmed: { proficiency: 1, name: 'Trained' } },
    armor: { unarmored: { proficiency: 1, name: 'Trained' }, light: { proficiency: 1, name: 'Trained' }, medium: { proficiency: 1, name: 'Trained' }, heavy: { proficiency: 1, name: 'Trained' } },
  },
  inventory: [],
};

const izzy = {
  id: 'izzy',
  name: 'Izzy',
  class: 'Bard',
  level: 4,
  abilities: { strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 18 },
  saves: { fortitude: 7, reflex: 9, will: 11 },
  skills: {},
  proficiencies: {},
  spellcasting: {
    tradition: 'Occult',
    ability: 'charisma',
    proficiency: 1,
    focus: { max: 3, current: 1 },
    spell_slots: { 1: 4, 2: 3 },
    spells: [
      { id: 'spell-3', name: 'Daze', level: 0, baseLevel: 1, traits: ['Cantrip', 'Mental'], actions: 'Two Actions', description: 'A mental jolt.', heightened: { '+1': '+1d6' } },
    ],
  },
  inventory: [],
};

const setContent = (chars = [pellias, izzy]) => useContent.mockReturnValue({ characters: chars });

afterEach(() => jest.restoreAllMocks());

describe('GmCharacters', () => {
  it('renders a form per character', () => {
    setContent();
    render(<GmCharacters />);
    expect(screen.getByTestId('character-form-pellias')).toBeInTheDocument();
    expect(screen.getByTestId('character-form-izzy')).toBeInTheDocument();
  });

  it('non-caster shows "Add spellcasting" and saves without a spellcasting key', async () => {
    setContent([pellias]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    expect(within(form).getByText('Add spellcasting')).toBeInTheDocument();
    const advanced = within(form).getByLabelText('advanced-json');
    expect(advanced.value).toContain('inventory');
    expect(advanced.value).not.toContain('spellcasting');
    expect(advanced.value).not.toContain('proficiencies');
    fireEvent.click(within(form).getByText('Save'));
    await screen.findByRole('status');
    expect(saveDocument.mock.calls[0][2].spellcasting).toBeUndefined();
  });

  it('caster pulls spellcasting out of Advanced and pre-fills the form', () => {
    setContent([izzy]);
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-izzy');
    expect(within(form).getByLabelText('sc-tradition')).toHaveValue('Occult');
    expect(within(form).getByLabelText('spell-0-name')).toHaveValue('Daze');
    expect(within(form).getByLabelText('advanced-json').value).not.toContain('spellcasting');
  });

  it('edits spellcasting + a spell and saves the rebuilt structure', async () => {
    setContent([izzy]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-izzy');
    fireEvent.change(within(form).getByLabelText('sc-tradition'), { target: { value: 'Arcane' } });
    fireEvent.change(within(form).getByLabelText('sc-focus-current'), { target: { value: '2' } });
    fireEvent.change(within(form).getByLabelText('spell-0-name'), { target: { value: 'Daze (mod)' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const data = saveDocument.mock.calls[0][2];
    expect(data.spellcasting.tradition).toBe('Arcane');
    expect(data.spellcasting.proficiency).toBe(1);
    expect(data.spellcasting.focus).toEqual({ max: 3, current: 2 });
    expect(data.spellcasting.spell_slots).toEqual({ 1: 4, 2: 3 });
    expect(data.spellcasting.spells[0]).toEqual(
      expect.objectContaining({ id: 'spell-3', name: 'Daze (mod)', level: 0, baseLevel: 1, traits: ['Cantrip', 'Mental'], heightened: { '+1': '+1d6' } })
    );
  });

  it('adds a spell to a caster', async () => {
    setContent([izzy]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-izzy');
    fireEvent.click(within(form).getByText('Add spell'));
    fireEvent.change(within(form).getByLabelText('spell-1-name'), { target: { value: 'Fireball' } });
    fireEvent.change(within(form).getByLabelText('spell-1-level'), { target: { value: '3' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const spells = saveDocument.mock.calls[0][2].spellcasting.spells;
    expect(spells).toHaveLength(2);
    expect(spells[1]).toEqual(expect.objectContaining({ name: 'Fireball', level: 3 }));
  });

  it('can add spellcasting to a non-caster', async () => {
    setContent([pellias]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.click(within(form).getByText('Add spellcasting'));
    fireEvent.change(within(form).getByLabelText('sc-tradition'), { target: { value: 'Divine' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].spellcasting.tradition).toBe('Divine');
  });

  it('still rebuilds skills/proficiencies (5a/5b) and merges Advanced', async () => {
    setContent([pellias]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('arcana'), { target: { value: '3' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const data = saveDocument.mock.calls[0][2];
    expect(data.skills.athletics).toEqual({ proficiency: 2 });
    expect(data.skills.arcana).toEqual({ proficiency: 3 });
    expect(data.skills.lore).toEqual([{ name: 'Thassilonian', proficiency: 1 }]);
    expect(data.proficiencies.weapons.simple).toEqual({ proficiency: 1, name: 'Trained' });
    expect(data.inventory).toEqual([]);
  });

  it('blocks saving with an empty name', async () => {
    setContent([pellias]);
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: '' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/Name is required/));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('rejects invalid or non-object Advanced JSON', async () => {
    setContent([pellias]);
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
    setContent([]);
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
    setContent([pellias]);
    deleteDocument.mockResolvedValue({ ok: true });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.click(within(form).getByText('Delete'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('character', 'pellias'));
  });
});
