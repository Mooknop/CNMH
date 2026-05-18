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

const catalog = [
  { id: 'minor-elixir-of-life', name: 'Minor Elixir of Life', price: 3, weight: 0.1, traits: ['Healing'] },
  { id: 'backpack', name: 'Backpack', weight: 0.1, container: { capacity: 4, ignored: 2 } },
  { id: 'torch', name: 'Torch', weight: 0.1 },
  { id: 'rope-50ft', name: 'Rope (50 ft.)', weight: 1 },
];

// GmCharacters edits the AUTHORED docs (rawCharacters) and reads the catalog
// (items) for the picker.
const setContent = (chars = [pellias, izzy]) =>
  useContent.mockReturnValue({ rawCharacters: chars, items: catalog });

// Slice 1: every saved ref entry now carries a stable `uid` (preserved or
// minted). Shape/lossless/repoint assertions below strip it so they stay
// focused on the non-uid content; uid behaviour is asserted separately in the
// "stable per-entry uids (Slice 1)" block.
const stripUids = (v) => {
  if (Array.isArray(v)) return v.map(stripUids);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).forEach((k) => {
      if (k !== 'uid') out[k] = stripUids(v[k]);
    });
    return out;
  }
  return v;
};
const allUids = (list, acc = []) => {
  (Array.isArray(list) ? list : []).forEach((e) => {
    if (e && typeof e === 'object') {
      if (e.uid != null) acc.push(e.uid);
      if (e.container && e.container.contents) allUids(e.container.contents, acc);
    }
  });
  return acc;
};

afterEach(() => jest.restoreAllMocks());

describe('GmCharacters', () => {
  it('renders a tab per character (+ New) and mounts only the active form', () => {
    setContent();
    render(<GmCharacters />);
    const nav = screen.getByLabelText('characters');
    expect(within(nav).getByText('Pellias')).toBeInTheDocument();
    expect(within(nav).getByText('Izzy')).toBeInTheDocument();
    expect(within(nav).getByText('+ New character')).toBeInTheDocument();
    // First character is active; the other form is not mounted.
    expect(screen.getByTestId('character-form-pellias')).toBeInTheDocument();
    expect(screen.queryByTestId('character-form-izzy')).not.toBeInTheDocument();
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

  it('switches the mounted form when another character tab is clicked', () => {
    setContent([pellias, izzy]);
    render(<GmCharacters />);
    expect(screen.getByTestId('character-form-pellias')).toBeInTheDocument();
    fireEvent.click(within(screen.getByLabelText('characters')).getByText('Izzy'));
    expect(screen.getByTestId('character-form-izzy')).toBeInTheDocument();
    expect(screen.queryByTestId('character-form-pellias')).not.toBeInTheDocument();
  });

  it('the + New character tab shows a blank form', () => {
    setContent([pellias]);
    render(<GmCharacters />);
    fireEvent.click(within(screen.getByLabelText('characters')).getByText('+ New character'));
    expect(screen.getByTestId('character-form-new')).toBeInTheDocument();
    expect(screen.queryByTestId('character-form-pellias')).not.toBeInTheDocument();
  });

  it('lands on the new character tab once it syncs into the list', async () => {
    setContent([pellias]);
    saveDocument.mockResolvedValue({ ok: true });
    const { rerender } = render(<GmCharacters />);
    fireEvent.click(within(screen.getByLabelText('characters')).getByText('+ New character'));
    const form = screen.getByTestId('character-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Bob the Brave' } });
    fireEvent.click(within(form).getByText('Create character'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    // Simulate the live content sync delivering the new character.
    setContent([pellias, { id: 'bob-the-brave', name: 'Bob the Brave' }]);
    rerender(<GmCharacters />);
    expect(screen.getByTestId('character-form-bob-the-brave')).toBeInTheDocument();
    expect(screen.queryByTestId('character-form-pellias')).not.toBeInTheDocument();
  });

  it('falls back to another tab after the active character is deleted', async () => {
    setContent([pellias, izzy]);
    deleteDocument.mockResolvedValue({ ok: true });
    const { rerender } = render(<GmCharacters />);
    fireEvent.click(within(screen.getByLabelText('characters')).getByText('Izzy'));
    const form = screen.getByTestId('character-form-izzy');
    fireEvent.click(within(form).getByText('Delete'));
    fireEvent.change(within(form).getByLabelText('confirm-input'), { target: { value: 'Izzy' } });
    fireEvent.click(within(form).getByText('Delete forever'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('character', 'izzy'));
    // Live sync removes Izzy; the view falls back to the remaining character.
    setContent([pellias]);
    rerender(<GmCharacters />);
    expect(screen.getByTestId('character-form-pellias')).toBeInTheDocument();
    expect(screen.queryByTestId('character-form-izzy')).not.toBeInTheDocument();
  });

  describe('catalog reference rows (Slice 4)', () => {
    const refChar = {
      id: 'refguy',
      name: 'Ref Guy',
      level: 1,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      saves: { fortitude: 0, reflex: 0, will: 0 },
      skills: {},
      proficiencies: {},
      inventory: [
        { ref: 'minor-elixir-of-life', quantity: 2, invested: true },
        { ref: 'backpack', quantity: 1, container: { contents: [{ ref: 'torch', quantity: 5 }] } },
      ],
    };

    it('renders an editable ref row (picker + quantity + invested) with a catalog summary', () => {
      setContent([refChar]);
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-refguy');
      expect(within(form).getByLabelText('item-0-ref')).toHaveValue('minor-elixir-of-life');
      expect(within(form).getByLabelText('item-0-quantity')).toHaveValue(2);
      expect(within(form).getByLabelText('item-0-invested')).toBeChecked();
      expect(within(form).getByTestId('item-0-summary')).toHaveTextContent(/Minor Elixir of Life/);
      // No bespoke inline editors for a reference.
      expect(within(form).queryByLabelText('item-0-name')).not.toBeInTheDocument();
      // The container ref shows an editable nested contents list.
      expect(within(form).getByTestId('item-1-contents')).toBeInTheDocument();
      expect(within(form).getByLabelText('item-1-c-0-ref')).toHaveValue('torch');
      expect(within(form).getByLabelText('item-1-c-0-quantity')).toHaveValue(5);
    });

    it('saves edited quantity/invested and preserves container contents (lossless)', async () => {
      setContent([refChar]);
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-refguy');
      fireEvent.change(within(form).getByLabelText('item-0-quantity'), { target: { value: '5' } });
      fireEvent.click(within(form).getByLabelText('item-0-invested')); // was true -> false
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(stripUids(saveDocument.mock.calls[0][2].inventory)).toEqual([
        { ref: 'minor-elixir-of-life', quantity: 5 },
        { ref: 'backpack', quantity: 1, container: { contents: [{ ref: 'torch', quantity: 5 }] } },
      ]);
    });

    it('repointing the picker to another catalog item drops stale carry-over', async () => {
      setContent([refChar]);
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-refguy');
      fireEvent.change(within(form).getByLabelText('item-1-ref'), { target: { value: 'torch' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      // backpack's container contents must NOT carry onto the torch ref.
      expect(stripUids(saveDocument.mock.calls[0][2].inventory[1])).toEqual({ ref: 'torch', quantity: 1 });
    });

    it('Add item creates a blank ref row (never inline) and blocks save until chosen', async () => {
      const empty = { ...refChar, id: 'empty', name: 'Empty', inventory: [] };
      setContent([empty]);
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-empty');
      fireEvent.click(within(form).getByText('Add item'));
      expect(within(form).getByLabelText('item-0-ref')).toBeInTheDocument();
      expect(within(form).queryByLabelText('item-0-name')).not.toBeInTheDocument();
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() =>
        expect(within(form).getByRole('alert')).toHaveTextContent(/choose a catalog item/i)
      );
      expect(saveDocument).not.toHaveBeenCalled();
      fireEvent.change(within(form).getByLabelText('item-0-ref'), { target: { value: 'torch' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const added = saveDocument.mock.calls[0][2].inventory;
      expect(stripUids(added)).toEqual([{ ref: 'torch', quantity: 1 }]);
      // A newly-added entry is minted a fresh runtime uid.
      expect(typeof added[0].uid).toBe('string');
      expect(added[0].uid).toMatch(/^e-/);
    });

    it('Duplicate to new catalog item creates a catalog doc and repoints the ref', async () => {
      setContent([refChar]);
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-refguy');
      const card0 = within(form).getByTestId('item-0');
      fireEvent.change(within(card0).getByLabelText('item-0-fork-name'), {
        target: { value: 'Major Elixir of Life' },
      });
      fireEvent.click(within(card0).getByText('Duplicate to new catalog item'));
      await waitFor(() =>
        expect(saveDocument).toHaveBeenCalledWith('item', 'major-elixir-of-life', {
          id: 'major-elixir-of-life',
          name: 'Major Elixir of Life',
          price: 3,
          weight: 0.1,
          traits: ['Healing'],
        })
      );
      expect(await within(form).findByRole('status')).toHaveTextContent(/Created catalog item/i);
      expect(within(form).getByLabelText('item-0-ref')).toHaveValue('major-elixir-of-life');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() =>
        expect(saveDocument).toHaveBeenCalledWith('character', 'refguy', expect.anything())
      );
      const charCall = saveDocument.mock.calls.find((c) => c[0] === 'character');
      expect(stripUids(charCall[2].inventory[0])).toEqual({ ref: 'major-elixir-of-life', quantity: 2, invested: true });
    });

    it('fork is rejected without a name or on an id collision', async () => {
      setContent([refChar]);
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-refguy');
      const card0 = within(form).getByTestId('item-0');
      fireEvent.click(within(card0).getByText('Duplicate to new catalog item'));
      await waitFor(() =>
        expect(within(form).getByRole('alert')).toHaveTextContent(/Enter a name/i)
      );
      fireEvent.change(within(card0).getByLabelText('item-0-fork-name'), {
        target: { value: 'Backpack' }, // slug 'backpack' already in catalog
      });
      fireEvent.click(within(card0).getByText('Duplicate to new catalog item'));
      await waitFor(() =>
        expect(within(form).getByRole('alert')).toHaveTextContent(/already exists/i)
      );
      expect(saveDocument).not.toHaveBeenCalled();
    });

    it('flags a legacy inline item but still edits and round-trips it', async () => {
      setContent([pellias]); // pellias has an inline { name:'Full Plate', ... }
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-pellias');
      expect(within(form).getByTestId('item-0-legacy')).toBeInTheDocument();
      fireEvent.change(within(form).getByLabelText('item-0-name'), { target: { value: 'Full Plate +1' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const inv = saveDocument.mock.calls[0][2].inventory;
      expect(inv[0]).toEqual(expect.objectContaining({ name: 'Full Plate +1', price: 30, quantity: 1, weight: 4 }));
      expect(inv[0].ref).toBeUndefined();
    });
  });

  describe('container contents editor (Slice 5)', () => {
    const packed = {
      id: 'packrat',
      name: 'Pack Rat',
      level: 1,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      saves: { fortitude: 0, reflex: 0, will: 0 },
      skills: {},
      proficiencies: {},
      inventory: [
        {
          ref: 'backpack',
          quantity: 1,
          container: {
            contents: [
              { ref: 'torch', quantity: 5 },
              { ref: 'rope-50ft', quantity: 1 },
            ],
          },
        },
        { ref: 'gourd-head', quantity: 1, container: { contents: [] } },
      ],
    };
    // gourd-head is a container in the catalog too.
    const catWithGourd = [...catalog, { id: 'gourd-head', name: 'Gourd Head', weight: 0, container: { capacity: 1, ignored: 0 } }];
    const setPacked = () =>
      useContent.mockReturnValue({ rawCharacters: [packed], items: catWithGourd });

    it('renders each container’s contents as nested editable ref rows', () => {
      setPacked();
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-packrat');
      expect(within(form).getByLabelText('item-0-c-0-ref')).toHaveValue('torch');
      expect(within(form).getByLabelText('item-0-c-1-ref')).toHaveValue('rope-50ft');
      expect(within(form).getByLabelText('item-0-c-1-quantity')).toHaveValue(1);
      // Empty container still shows the (empty) contents editor.
      expect(within(form).getByTestId('item-1-contents')).toBeInTheDocument();
      expect(within(form).queryByLabelText('item-1-c-0-ref')).not.toBeInTheDocument();
    });

    it('round-trips a packed backpack unchanged on save (lossless)', async () => {
      setPacked();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-packrat');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(stripUids(saveDocument.mock.calls[0][2].inventory)).toEqual(packed.inventory);
    });

    it('edits a content quantity and adds/removes contents', async () => {
      setPacked();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-packrat');
      const backpack = within(form).getByTestId('item-0-contents');
      // edit torch qty 5 -> 9
      fireEvent.change(within(backpack).getByLabelText('item-0-c-0-quantity'), { target: { value: '9' } });
      // remove rope (second content)
      const rope = within(form).getByTestId('item-0-c-1');
      fireEvent.click(within(rope).getByText('Remove item'));
      // add a new content and pick it
      fireEvent.click(within(backpack).getByText('Add item to container'));
      fireEvent.change(within(form).getByLabelText('item-0-c-1-ref'), { target: { value: 'minor-elixir-of-life' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(stripUids(saveDocument.mock.calls[0][2].inventory[0])).toEqual({
        ref: 'backpack',
        quantity: 1,
        container: {
          contents: [
            { ref: 'torch', quantity: 9 },
            { ref: 'minor-elixir-of-life', quantity: 1 },
          ],
        },
      });
    });

    it('repointing a container ref to a non-container drops the container on save', async () => {
      setPacked();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-packrat');
      fireEvent.change(within(form).getByLabelText('item-0-ref'), { target: { value: 'torch' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const inv = saveDocument.mock.calls[0][2].inventory;
      expect(stripUids(inv[0])).toEqual({ ref: 'torch', quantity: 1 });
      expect(inv[0].container).toBeUndefined();
    });

    it('repointing a container ref to another container keeps its contents', async () => {
      setPacked();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-packrat');
      fireEvent.change(within(form).getByLabelText('item-0-ref'), { target: { value: 'gourd-head' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(stripUids(saveDocument.mock.calls[0][2].inventory[0])).toEqual({
        ref: 'gourd-head',
        quantity: 1,
        container: {
          contents: [
            { ref: 'torch', quantity: 5 },
            { ref: 'rope-50ft', quantity: 1 },
          ],
        },
      });
    });
  });

  describe('stable per-entry uids (Slice 1)', () => {
    const uidChar = {
      id: 'uidguy',
      name: 'Uid Guy',
      level: 1,
      abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      saves: { fortitude: 0, reflex: 0, will: 0 },
      skills: {},
      proficiencies: {},
      inventory: [
        { uid: 'uidguy-0', ref: 'minor-elixir-of-life', quantity: 2, invested: true },
        {
          uid: 'uidguy-1',
          ref: 'backpack',
          quantity: 1,
          container: { contents: [{ uid: 'uidguy-2', ref: 'torch', quantity: 5 }] },
        },
      ],
    };

    it('preserves every existing uid (top-level + nested) on a lossless save', async () => {
      useContent.mockReturnValue({ rawCharacters: [uidChar], items: catalog });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-uidguy');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const inv = saveDocument.mock.calls[0][2].inventory;
      expect(inv[0].uid).toBe('uidguy-0');
      expect(inv[1].uid).toBe('uidguy-1');
      expect(inv[1].container.contents[0].uid).toBe('uidguy-2');
      // and the rest still round-trips unchanged
      expect(stripUids(inv)).toEqual([
        { ref: 'minor-elixir-of-life', quantity: 2, invested: true },
        { ref: 'backpack', quantity: 1, container: { contents: [{ ref: 'torch', quantity: 5 }] } },
      ]);
    });

    it('keeps the uid when the picker repoints the ref (placement identity)', async () => {
      useContent.mockReturnValue({ rawCharacters: [uidChar], items: catalog });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-uidguy');
      fireEvent.change(within(form).getByLabelText('item-0-ref'), { target: { value: 'torch' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const e0 = saveDocument.mock.calls[0][2].inventory[0];
      expect(e0.uid).toBe('uidguy-0'); // survives the repoint
      // repoint drops only extra/container carry-over (Slice 4 behaviour);
      // quantity/invested are explicit per-character fields and remain.
      expect(stripUids(e0)).toEqual({ ref: 'torch', quantity: 2, invested: true });
    });

    it('mints a fresh runtime uid for an entry added to a container', async () => {
      useContent.mockReturnValue({ rawCharacters: [uidChar], items: catalog });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmCharacters />);
      const form = screen.getByTestId('character-form-uidguy');
      const backpack = within(form).getByTestId('item-1-contents');
      fireEvent.click(within(backpack).getByText('Add item to container'));
      fireEvent.change(within(form).getByLabelText('item-1-c-1-ref'), { target: { value: 'rope-50ft' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const contents = saveDocument.mock.calls[0][2].inventory[1].container.contents;
      expect(contents[0].uid).toBe('uidguy-2'); // existing preserved
      expect(typeof contents[1].uid).toBe('string'); // new one minted
      expect(contents[1].uid).toMatch(/^e-/);
      // every saved entry has a uid, all unique
      const uids = allUids(saveDocument.mock.calls[0][2].inventory);
      expect(uids.length).toBe(4);
      expect(new Set(uids).size).toBe(4);
    });
  });
});
