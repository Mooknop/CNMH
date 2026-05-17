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
  skills: { athletics: { proficiency: 2 } },
  proficiencies: { class: 1, weapons: {}, armor: {} },
  inventory: [{ id: 'item-1', name: 'Full Plate', price: 30, quantity: 1, weight: 4 }],
  feats: [{ id: 'feat-1', name: 'Ranger Dedication', level: 2, source: 'Archetype', description: 'Hunt prey.' }],
  strikes: [{ name: 'Pick', proficiency: 'martial', damage: '1d6' }],
  actions: [{ name: 'Exploit Vulnerability', actionCount: 1, traits: ['Thaumaturge'] }],
  reactions: [],
  familiar: { name: 'Lazarus', type: 'Squox', ac: 20, hp: 20 },
  crafting: [{ name: 'Repair Kit' }],
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

  it('pulls feats/strikes/actions/familiar out of Advanced; only class blocks/crafting remain', () => {
    setContent([pellias]);
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    expect(within(form).getByLabelText('feats-0-name')).toHaveValue('Ranger Dedication');
    expect(within(form).getByLabelText('feats-0-json').value).toContain('Archetype');
    expect(within(form).getByLabelText('strikes-0-name')).toHaveValue('Pick');
    expect(within(form).getByLabelText('actions-0-name')).toHaveValue('Exploit Vulnerability');
    expect(within(form).getByLabelText('familiar-json').value).toContain('Lazarus');
    const adv = within(form).getByLabelText('advanced-json').value;
    expect(adv).toContain('crafting');
    expect(adv).not.toContain('feats');
    expect(adv).not.toContain('familiar');
  });

  it('rebuilds array sections + object sections on save, preserving nested fields', async () => {
    setContent([pellias]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('feats-0-name'), { target: { value: 'Ranger Dedication+' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const data = saveDocument.mock.calls[0][2];
    expect(data.feats[0]).toEqual(
      expect.objectContaining({ id: 'feat-1', name: 'Ranger Dedication+', level: 2, source: 'Archetype' })
    );
    expect(data.strikes[0]).toEqual({ name: 'Pick', proficiency: 'martial', damage: '1d6' });
    expect(data.reactions).toEqual([]);
    expect(data.familiar).toEqual({ name: 'Lazarus', type: 'Squox', ac: 20, hp: 20 });
    expect(data.crafting).toEqual([{ name: 'Repair Kit' }]); // still via Advanced
  });

  it('adds and removes array entries', async () => {
    setContent([pellias]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.click(within(form).getByText('Add feats entry'));
    fireEvent.change(within(form).getByLabelText('feats-1-name'), { target: { value: 'Toughness' } });
    fireEvent.click(within(form).getAllByText('Remove feats entry')[0]);
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].feats.map((x) => x.name)).toEqual(['Toughness']);
  });

  it('blocks save when an array entry lacks a name or has bad JSON', async () => {
    setContent([pellias]);
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('feats-0-json'), { target: { value: '{ broken' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/Feats entry "Ranger Dedication" has invalid JSON/i));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('toggles an object section and validates its JSON', async () => {
    setContent([izzy]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-izzy');
    // izzy has no familiar -> add it
    fireEvent.click(within(form).getByText('Add familiar'));
    fireEvent.change(within(form).getByLabelText('familiar-json'), { target: { value: '{ bad' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/Familiar is not valid JSON/i));
    fireEvent.change(within(form).getByLabelText('familiar-json'), { target: { value: '{"name":"Sprout"}' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].familiar).toEqual({ name: 'Sprout' });
  });

  it('non-having object section saves without that key', async () => {
    setContent([izzy]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-izzy');
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const data = saveDocument.mock.calls[0][2];
    expect(data.familiar).toBeUndefined();
    expect(data.animalCompanion).toBeUndefined();
  });

  it('still handles spellcasting (5c), inventory (5d), skills (5b)', async () => {
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

  it('blocks saving with an empty name and rejects bad Advanced JSON', async () => {
    setContent([pellias]);
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: '' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/Name is required/));
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Pellias' } });
    fireEvent.change(within(form).getByLabelText('advanced-json'), { target: { value: '[]' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/must be an object/i));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('creates a new character with a slug id', async () => {
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
        expect.objectContaining({ id: 'bob-the-brave', name: 'Bob the Brave', feats: [], inventory: [] })
      )
    );
  });

  it('exercises identity/abilities/saves/proficiency/lore handlers', async () => {
    setContent([pellias]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.change(within(form).getByLabelText('ancestry'), { target: { value: 'Human' } });
    fireEvent.change(within(form).getByLabelText('maxHp'), { target: { value: '62' } });
    fireEvent.change(within(form).getByLabelText('strength'), { target: { value: '20' } });
    fireEvent.change(within(form).getByLabelText('will'), { target: { value: '12' } });
    fireEvent.change(within(form).getByLabelText('class-proficiency'), { target: { value: '2' } });
    fireEvent.change(within(form).getByLabelText('simple'), { target: { value: '2' } });
    fireEvent.change(within(form).getByLabelText('light'), { target: { value: '1' } });
    fireEvent.click(within(form).getByText('Add lore'));
    fireEvent.change(within(form).getByLabelText('lore-0-name'), { target: { value: 'Heraldry' } });
    fireEvent.change(within(form).getByLabelText('lore-0-proficiency'), { target: { value: '2' } });
    fireEvent.click(within(form).getByText('Remove')); // remove the lore row
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const data = saveDocument.mock.calls[0][2];
    expect(data.ancestry).toBe('Human');
    expect(data.maxHp).toBe(62);
    expect(data.abilities.strength).toBe(20);
    expect(data.saves.will).toBe(12);
    expect(data.proficiencies.class).toBe(2);
    expect(data.proficiencies.weapons.simple).toEqual({ proficiency: 2, name: 'Expert' });
    expect(data.skills.lore).toBeUndefined();
  });

  it('exercises spellcasting slot/spell/heightened handlers', async () => {
    setContent([izzy]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-izzy');
    // izzy already has slot-0 ({1:4}); add two more, edit one, remove one
    fireEvent.click(within(form).getByText('Add slot rank'));
    fireEvent.click(within(form).getByText('Add slot rank'));
    fireEvent.change(within(form).getByLabelText('slot-1-level'), { target: { value: '3' } });
    fireEvent.change(within(form).getByLabelText('slot-1-count'), { target: { value: '2' } });
    fireEvent.click(within(form).getAllByText('Remove')[2]); // drop the empty slot-2
    fireEvent.click(within(form).getByText('Add spell'));
    const spell1 = within(form).getByTestId('spell-1');
    fireEvent.change(within(spell1).getByLabelText('spell-1-name'), { target: { value: 'Heal' } });
    fireEvent.change(within(spell1).getByLabelText('spell-1-level'), { target: { value: '1' } });
    fireEvent.change(within(spell1).getByLabelText('spell-1-traits'), { target: { value: 'Healing, Vitality' } });
    fireEvent.change(within(spell1).getByLabelText('spell-1-description'), { target: { value: 'Restore HP.' } });
    fireEvent.click(within(spell1).getByText('Add heightened'));
    fireEvent.change(within(spell1).getByLabelText('spell-1-h-0-key'), { target: { value: '+1' } });
    fireEvent.change(within(spell1).getByLabelText('spell-1-h-0-text'), { target: { value: '+8 HP' } });
    fireEvent.click(within(spell1).getByText('Remove')); // heightened row remove (exact text)
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const sc = saveDocument.mock.calls[0][2].spellcasting;
    expect(sc.spell_slots).toEqual({ 1: 4, 3: 2 });
    expect(sc.spells[1]).toEqual(expect.objectContaining({ name: 'Heal', level: 1, traits: ['Healing', 'Vitality'] }));
  });

  it('removes an object section and adds another', async () => {
    setContent([pellias]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.click(within(form).getByText('Add actions entry'));
    fireEvent.change(within(form).getByLabelText('actions-1-name'), { target: { value: 'Stride' } });
    fireEvent.click(within(form).getAllByText(/Remove actions entry/)[1]);
    fireEvent.click(within(form).getByText('Remove familiar'));
    fireEvent.click(within(form).getByText('Add animal companion'));
    fireEvent.change(within(form).getByLabelText('animalCompanion-json'), { target: { value: '{"name":"Rex"}' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const data = saveDocument.mock.calls[0][2];
    expect(data.familiar).toBeUndefined();
    expect(data.animalCompanion).toEqual({ name: 'Rex' });
    expect(data.actions.map((a) => a.name)).toEqual(['Exploit Vulnerability']);
  });

  it('deletes a character only after typed confirmation', async () => {
    setContent([pellias]);
    deleteDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    const form = screen.getByTestId('character-form-pellias');
    fireEvent.click(within(form).getByText('Delete'));
    expect(within(form).getByText('Delete forever')).toBeDisabled();
    fireEvent.click(within(form).getByText('Delete forever'));
    expect(deleteDocument).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText('confirm-input'), { target: { value: 'Pellias' } });
    fireEvent.click(within(form).getByText('Delete forever'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('character', 'pellias'));
  });

  it('warns before overwriting an existing id when creating a new character', async () => {
    setContent([pellias]);
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCharacters />);
    fireEvent.click(screen.getByText('+ New character'));
    const form = screen.getByTestId('character-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Pellias' } });
    fireEvent.click(within(form).getByText('Create character'));
    expect(saveDocument).not.toHaveBeenCalled();
    fireEvent.click(within(form).getByText('Overwrite'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith('character', 'pellias', expect.objectContaining({ id: 'pellias' }))
    );
  });
});
