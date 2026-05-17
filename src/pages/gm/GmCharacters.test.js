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
  inventory: [
    { id: 'item-1', name: 'Full Plate', price: 30, quantity: 1, weight: 4, traits: ['Bulwark'], description: 'Heavy armor.' },
    {
      name: '+1 Striking Pick',
      price: 100.1,
      quantity: 1,
      weight: 1,
      potency: 1,
      traits: ['Fatal 1d10'],
      strikes: { proficiency: 'martial', type: 'melee', action: 1, damage: '2d6' },
    },
  ],
  feats: [{ name: 'Toughness' }],
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
    tradition: 'Occult', ability: 'charisma', proficiency: 1,
    focus: { max: 3, current: 1 }, spell_slots: { 1: 4 },
    spells: [{ id: 'spell-3', name: 'Daze', level: 0, baseLevel: 1, traits: ['Cantrip'] }],
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

  it('pulls inventory out of Advanced and pre-fills bespoke + per-item JSON', () => {
    setContent([pellias]);
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    expect(within(form).getByLabelText('item-0-name')).toHaveValue('Full Plate');
    expect(within(form).getByLabelText('item-0-price')).toHaveValue(30);
    // nested item structures live in the per-item JSON box
    expect(within(form).getByLabelText('item-1-json').value).toContain('strikes');
    // character Advanced no longer holds inventory, but still holds feats
    const adv = within(form).getByLabelText('advanced-json').value;
    expect(adv).toContain('feats');
    expect(adv).not.toContain('inventory');
    expect(adv).not.toContain('Full Plate');
  });

  it('rebuilds inventory on save, preserving nested item fields and decimals', async () => {
    setContent([pellias]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('item-0-name'), { target: { value: 'Full Plate +1' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const data = saveDocument.mock.calls[0][2];
    expect(data.inventory).toHaveLength(2);
    expect(data.inventory[0]).toEqual(
      expect.objectContaining({ id: 'item-1', name: 'Full Plate +1', price: 30, quantity: 1, weight: 4, traits: ['Bulwark'] })
    );
    expect(data.inventory[1]).toEqual(
      expect.objectContaining({ name: '+1 Striking Pick', price: 100.1, potency: 1, strikes: { proficiency: 'martial', type: 'melee', action: 1, damage: '2d6' } })
    );
    // feats still round-trips through character Advanced
    expect(data.feats).toEqual([{ name: 'Toughness' }]);
  });

  it('adds and removes inventory items', async () => {
    setContent([pellias]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.click(within(form).getByText('Add item'));
    fireEvent.change(within(form).getByLabelText('item-2-name'), { target: { value: 'Torch' } });
    fireEvent.click(within(form).getAllByText('Remove item')[0]); // drop Full Plate
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const names = saveDocument.mock.calls[0][2].inventory.map((i) => i.name);
    expect(names).toEqual(['+1 Striking Pick', 'Torch']);
  });

  it('blocks save when an item is missing a name', async () => {
    setContent([pellias]);
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('item-0-name'), { target: { value: '' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/Inventory item 1 needs a name/i));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('blocks save when a per-item JSON box is invalid', async () => {
    setContent([pellias]);
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('item-0-json'), { target: { value: '{ broken' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/invalid JSON in its extra fields/i));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('still handles spellcasting (5c) and skills/proficiencies (5a/5b)', async () => {
    setContent([izzy]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-izzy');
    fireEvent.change(within(form).getByLabelText('sc-tradition'), { target: { value: 'Arcane' } });
    fireEvent.change(within(form).getByLabelText('arcana'), { target: { value: '2' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const data = saveDocument.mock.calls[0][2];
    expect(data.spellcasting.tradition).toBe('Arcane');
    expect(data.skills.arcana).toEqual({ proficiency: 2 });
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

  it('rejects invalid character Advanced JSON', async () => {
    setContent([pellias]);
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('advanced-json'), { target: { value: '{ not json' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/not valid JSON/i));
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
        expect.objectContaining({ id: 'bob-the-brave', name: 'Bob the Brave', inventory: [] })
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
