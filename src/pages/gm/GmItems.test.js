import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmItems from './GmItems';

jest.mock('../../contexts/ContentContext', () => ({ useContent: jest.fn() }));
jest.mock('../../utils/gmApi', () => ({
  saveDocument: jest.fn(),
  deleteDocument: jest.fn(),
  fetchHistory: jest.fn(),
  restoreVersion: jest.fn(),
}));
const { useContent } = require('../../contexts/ContentContext');
const { saveDocument, deleteDocument } = require('../../utils/gmApi');

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
    scroll: {
      name: 'Friendfetch',
      level: 1,
      traits: ['Uncommon', 'Force'],
      actions: 'Two Actions',
      range: '30 feet',
      description: 'Drag a creature toward you.',
      heightened: { '3rd': 'Two creatures.' },
    },
  },
];

const hammerItem = {
  id: 'xanderghuls-flawless-hammer',
  name: "Xanderghul's Flawless Hammer",
  weight: 2,
  traits: ['Artifact', 'Staff', 'Magical'],
  description: 'An Alara’quin of the Runelord of Pride.',
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
];

const setContent = () => useContent.mockReturnValue({ items, spells, images: [] });

afterEach(() => jest.restoreAllMocks());

describe('GmItems', () => {
  it('lists all catalog items and a count', () => {
    setContent();
    render(<GmItems />);
    expect(screen.getByTestId('item-form-minor-elixir-of-life')).toBeInTheDocument();
    expect(screen.getByTestId('item-form-backpack')).toBeInTheDocument();
    expect(screen.getByTestId('item-form-scroll-friendfetch')).toBeInTheDocument();
    expect(screen.getByText(/Showing 3 of 3/)).toBeInTheDocument();
  });

  it('filters the list by name, trait or id', () => {
    setContent();
    render(<GmItems />);
    fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'healing' } });
    expect(screen.getByTestId('item-form-minor-elixir-of-life')).toBeInTheDocument();
    expect(screen.queryByTestId('item-form-backpack')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 3/)).toBeInTheDocument();
  });

  it('edits an item and saves scalars + traits parsed from CSV', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
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
    const form = screen.getByTestId('item-form-backpack');
    fireEvent.click(within(form).getByText('Delete'));
    expect(within(form).getByText('Delete forever')).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('confirm-input'), { target: { value: 'Backpack' } });
    fireEvent.click(within(form).getByText('Delete forever'));
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
    fireEvent.click(within(form).getByText('Overwrite'));
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
    const form = screen.getByTestId('item-form-minor-elixir-of-life');
    expect(within(form).queryByLabelText('container-capacity')).not.toBeInTheDocument();
    fireEvent.click(within(form).getByLabelText('is-container'));
    fireEvent.change(within(form).getByLabelText('container-capacity'), { target: { value: '2' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].container).toEqual({ capacity: 2, ignored: 0 });
  });

  it('round-trips a scroll nested spell and edits it', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    const form = screen.getByTestId('item-form-scroll-friendfetch');
    // Existing scroll prefilled the sub-form.
    expect(within(form).getByLabelText('spell-kind')).toHaveValue('scroll');
    expect(within(form).getByLabelText('spell-name')).toHaveValue('Friendfetch');
    expect(within(form).getByLabelText('spell-level')).toHaveValue(1);

    fireEvent.change(within(form).getByLabelText('spell-description'), {
      target: { value: 'Drag up to two creatures toward you.' },
    });
    fireEvent.click(within(form).getByText('Add heightened'));
    fireEvent.change(within(form).getByLabelText('spell-h-1-key'), { target: { value: '5th' } });
    fireEvent.change(within(form).getByLabelText('spell-h-1-text'), {
      target: { value: 'Three creatures.' },
    });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, , data] = saveDocument.mock.calls[0];
    expect(data.wand).toBeUndefined();
    expect(data.scroll).toMatchObject({
      name: 'Friendfetch',
      level: 1,
      traits: ['Uncommon', 'Force'],
      actions: 'Two Actions',
      description: 'Drag up to two creatures toward you.',
      heightened: { '3rd': 'Two creatures.', '5th': 'Three creatures.' },
    });
    expect(typeof data.scroll.level).toBe('number');
  });

  it('creates a wand item with a nested spell', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
    fireEvent.click(screen.getByText('+ New item'));
    const form = screen.getByTestId('item-form-new');
    fireEvent.change(within(form).getByLabelText('name'), {
      target: { value: 'Wand of Cleanse Affliction' },
    });
    fireEvent.change(within(form).getByLabelText('spell-kind'), { target: { value: 'wand' } });
    fireEvent.change(within(form).getByLabelText('spell-name'), {
      target: { value: 'Cleanse Affliction' },
    });
    fireEvent.change(within(form).getByLabelText('spell-level'), { target: { value: '2' } });
    fireEvent.click(within(form).getByText('Create item'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id, data] = saveDocument.mock.calls[0];
    expect(id).toBe('wand-of-cleanse-affliction');
    expect(data.scroll).toBeUndefined();
    expect(data.wand).toMatchObject({ name: 'Cleanse Affliction', level: 2 });
  });

  it('blocks saving a scroll/wand with neither a spell name nor a ref', async () => {
    setContent();
    render(<GmItems />);
    fireEvent.click(screen.getByText('+ New item'));
    const form = screen.getByTestId('item-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Empty Scroll' } });
    fireEvent.change(within(form).getByLabelText('spell-kind'), { target: { value: 'scroll' } });
    fireEvent.click(within(form).getByText('Create item'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(
        /scroll spell on .* needs a spell reference or a name/i
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

  it('round-trips an existing scroll spellRef and shows an unknown-ref warning', async () => {
    useContent.mockReturnValue({
      items: [
        { id: 's', name: 'S', weight: 0, scroll: { spellRef: 'ghost-spell' } },
      ],
      spells,
    });
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmItems />);
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
    const form = screen.getByTestId('item-form-minor-elixir-of-life');
    fireEvent.change(within(form).getByLabelText('rest-json'), {
      target: { value: '{"potency": 1, "invested": false}' },
    });
    // `invested` is per-character and must still be rejected even alongside ok keys.
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(/must not include .*invested/i)
    );

    fireEvent.change(within(form).getByLabelText('rest-json'), {
      target: { value: '{"potency": 1}' },
    });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].potency).toBe(1);
  });

  it('reports invalid JSON in the raw-JSON box', async () => {
    setContent();
    render(<GmItems />);
    const form = screen.getByTestId('item-form-backpack');
    fireEvent.change(within(form).getByLabelText('rest-json'), { target: { value: '{ not json' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(/invalid JSON/i)
    );
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('hides the strikes editor on a scroll', () => {
    setContent();
    render(<GmItems />);
    const scrollForm = screen.getByTestId('item-form-scroll-friendfetch');
    expect(within(scrollForm).queryByTestId('item-strikes')).not.toBeInTheDocument();
    // A non-scroll keeps the strikes editor visible.
    const backpackForm = screen.getByTestId('item-form-backpack');
    expect(within(backpackForm).getByTestId('item-strikes')).toBeInTheDocument();
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
    // Inline spell fields are collapsed by default; picking a spell auto-names.
    expect(within(form).getByTestId('spell-inline-details')).not.toHaveAttribute('open');
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

  it('collapses the inline spell fields by default on a scroll', () => {
    setContent();
    render(<GmItems />);
    const form = screen.getByTestId('item-form-scroll-friendfetch');
    const details = within(form).getByTestId('spell-inline-details');
    expect(details).not.toHaveAttribute('open');
    // Inline fields are still in the DOM (RTL can drive them on demand).
    expect(within(form).getByLabelText('spell-name')).toHaveValue('Friendfetch');
  });

  it('auto-renames a scroll when the picked catalog spell changes', () => {
    setContent();
    render(<GmItems />);
    const form = screen.getByTestId('item-form-scroll-friendfetch');
    const nameInput = within(form).getByLabelText('name');
    // No ref initially; the fixture authored an inline spell name "Friendfetch".
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

  describe('image round-trip', () => {
    it('saves image id when item has an image', async () => {
      const withImage = { ...items[0], image: 'img_elixir.jpg' };
      useContent.mockReturnValue({ items: [withImage], spells: [], images: [] });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      const form = screen.getByTestId('item-form-minor-elixir-of-life');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].image).toBe('img_elixir.jpg');
    });

    it('omits image key when item has no image', async () => {
      setContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmItems />);
      const form = screen.getByTestId('item-form-minor-elixir-of-life');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].image).toBeUndefined();
    });
  });
});
