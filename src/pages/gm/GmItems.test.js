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

const setContent = () => useContent.mockReturnValue({ items });

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

  it('blocks saving a scroll/wand with no spell name', async () => {
    setContent();
    render(<GmItems />);
    fireEvent.click(screen.getByText('+ New item'));
    const form = screen.getByTestId('item-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Empty Scroll' } });
    fireEvent.change(within(form).getByLabelText('spell-kind'), { target: { value: 'scroll' } });
    fireEvent.click(within(form).getByText('Create item'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(/scroll spell on .* needs a name/i)
    );
    expect(saveDocument).not.toHaveBeenCalled();
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
});
