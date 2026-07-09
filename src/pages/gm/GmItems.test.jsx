import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmItems from './GmItems';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({
  saveDocument: vi.fn(),
  deleteDocument: vi.fn(),
  fetchHistory: vi.fn(),
  restoreVersion: vi.fn(),
}));
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';

const items = [
  {
    id: 'minor-elixir-of-life',
    name: 'Minor Elixir of Life',
    price: 3,
    weight: 0.1,
    traits: ['Alchemical', 'Healing'],
    description: 'Regain 1d6 HP.',
  },
  {
    id: 'backpack',
    name: 'Backpack',
    price: 0.1,
    weight: 0.1,
    description: 'Holds your gear.',
    container: { capacity: 4, ignored: 2 },
  },
  {
    id: 'scroll-friendfetch',
    name: 'Scroll of Friendfetch',
    price: 4,
    weight: 0,
    traits: ['Consumable', 'Scroll'],
    scroll: { spellRef: 'friendfetch' },
  },
];

const hammerItem = {
  id: 'xanderghuls-flawless-hammer',
  name: "Xanderghul's Flawless Hammer",
  weight: 2,
  traits: ['Artifact', 'Staff', 'Magical'],
  description: 'An Alara\'quin of the Runelord of Pride.',
  strikes: { proficiency: 'simple', type: 'melee', action: 1, damage: '1d12' },
  staff: {
    name: "Xanderghul's Flawless Hammer",
    charges: { max: 3, current: 3 },
    spells: [{ ref: 'figment' }, { ref: 'mirror-image' }],
  },
  artifact: { tiers: [{ level: 1, grants: ['strikes'] }, { level: 4, grants: ['staff'] }] },
};

const spells = [
  { id: 'sleep', name: 'Sleep', level: 1 },
  { id: 'figment', name: 'Figment', level: 0 },
  { id: 'mirror-image', name: 'Mirror Image', level: 2 },
  { id: 'friendfetch', name: 'Friendfetch', level: 1, traits: ['Uncommon', 'Force'] },
];

const setContent = () => useContent.mockReturnValue({ items, spells, images: [] });

afterEach(() => vi.restoreAllMocks());

// Helper: select an item list button to open its form in the detail pane.
const selectItem = (name) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('GmItems', () => {
  it('lists all catalog items as master-list buttons and a count', () => {
    setContent();
    render(<GmItems />);
    expect(screen.getByRole('button', { name: 'Minor Elixir of Life' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Backpack' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scroll of Friendfetch' })).toBeInTheDocument();
    expect(screen.queryByTestId('item-form-minor-elixir-of-life')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 3 of 3/)).toBeInTheDocument();
  });

  it('hides rune item entries from the general list (#885)', () => {
    useContent.mockReturnValue({
      items: [
        ...items,
        { id: 'slick', name: 'Slick', price: 45, armorRune: true, traits: ['Magical'] },
        { id: 'weapon-potency', name: 'Weapon Potency', price: 35, traits: ['Magical'] },
      ],
      spells, images: [],
      runes: [{ id: 'slick', type: 'property', armorRune: true }],
    });
    render(<GmItems />);
    expect(screen.getByText(/Showing 3 of 3/)).toBeInTheDocument(); // runes excluded
    expect(screen.queryByRole('button', { name: 'Slick' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Weapon Potency' })).not.toBeInTheDocument();
  });

  it('filters the list by name, trait or id', () => {
    setContent();
    render(<GmItems />);
    fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'healing' } });
    expect(screen.getByRole('button', { name: 'Minor Elixir of Life' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Backpack' })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 3/)).toBeInTheDocument();
  });

  it('edits an item and saves scalars + traits parsed from CSV', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    selectItem('Minor Elixir of Life');
    const form = screen.getByTestId('item-form-minor-elixir-of-life');
    fireEvent.change(within(form).getByLabelText('price'), { target: { value: '5.5' } });
    fireEvent.change(within(form).getByLabelText('traits'), {
      target: { value: 'Alchemical, Healing, Elixir' },
    });
    fireEvent.click(within(form).getByText('Save'));
    expect(await screen.findByRole('status')).toHaveTextContent(/live for every connected player/i);
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('item');
    expect(id).toBe('minor-elixir-of-life');
    expect(data.price).toBe(5.5);
    expect(data.traits).toEqual(['Alchemical', 'Healing', 'Elixir']);
    expect(data.description).toBe('Regain 1d6 HP.');
  });

  it('requires a name', async () => {
    setContent();
    render(<GmItems />);
    selectItem('Backpack');
    const form = screen.getByTestId('item-form-backpack');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: '' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(/name is required/i)
    );
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('creates a new item with a slug id', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    fireEvent.click(screen.getByText('+ New item'));
    const form = screen.getByTestId('item-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: "Healer's Gloves" } });
    fireEvent.click(within(form).getByText('Create item'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id, data] = saveDocument.mock.calls[0];
    expect(id).toBe('healers-gloves');
    expect(data.name).toBe("Healer's Gloves");
  });

  it('deletes an item only after typed confirmation', async () => {
    setContent();
    deleteDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    selectItem('Backpack');
    const form = screen.getByTestId('item-form-backpack');
    fireEvent.click(within(form).getByText('Delete'));
    expect(screen.getByText('Delete forever')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'Backpack' } });
    fireEvent.click(screen.getByText('Delete forever'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('item', 'backpack'));
  });

  it('warns before overwriting an existing id when creating a new item', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    fireEvent.click(screen.getByText('+ New item'));
    const form = screen.getByTestId('item-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Backpack' } });
    fireEvent.click(within(form).getByText('Create item'));
    expect(saveDocument).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Overwrite'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith(
        'item',
        'backpack',
        expect.objectContaining({ id: 'backpack' })
      )
    );
  });

  it('round-trips container capacity/ignored as numbers', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    selectItem('Backpack');
    const form = screen.getByTestId('item-form-backpack');
    // Pre-filled from the existing container.
    expect(within(form).getByLabelText('container-capacity')).toHaveValue(4);
    fireEvent.change(within(form).getByLabelText('container-ignored'), { target: { value: '3' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, , data] = saveDocument.mock.calls[0];
    expect(data.container).toEqual({ capacity: 4, ignored: 3 });
    // No per-character contents leak into the catalog definition.
    expect(data.container.contents).toBeUndefined();
  });

  it('can turn a plain item into a container via the toggle', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    selectItem('Minor Elixir of Life');
    const form = screen.getByTestId('item-form-minor-elixir-of-life');
    expect(within(form).queryByLabelText('container-capacity')).not.toBeInTheDocument();
    fireEvent.click(within(form).getByLabelText('is-container'));
    fireEvent.change(within(form).getByLabelText('container-capacity'), { target: { value: '2' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].container).toEqual({ capacity: 2, ignored: 0 });
  });

  it('round-trips an existing armor block as numbers (AC1, #747)', async () => {
    const armorItem = {
      id: 'full-plate',
      name: 'Full Plate',
      price: 30,
      weight: 4,
      armor: { category: 'heavy', acBonus: 6, dexCap: 0, strength: 18, group: 'plate' },
    };
    useContent.mockReturnValue({ items: [armorItem], spells, images: [] });
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    selectItem('Full Plate');
    const form = screen.getByTestId('item-form-full-plate');
    // Pre-filled from the existing armor block.
    expect(within(form).getByLabelText('armor-category')).toHaveValue('heavy');
    expect(within(form).getByLabelText('armor-ac-bonus')).toHaveValue(6);
    expect(within(form).getByLabelText('armor-dex-cap')).toHaveValue(0);
    fireEvent.change(within(form).getByLabelText('armor-ac-bonus'), { target: { value: '7' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].armor).toEqual({
      category: 'heavy',
      acBonus: 7,
      dexCap: 0,
      strength: 18,
      group: 'plate',
    });
  });

  it('turns a plain item into armor via the toggle, omitting blank stats (AC1)', async () => {
    const plain = { id: 'leather', name: 'Leather', price: 2, weight: 1 };
    useContent.mockReturnValue({ items: [plain], spells, images: [] });
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    selectItem('Leather');
    const form = screen.getByTestId('item-form-leather');
    expect(within(form).queryByLabelText('armor-category')).not.toBeInTheDocument();
    fireEvent.click(within(form).getByLabelText('is-armor'));
    fireEvent.change(within(form).getByLabelText('armor-category'), { target: { value: 'light' } });
    fireEvent.change(within(form).getByLabelText('armor-ac-bonus'), { target: { value: '1' } });
    fireEvent.change(within(form).getByLabelText('armor-dex-cap'), { target: { value: '4' } });
    // strength + group left blank — they must not appear in the saved block.
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].armor).toEqual({ category: 'light', acBonus: 1, dexCap: 4 });
  });

  it('rejects an `armor` block pasted into the raw-JSON box (AC1)', async () => {
    const plain = { id: 'club', name: 'Club', price: 0, weight: 1 };
    useContent.mockReturnValue({ items: [plain], spells, images: [] });
    render(<GmItems />);
    selectItem('Club');
    const form = screen.getByTestId('item-form-club');
    fireEvent.change(within(form).getByLabelText('rest-json'), {
      target: { value: '{"armor":{"category":"heavy"}}' },
    });
    fireEvent.click(within(form).getByText('Save'));
    expect(await within(form).findByRole('alert')).toHaveTextContent(/armor/);
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('round-trips a scroll spellRef and lets the GM re-point it', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    selectItem('Scroll of Friendfetch');
    const form = screen.getByTestId('item-form-scroll-friendfetch');
    // Existing scroll prefilled the catalog reference.
    expect(within(form).getByLabelText('spell-kind')).toHaveValue('scroll');
    expect(within(form).getByLabelText('spell-ref')).toHaveValue('friendfetch');
    // Re-point to a different catalog spell.
    fireEvent.change(within(form).getByLabelText('spell-ref'), { target: { value: 'sleep' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, , data] = saveDocument.mock.calls[0];
    expect(data.wand).toBeUndefined();
    expect(data.scroll).toEqual({ spellRef: 'sleep' }); // ref only — no inline noise
  });

  it('blocks saving a scroll/wand with no catalog spell reference', async () => {
    setContent();
    render(<GmItems />);
    fireEvent.click(screen.getByText('+ New item'));
    const form = screen.getByTestId('item-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Empty Scroll' } });
    fireEvent.change(within(form).getByLabelText('spell-kind'), { target: { value: 'scroll' } });
    fireEvent.click(within(form).getByText('Create item'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(
        /scroll on .* needs a catalog spell reference/i
      )
    );
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('creates a scroll that references the shared spell catalog (spellRef, no inline name)', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    fireEvent.click(screen.getByText('+ New item'));
    const form = screen.getByTestId('item-form-new');
    // Type a name first while the editor still allows it; it's overwritten by
    // the catalog-derived "Scroll of Sleep" once spell-kind flips to scroll.
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'placeholder' } });
    fireEvent.change(within(form).getByLabelText('spell-kind'), { target: { value: 'scroll' } });
    // Slice 5a: scroll uses a catalog dropdown; default hint guides the GM.
    expect(within(form).getByTestId('spell-ref-preview')).toHaveTextContent(/Pick a spell/i);
    fireEvent.change(within(form).getByLabelText('spell-ref'), { target: { value: 'sleep' } });
    expect(within(form).getByTestId('spell-ref-preview')).toHaveTextContent('→ Sleep');
    // The Name input is now derived + disabled.
    expect(within(form).getByLabelText('name')).toHaveValue('Scroll of Sleep');
    expect(within(form).getByLabelText('name')).toBeDisabled();
    fireEvent.click(within(form).getByText('Create item'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id, data] = saveDocument.mock.calls[0];
    expect(id).toBe('scroll-of-sleep');
    expect(data.name).toBe('Scroll of Sleep');
    expect(data.scroll).toEqual({ spellRef: 'sleep' }); // ref only — no level-0 noise
  });

  it('derives the master-list name for a spellRef-only scroll (no authored name) (#812 S5)', () => {
    useContent.mockReturnValue({
      items: [{ id: 'scroll-of-sleep', scroll: { spellRef: 'sleep' } }],
      spells,
      images: [],
    });
    render(<GmItems />);
    // The catalog entry has no `name`; the list derives "Scroll of Sleep".
    expect(screen.getByRole('button', { name: 'Scroll of Sleep' })).toBeInTheDocument();
  });

  it('shows the derived item preview (level/price/bulk/traits) for a selected scroll', async () => {
    setContent();
    render(<GmItems />);
    fireEvent.click(screen.getByText('+ New item'));
    const form = screen.getByTestId('item-form-new');
    fireEvent.change(within(form).getByLabelText('spell-kind'), { target: { value: 'scroll' } });
    fireEvent.change(within(form).getByLabelText('spell-ref'), { target: { value: 'sleep' } });
    // Sleep is rank 1 → Scroll item level 1, 4 gp, Bulk L, scroll traits.
    const preview = within(form).getByTestId('spell-item-preview');
    expect(preview).toHaveTextContent('Scroll of Sleep');
    expect(preview).toHaveTextContent('Item 1');
    expect(preview).toHaveTextContent('4 gp');
    expect(preview).toHaveTextContent('Bulk L');
    expect(preview).toHaveTextContent('Consumable, Magical, Scroll');
  });

  it('persists a cast-rank override (heightened scroll) as the minimal block', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    fireEvent.click(screen.getByText('+ New item'));
    const form = screen.getByTestId('item-form-new');
    fireEvent.change(within(form).getByLabelText('spell-kind'), { target: { value: 'scroll' } });
    fireEvent.change(within(form).getByLabelText('spell-ref'), { target: { value: 'sleep' } });
    // Heighten Sleep (rank 1) to rank 5: name suffix + reprice to item 9 / 150 gp.
    fireEvent.change(within(form).getByLabelText('spell-rank'), { target: { value: '5' } });
    expect(within(form).getByLabelText('name')).toHaveValue('Scroll of Sleep (Rank 5)');
    expect(within(form).getByTestId('spell-item-preview')).toHaveTextContent('Item 9');
    expect(within(form).getByTestId('spell-item-preview')).toHaveTextContent('150 gp');
    fireEvent.click(within(form).getByText('Create item'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, , data] = saveDocument.mock.calls[0];
    expect(data.scroll).toEqual({ spellRef: 'sleep', rank: 5 }); // minimal — no derived fields
    expect(data.level).toBeUndefined();
    expect(data.price).toBeUndefined();
  });

  it('round-trips an existing scroll spellRef and shows an unknown-ref warning', async () => {
    useContent.mockReturnValue({
      items: [
        { id: 's', name: 'S', weight: 0, scroll: { spellRef: 'ghost-spell' } },
      ],
      spells,
    });
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    selectItem('S');
    const form = screen.getByTestId('item-form-s');
    expect(within(form).getByLabelText('spell-kind')).toHaveValue('scroll');
    expect(within(form).getByLabelText('spell-ref')).toHaveValue('ghost-spell');
    expect(within(form).getByTestId('spell-ref-preview')).toHaveTextContent(/unknown spell/i);
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].scroll).toEqual({ spellRef: 'ghost-spell' });
  });

  it('round-trips a staff + artifact item untouched through the raw-JSON box', async () => {
    useContent.mockReturnValue({ items: [hammerItem], spells });
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    selectItem("Xanderghul's Flawless Hammer");
    const form = screen.getByTestId('item-form-xanderghuls-flawless-hammer');
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id, data] = saveDocument.mock.calls[0];
    expect(id).toBe('xanderghuls-flawless-hammer');
    expect(data.staff).toEqual(hammerItem.staff);
    expect(data.artifact).toEqual(hammerItem.artifact);
    expect(data.strikes).toMatchObject({ damage: '1d12' });
  });

  it('rejects per-character / managed keys in the raw-JSON box', async () => {
    setContent();
    render(<GmItems />);
    selectItem('Minor Elixir of Life');
    const form = screen.getByTestId('item-form-minor-elixir-of-life');
    fireEvent.change(within(form).getByLabelText('rest-json'), {
      target: { value: '{"quantity": 2, "contents": []}' },
    });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(/must not include quantity, contents/i)
    );
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('preserves unmanaged mechanical blocks from the raw-JSON box', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    selectItem('Minor Elixir of Life');
    const form = screen.getByTestId('item-form-minor-elixir-of-life');
    fireEvent.change(within(form).getByLabelText('rest-json'), {
      target: { value: '{"bonus": 1, "invested": false}' },
    });
    // `invested` is per-character and must still be rejected even alongside ok keys.
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(/must not include .*invested/i)
    );

    fireEvent.change(within(form).getByLabelText('rest-json'), {
      target: { value: '{"bonus": 1}' },
    });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].bonus).toBe(1);
  });

  it('round-trips durability + material via the raw-JSON box (#540)', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    selectItem('Minor Elixir of Life');
    const form = screen.getByTestId('item-form-minor-elixir-of-life');
    fireEvent.change(within(form).getByLabelText('rest-json'), {
      target: { value: '{"material": "Cold Iron", "durability": {"hardness": 13, "hp": 40, "brokenThreshold": 20}}' },
    });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].material).toBe('Cold Iron');
    expect(saveDocument.mock.calls[0][2].durability).toEqual({ hardness: 13, hp: 40, brokenThreshold: 20 });
  });

  it('drops a potency pasted into the raw-JSON box (retired in favor of the runes dropdowns)', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    selectItem('Minor Elixir of Life');
    const form = screen.getByTestId('item-form-minor-elixir-of-life');
    fireEvent.change(within(form).getByLabelText('rest-json'), {
      target: { value: '{"potency": 1}' },
    });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].potency).toBeUndefined();
  });

  it('reports invalid JSON in the raw-JSON box', async () => {
    setContent();
    render(<GmItems />);
    selectItem('Backpack');
    const form = screen.getByTestId('item-form-backpack');
    fireEvent.change(within(form).getByLabelText('rest-json'), { target: { value: '{ not json' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(/invalid JSON/i)
    );
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('hides the strikes editor on a scroll; shows it on a non-scroll', () => {
    setContent();
    render(<GmItems />);
    // Scroll: no strikes editor.
    selectItem('Scroll of Friendfetch');
    expect(within(screen.getByTestId('item-form-scroll-friendfetch')).queryByTestId('item-strikes')).not.toBeInTheDocument();
    // Non-scroll: strikes editor visible (select Backpack, which replaces the detail pane).
    selectItem('Backpack');
    expect(within(screen.getByTestId('item-form-backpack')).getByTestId('item-strikes')).toBeInTheDocument();
  });

  it('hides strikes and auto-renames a wand once a catalog spell is picked', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    fireEvent.click(screen.getByText('+ New item'));
    const form = screen.getByTestId('item-form-new');
    fireEvent.change(within(form).getByLabelText('spell-kind'), { target: { value: 'wand' } });
    // Strikes section is gone, matching the scroll behaviour.
    expect(within(form).queryByTestId('item-strikes')).not.toBeInTheDocument();
    // Picking a catalog spell auto-names the item.
    fireEvent.change(within(form).getByLabelText('spell-ref'), { target: { value: 'sleep' } });
    const nameInput = within(form).getByLabelText('name');
    expect(nameInput).toHaveValue('Wand of Sleep');
    expect(nameInput).toBeDisabled();
    fireEvent.click(within(form).getByText('Create item'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id, data] = saveDocument.mock.calls[0];
    expect(id).toBe('wand-of-sleep');
    expect(data.name).toBe('Wand of Sleep');
    expect(data.wand).toEqual({ spellRef: 'sleep' });
  });

  it('auto-renames a scroll when the picked catalog spell changes', () => {
    setContent();
    render(<GmItems />);
    selectItem('Scroll of Friendfetch');
    const form = screen.getByTestId('item-form-scroll-friendfetch');
    const nameInput = within(form).getByLabelText('name');
    // Name derives from the referenced catalog spell, and is locked.
    expect(nameInput).toHaveValue('Scroll of Friendfetch');
    expect(nameInput).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('spell-ref'), { target: { value: 'sleep' } });
    expect(nameInput).toHaveValue('Scroll of Sleep');
  });

  it('exposes a safe empty list when the catalog is undefined', () => {
    useContent.mockReturnValue({});
    render(<GmItems />);
    expect(screen.getByText(/Showing 0 of 0/)).toBeInTheDocument();
    expect(screen.getByText('+ New item')).toBeInTheDocument();
  });

  describe('item variants', () => {
    const antidoteItem = {
      id: 'antidote',
      name: 'Antidote',
      weight: 0.1,
      traits: ['Alchemical', 'Consumable', 'Elixir'],
      description: 'Protects against toxins.',
      variants: [
        { level: 1, label: 'Lesser', price: 3, effect: '+2 bonus' },
        { level: 6, label: 'Moderate', price: 35, effect: '+3 bonus' },
      ],
    };

    it('pre-fills variant rows for an item that has variants', () => {
      useContent.mockReturnValue({ items: [antidoteItem], spells: [] });
      render(<GmItems />);
      selectItem('Antidote');
      const form = screen.getByTestId('item-form-antidote');
      expect(within(form).getByLabelText('item-variant-0-level')).toHaveValue(1);
      expect(within(form).getByLabelText('item-variant-0-label')).toHaveValue('Lesser');
      expect(within(form).getByLabelText('item-variant-1-label')).toHaveValue('Moderate');
    });

    it('round-trips variants on Save', async () => {
      useContent.mockReturnValue({ items: [antidoteItem], spells: [] });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Antidote');
      const form = screen.getByTestId('item-form-antidote');
      fireEvent.change(within(form).getByLabelText('item-variant-1-price'), { target: { value: '40' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const [, , data] = saveDocument.mock.calls[0];
      expect(data.variants).toEqual([
        { level: 1, label: 'Lesser', price: 3, effect: '+2 bonus' },
        { level: 6, label: 'Moderate', price: 40, effect: '+3 bonus' },
      ]);
    });

    it('round-trips unmanaged variant keys (name + overrides) on Save', async () => {
      // A tiered item whose variants carry a per-tier `name` and `overrides`
      // block — neither has a dedicated form field. Editing an unrelated field
      // (here, image via a re-save) must not strip them (regression: #1165 S5).
      const cloak = {
        id: 'cloak-of-repute',
        name: 'Cloak of Repute',
        traits: ['Invested', 'Magical'],
        variants: [
          { level: 6, label: 'Standard', price: 250, overrides: { bonus: ['diplomacy', 1] } },
          {
            level: 12,
            label: 'Greater',
            price: 2000,
            name: 'Greater Cloak of Repute',
            overrides: { bonus: ['diplomacy', 2] },
          },
        ],
      };
      useContent.mockReturnValue({ items: [cloak], spells: [] });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Cloak of Repute');
      const form = screen.getByTestId('item-form-cloak-of-repute');
      // The preserved keys are surfaced so the GM knows they carry through.
      expect(within(form).getByTestId('item-variant-1-preserved')).toHaveTextContent(
        /Preserved on save: name, overrides/
      );
      // Edit only the managed price of the Standard tier.
      fireEvent.change(within(form).getByLabelText('item-variant-0-price'), { target: { value: '300' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const [, , data] = saveDocument.mock.calls[0];
      expect(data.variants).toEqual([
        { level: 6, label: 'Standard', price: 300, overrides: { bonus: ['diplomacy', 1] } },
        {
          level: 12,
          label: 'Greater',
          price: 2000,
          name: 'Greater Cloak of Repute',
          overrides: { bonus: ['diplomacy', 2] },
        },
      ]);
    });

    it('adds and removes variants', async () => {
      useContent.mockReturnValue({ items: [antidoteItem], spells: [] });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Antidote');
      const form = screen.getByTestId('item-form-antidote');
      // Remove first variant.
      fireEvent.click(within(screen.getByTestId('item-variant-0')).getByText('Remove variant'));
      // Now only Moderate remains.
      expect(within(form).queryByLabelText('item-variant-1-level')).not.toBeInTheDocument();
      // Add a new blank variant.
      fireEvent.click(within(form).getByText('Add variant'));
      expect(within(form).getByLabelText('item-variant-1-level')).toBeInTheDocument();
    });

    it('creates a new item with variants via Add variant', async () => {
      useContent.mockReturnValue({ items: [], spells: [] });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      fireEvent.click(screen.getByText('+ New item'));
      const form = screen.getByTestId('item-form-new');
      fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Elixir of Life' } });
      fireEvent.click(within(form).getByText('Add variant'));
      fireEvent.change(within(form).getByLabelText('item-variant-0-level'), { target: { value: '1' } });
      fireEvent.change(within(form).getByLabelText('item-variant-0-label'), { target: { value: 'Minor' } });
      fireEvent.change(within(form).getByLabelText('item-variant-0-price'), { target: { value: '3' } });
      fireEvent.change(within(form).getByLabelText('item-variant-0-effect'), { target: { value: 'Restores 1d6 HP' } });
      fireEvent.click(within(form).getByText('Create item'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const [, id, data] = saveDocument.mock.calls[0];
      expect(id).toBe('elixir-of-life');
      expect(data.variants).toEqual([{ level: 1, label: 'Minor', price: 3, effect: 'Restores 1d6 HP' }]);
    });

    it('rejects variants in the raw-JSON extra fields box', async () => {
      useContent.mockReturnValue({ items: [antidoteItem], spells: [] });
      render(<GmItems />);
      selectItem('Antidote');
      const form = screen.getByTestId('item-form-antidote');
      fireEvent.change(within(form).getByLabelText('rest-json'), {
        target: { value: '{"variants": []}' },
      });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() =>
        expect(within(form).getByRole('alert')).toHaveTextContent(/must not include .*variants/i)
      );
      expect(saveDocument).not.toHaveBeenCalled();
    });
  });

  describe('structured strikes', () => {
    const strikeItems = [
      {
        id: 'hammer',
        name: 'Light Hammer',
        price: 1,
        weight: 1,
        strikes: [
          { name: 'Hammer Strike', proficiency: 'martial', type: 'melee', action: 1, damage: '1d6' },
        ],
      },
      {
        id: 'striking-pick',
        name: '+1 Striking Pick',
        price: 100,
        weight: 1,
        strikes: { proficiency: 'martial', type: 'melee', action: 1, damage: '2d6' },
      },
    ];
    const mock = () => useContent.mockReturnValue({ items: strikeItems });

    it('renders strikes pulled out of the raw-JSON box and re-emits actionCount', async () => {
      mock();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Light Hammer');
      const form = screen.getByTestId('item-form-hammer');
      expect(within(form).getByLabelText('item-strike-0-name')).toHaveValue('Hammer Strike');
      // strikes no longer round-trip through the raw-JSON box.
      expect(within(form).getByLabelText('rest-json')).toHaveValue('{}');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].strikes).toEqual([
        { name: 'Hammer Strike', proficiency: 'martial', type: 'melee', damage: '1d6', actionCount: 1 },
      ]);
    });

    it('preserves a single-object strike as an object (not an array)', async () => {
      mock();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('+1 Striking Pick');
      const form = screen.getByTestId('item-form-striking-pick');
      expect(within(form).getByLabelText('item-strike-0-name')).toHaveValue('');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].strikes).toEqual({
        proficiency: 'martial',
        type: 'melee',
        damage: '2d6',
        actionCount: 1,
      });
    });

    it('adds a new strike with a Variable action cost', async () => {
      mock();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Light Hammer');
      const form = screen.getByTestId('item-form-hammer');
      fireEvent.click(within(form).getByText('Add strike'));
      fireEvent.change(within(form).getByLabelText('item-strike-1-name'), {
        target: { value: 'Big Swing' },
      });
      fireEvent.change(within(form).getByLabelText('item-strike-1-cost'), {
        target: { value: 'V' },
      });
      fireEvent.click(within(form).getByLabelText('item-strike-1-cost-v1'));
      fireEvent.click(within(form).getByLabelText('item-strike-1-cost-v2'));
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].strikes[1]).toEqual({
        name: 'Big Swing',
        variableActionCount: { min: 1, max: 2 },
        actionCount: '1 to 2',
      });
    });
  });

  describe('consumable metadata (#217)', () => {
    const effects = [
      { id: 'drakeheart-mutagen', name: 'Drakeheart Mutagen' },
      { id: 'heroism-1', name: 'Heroism (Rank 1–3)' },
    ];
    const potionItem = {
      id: 'minor-healing-potion',
      name: 'Minor Healing Potion',
      traits: ['Consumable', 'Potion'],
      consumable: { kind: 'healing', note: '1d8 HP' },
    };

    it('pre-fills the structured fields, not the raw-JSON box', () => {
      useContent.mockReturnValue({ items: [potionItem], spells: [], effects });
      render(<GmItems />);
      selectItem('Minor Healing Potion');
      const form = screen.getByTestId('item-form-minor-healing-potion');
      expect(within(form).getByLabelText('consumable-kind')).toHaveValue('healing');
      expect(within(form).getByLabelText('consumable-note')).toHaveValue('1d8 HP');
      expect(within(form).getByLabelText('rest-json')).toHaveValue('{}');
    });

    it('round-trips a healing consumable on Save', async () => {
      useContent.mockReturnValue({ items: [potionItem], spells: [], effects });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Minor Healing Potion');
      const form = screen.getByTestId('item-form-minor-healing-potion');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].consumable).toEqual({ kind: 'healing', note: '1d8 HP' });
    });

    it('authors an effect consumable with effect picker + duration', async () => {
      useContent.mockReturnValue({ items: [potionItem], spells: [], effects });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Minor Healing Potion');
      const form = screen.getByTestId('item-form-minor-healing-potion');
      fireEvent.change(within(form).getByLabelText('consumable-kind'), { target: { value: 'effect' } });
      fireEvent.change(within(form).getByLabelText('consumable-effect'), {
        target: { value: 'drakeheart-mutagen' },
      });
      fireEvent.change(within(form).getByLabelText('consumable-duration'), { target: { value: '10' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].consumable).toEqual({
        kind: 'effect',
        effectId: 'drakeheart-mutagen',
        durationMinutes: 10,
        note: '1d8 HP',
      });
    });

    it('rejects an effect consumable without a picked effect', async () => {
      useContent.mockReturnValue({ items: [potionItem], spells: [], effects });
      render(<GmItems />);
      selectItem('Minor Healing Potion');
      const form = screen.getByTestId('item-form-minor-healing-potion');
      fireEvent.change(within(form).getByLabelText('consumable-kind'), { target: { value: 'effect' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() =>
        expect(within(form).getByRole('alert')).toHaveTextContent(/needs an effect/i)
      );
      expect(saveDocument).not.toHaveBeenCalled();
    });

    it('clears the block when kind is set back to none', async () => {
      useContent.mockReturnValue({ items: [potionItem], spells: [], effects });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Minor Healing Potion');
      const form = screen.getByTestId('item-form-minor-healing-potion');
      fireEvent.change(within(form).getByLabelText('consumable-kind'), { target: { value: 'none' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].consumable).toBeUndefined();
    });

    it('rejects consumable in the raw-JSON extra fields box', async () => {
      useContent.mockReturnValue({ items: [potionItem], spells: [], effects });
      render(<GmItems />);
      selectItem('Minor Healing Potion');
      const form = screen.getByTestId('item-form-minor-healing-potion');
      fireEvent.change(within(form).getByLabelText('rest-json'), {
        target: { value: '{"consumable": {"kind": "healing"}}' },
      });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() =>
        expect(within(form).getByRole('alert')).toHaveTextContent(/must not include .*consumable/i)
      );
      expect(saveDocument).not.toHaveBeenCalled();
    });
  });

  describe('image round-trip', () => {
    it('saves image id when item has an image', async () => {
      const withImage = { ...items[0], image: 'img_elixir.jpg' };
      useContent.mockReturnValue({ items: [withImage], spells: [], images: [] });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Minor Elixir of Life');
      const form = screen.getByTestId('item-form-minor-elixir-of-life');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].image).toBe('img_elixir.jpg');
    });

    it('omits image key when item has no image', async () => {
      setContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Minor Elixir of Life');
      const form = screen.getByTestId('item-form-minor-elixir-of-life');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].image).toBeUndefined();
    });
  });

  describe('weapon runes (#548 Slice 2)', () => {
    const legacyPick = {
      id: '1-striking-pick',
      name: '+1 Striking Pick',
      price: 100.1,
      potency: 1,
      traits: ['Fatal 1d10'],
      strikes: { proficiency: 'martial', type: 'melee', action: 1, damage: '2d6' },
    };
    const setRuneContent = (extra = []) =>
      useContent.mockReturnValue({ items: [legacyPick, ...extra], spells, images: [] });

    it('surfaces a legacy-baked notice and re-emits flat potency unchanged on save', async () => {
      setRuneContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('+1 Striking Pick');
      const form = screen.getByTestId('item-form-1-striking-pick');
      expect(within(form).getByTestId('item-runes-legacy')).toHaveTextContent(/Legacy baked potency \(\+1\)/);
      // Dropdowns start empty so an untouched save never re-derives the weapon.
      expect(within(form).getByLabelText('rune-potency')).toHaveValue('0');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const data = saveDocument.mock.calls[0][2];
      expect(data.potency).toBe(1);
      expect(data.runes).toBeUndefined();
    });

    it('switching a legacy weapon to runes drops the flat potency', async () => {
      setRuneContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('+1 Striking Pick');
      const form = screen.getByTestId('item-form-1-striking-pick');
      fireEvent.change(within(form).getByLabelText('rune-potency'), { target: { value: '2' } });
      fireEvent.change(within(form).getByLabelText('rune-striking'), { target: { value: 'greater' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const data = saveDocument.mock.calls[0][2];
      expect(data.runes).toEqual({ potency: 2, striking: 'greater' });
      expect(data.potency).toBeUndefined();
    });

    it('authors a base weapon with runes: derived-name preview, scaled-dice hint, structured save', async () => {
      setRuneContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      fireEvent.click(screen.getByText('+ New item'));
      const form = screen.getByTestId('item-form-new');
      fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Pick' } });
      fireEvent.change(within(form).getByLabelText('price'), { target: { value: '0.1' } });
      fireEvent.click(within(form).getByText('Add strike'));
      fireEvent.change(within(form).getByLabelText('item-strike-0-damage'), { target: { value: '1d6' } });
      fireEvent.change(within(form).getByLabelText('rune-potency'), { target: { value: '1' } });
      fireEvent.change(within(form).getByLabelText('rune-striking'), { target: { value: 'striking' } });

      expect(within(form).getByTestId('item-runes-preview')).toHaveTextContent('+1 Striking Pick');
      expect(within(form).getByTestId('item-runes-preview')).toHaveTextContent('100.1 gp');
      expect(within(form).getByTestId('item-strike-0-scaled')).toHaveTextContent('2d6');

      fireEvent.click(within(form).getByText('Create item'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const data = saveDocument.mock.calls[0][2];
      expect(data.name).toBe('Pick');
      expect(data.price).toBe(0.1);
      expect(data.runes).toEqual({ potency: 1, striking: 'striking' });
      expect(data.potency).toBeUndefined();
    });

    it('hides the runes section for a non-weapon item', () => {
      setRuneContent([{ id: 'rope', name: 'Rope', price: 0.1, description: '50 feet.' }]);
      render(<GmItems />);
      selectItem('Rope');
      const form = screen.getByTestId('item-form-rope');
      expect(within(form).queryByTestId('item-runes')).not.toBeInTheDocument();
    });

    it('potency gates property-rune slot count and saves picked ids', async () => {
      useContent.mockReturnValue({
        items: [legacyPick],
        spells,
        images: [],
        runes: [
          { id: 'vitalizing', type: 'property', name: 'Vitalizing', price: 150 },
          { id: 'frost', type: 'property', name: 'Frost', price: 500 },
        ],
      });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      fireEvent.click(screen.getByText('+ New item'));
      const form = screen.getByTestId('item-form-new');
      fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Greataxe' } });
      fireEvent.click(within(form).getByText('Add strike'));
      fireEvent.change(within(form).getByLabelText('item-strike-0-damage'), { target: { value: '1d12' } });

      // No potency → no property slots, just the unlock hint.
      expect(within(form).queryByLabelText('rune-property-0')).not.toBeInTheDocument();
      expect(within(form).getByTestId('item-rune-property')).toHaveTextContent(/Add potency to unlock/i);

      // +2 potency → exactly two slots.
      fireEvent.change(within(form).getByLabelText('rune-potency'), { target: { value: '2' } });
      expect(within(form).getByLabelText('rune-property-0')).toBeInTheDocument();
      expect(within(form).getByLabelText('rune-property-1')).toBeInTheDocument();
      expect(within(form).queryByLabelText('rune-property-2')).not.toBeInTheDocument();

      fireEvent.change(within(form).getByLabelText('rune-property-0'), { target: { value: 'vitalizing' } });
      expect(within(form).getByTestId('item-runes-preview')).toHaveTextContent('+2 Vitalizing Greataxe');

      fireEvent.click(within(form).getByText('Create item'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].runes).toEqual({ potency: 2, property: ['vitalizing'] });
    });

    it('flags over-slotted property runes and blocks save until resolved (#607)', async () => {
      useContent.mockReturnValue({
        items: [{
          id: 'axe', name: 'Greataxe', strikes: { type: 'melee', damage: '1d12' },
          runes: { potency: 2, property: ['vitalizing', 'frost'] },
        }],
        spells,
        images: [],
        runes: [
          { id: 'vitalizing', type: 'property', name: 'Vitalizing', price: 150 },
          { id: 'frost', type: 'property', name: 'Frost', price: 500 },
        ],
      });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Greataxe');
      const form = screen.getByTestId('item-form-axe');

      // Lowering potency to +1 leaves 2 runes in 1 slot — surfaced, not dropped.
      fireEvent.change(within(form).getByLabelText('rune-potency'), { target: { value: '1' } });
      const overflow = within(form).getByTestId('item-rune-property-overflow');
      expect(overflow).toHaveTextContent(/1 property rune exceeds/i);
      expect(overflow).toHaveTextContent('Frost');

      // Save is blocked with a clear message — nothing is silently truncated.
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() =>
        expect(within(form).getByRole('alert')).toHaveTextContent(/2 property runes but its \+1 potency grants only 1 slot/i)
      );
      expect(saveDocument).not.toHaveBeenCalled();

      // Removing the overflow rune resolves it; save now succeeds.
      fireEvent.click(within(form).getByLabelText('remove-overflow-property-0'));
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].runes).toEqual({ potency: 1, property: ['vitalizing'] });
    });

    it('blocks saving property runes with 0 potency (no slots) (#607)', async () => {
      useContent.mockReturnValue({
        items: [{
          id: 'axe', name: 'Greataxe', strikes: { type: 'melee', damage: '1d12' },
          runes: { property: ['vitalizing'] },
        }],
        spells,
        images: [],
        runes: [{ id: 'vitalizing', type: 'property', name: 'Vitalizing', price: 150 }],
      });
      render(<GmItems />);
      selectItem('Greataxe');
      const form = screen.getByTestId('item-form-axe');
      expect(within(form).getByTestId('item-rune-property-overflow')).toHaveTextContent('Vitalizing');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() =>
        expect(within(form).getByRole('alert')).toHaveTextContent(/Property runes need a potency rune/i)
      );
      expect(saveDocument).not.toHaveBeenCalled();
    });

    it('striking has no potency prerequisite — saves at potency 0 (#607)', async () => {
      useContent.mockReturnValue({ items: [legacyPick], spells, images: [], runes: [] });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      fireEvent.click(screen.getByText('+ New item'));
      const form = screen.getByTestId('item-form-new');
      fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Greatsword' } });
      fireEvent.click(within(form).getByText('Add strike'));
      fireEvent.change(within(form).getByLabelText('item-strike-0-damage'), { target: { value: '1d12' } });
      fireEvent.change(within(form).getByLabelText('rune-striking'), { target: { value: 'striking' } });
      fireEvent.click(within(form).getByText('Create item'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].runes).toEqual({ striking: 'striking' });
    });
  });

  describe('armor runes (#727)', () => {
    const chainShirt = {
      id: 'chain-shirt',
      name: 'Chain Shirt',
      price: 5,
      armor: { category: 'light', acBonus: 1, dexCap: 5 },
    };
    const armorRuneContent = (extra = []) =>
      useContent.mockReturnValue({
        items: [chainShirt, ...extra],
        spells,
        images: [],
        runes: [
          { id: 'slick', type: 'property', name: 'Slick', price: 45, armorRune: true,
            modifiers: [{ stat: 'acrobatics', kind: 'item', amount: 1 }] },
          // A weapon property rune — it must NOT appear in an armor's picker.
          { id: 'vitalizing', type: 'property', name: 'Vitalizing', price: 150 },
        ],
      });

    it('shows the runes section with resilient (not striking) and an armor-filtered picker', () => {
      armorRuneContent();
      render(<GmItems />);
      selectItem('Chain Shirt');
      const form = screen.getByTestId('item-form-chain-shirt');
      expect(within(form).getByTestId('item-runes')).toHaveTextContent('Armor runes');
      expect(within(form).getByLabelText('rune-resilient')).toBeInTheDocument();
      expect(within(form).queryByLabelText('rune-striking')).not.toBeInTheDocument();

      // +1 potency unlocks one property slot; only the armorRune is offered.
      fireEvent.change(within(form).getByLabelText('rune-potency'), { target: { value: '1' } });
      const slot = within(form).getByLabelText('rune-property-0');
      expect(within(slot).getByRole('option', { name: 'Slick' })).toBeInTheDocument();
      expect(within(slot).queryByRole('option', { name: 'Vitalizing' })).not.toBeInTheDocument();
    });

    it('authors potency + resilient + property → resolved-name preview + structured save', async () => {
      armorRuneContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Chain Shirt');
      const form = screen.getByTestId('item-form-chain-shirt');
      fireEvent.change(within(form).getByLabelText('rune-potency'), { target: { value: '1' } });
      fireEvent.change(within(form).getByLabelText('rune-resilient'), { target: { value: 'resilient' } });
      fireEvent.change(within(form).getByLabelText('rune-property-0'), { target: { value: 'slick' } });

      expect(within(form).getByTestId('item-runes-preview')).toHaveTextContent('+1 Resilient Slick Chain Shirt');

      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].runes).toEqual({
        potency: 1,
        resilient: 'resilient',
        property: ['slick'],
      });
    });
  });

  describe('shield runes (#1165 S3)', () => {
    const steelShield = {
      id: 'steel-shield', name: 'Steel Shield', price: 2,
      shield: { hardness: 5, health: 20, breakThreshold: 10, bonus: 2 },
    };
    const spikedShield = {
      id: 'spiked-steel-shield', name: 'Spiked Steel Shield', price: 5,
      shield: { hardness: 5, health: 20, breakThreshold: 10, bonus: 2 },
      strikes: { name: 'Shield Bash', damage: '1d6', damageType: 'piercing', proficiency: 'martial', type: 'melee', actionCount: 1 },
    };
    const shieldContent = (extra = []) =>
      useContent.mockReturnValue({ items: [steelShield, ...extra], spells, images: [], runes: [] });

    it('shows the reinforcing dropdown, not the weapon/armor rune UI', () => {
      shieldContent();
      render(<GmItems />);
      selectItem('Steel Shield');
      const form = screen.getByTestId('item-form-steel-shield');
      expect(within(form).getByTestId('item-shield-rune')).toBeInTheDocument();
      expect(within(form).getByLabelText('rune-reinforcing')).toBeInTheDocument();
      // No potency/striking/resilient sockets on a shield.
      expect(within(form).queryByLabelText('rune-potency')).not.toBeInTheDocument();
      expect(within(form).queryByLabelText('rune-striking')).not.toBeInTheDocument();
      expect(within(form).queryByTestId('item-runes')).not.toBeInTheDocument();
    });

    it('previews resolved name + durability and saves runes.reinforcing', async () => {
      shieldContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      selectItem('Steel Shield');
      const form = screen.getByTestId('item-form-steel-shield');
      fireEvent.change(within(form).getByLabelText('rune-reinforcing'), { target: { value: 'minor' } });
      // Additive-with-cap over the steel base → H8/HP64/BT32, Remaster name.
      expect(within(form).getByTestId('item-shield-preview'))
        .toHaveTextContent('Minor Reinforcing Steel Shield · Hardness 8 / HP 64 / BT 32 · 77 gp');

      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const saved = saveDocument.mock.calls[0][2];
      expect(saved.runes).toEqual({ reinforcing: 'minor' });
      // The base shield stat block round-trips via the raw-JSON box.
      expect(saved.shield).toEqual({ hardness: 5, health: 20, breakThreshold: 10, bonus: 2 });
    });

    it('classifies a bash-carrying shield as a shield (reinforcing UI, no weapon runes)', () => {
      shieldContent([spikedShield]);
      render(<GmItems />);
      selectItem('Spiked Steel Shield');
      const form = screen.getByTestId('item-form-spiked-steel-shield');
      expect(within(form).getByLabelText('rune-reinforcing')).toBeInTheDocument();
      // The bash strikes block must NOT surface the weapon-rune UI.
      expect(within(form).queryByTestId('item-runes')).not.toBeInTheDocument();
      expect(within(form).queryByLabelText('rune-striking')).not.toBeInTheDocument();
    });
  });
});
