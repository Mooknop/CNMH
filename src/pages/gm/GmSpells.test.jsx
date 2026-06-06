import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmSpells from './GmSpells';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn(), deleteDocument: vi.fn() }));
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';

const spells = [
  {
    id: 'cleanse-affliction',
    name: 'Cleanse Affliction',
    level: 2,
    traits: ['Concentrate', 'Healing'],
    actions: 'Two Actions',
    range: 'Touch',
    targets: '1 willing creature',
    description: 'Push back the affliction.',
    heightened: { '3rd': 'Counteract disease or poison.' },
  },
  {
    id: 'dispel-magic',
    name: 'Dispel Magic',
    level: 2,
    traits: ['Concentrate'],
    actions: 'Two Actions',
    range: '120 feet',
    targets: '1 spell effect',
    bloodline: true, // unmodelled key — must round-trip via the JSON box
    description: 'Unravel the magic.',
  },
  {
    id: 'guidance',
    name: 'Guidance',
    level: 1,
    actions: 'One Action',
    description: 'A small bonus.',
  },
];

const setContent = () => useContent.mockReturnValue({ spells });

afterEach(() => vi.restoreAllMocks());

describe('GmSpells', () => {
  it('lists spells sorted by level then name with a count', () => {
    setContent();
    render(<GmSpells />);
    expect(screen.getByTestId('spell-form-guidance')).toBeInTheDocument();
    expect(screen.getByTestId('spell-form-cleanse-affliction')).toBeInTheDocument();
    expect(screen.getByTestId('spell-form-dispel-magic')).toBeInTheDocument();
    expect(screen.getByText('Showing 3 of 3')).toBeInTheDocument();
  });

  it('filters by name, trait, or id', () => {
    setContent();
    render(<GmSpells />);
    fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'heal' } });
    expect(screen.getByTestId('spell-form-cleanse-affliction')).toBeInTheDocument();
    expect(screen.queryByTestId('spell-form-dispel-magic')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 3')).toBeInTheDocument();
  });

  it('edits a spell and saves heightened + CSV traits, preserving unmodelled keys', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmSpells />);
    const form = screen.getByTestId('spell-form-dispel-magic');
    fireEvent.change(within(form).getByLabelText('traits'), {
      target: { value: 'Concentrate, Manipulate' },
    });
    fireEvent.click(within(form).getByText('Add heightened'));
    fireEvent.change(within(form).getByLabelText('heightened-0-key'), { target: { value: '+1' } });
    fireEvent.change(within(form).getByLabelText('heightened-0-text'), {
      target: { value: 'Counteract higher level.' },
    });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('spell');
    expect(id).toBe('dispel-magic');
    expect(data.traits).toEqual(['Concentrate', 'Manipulate']);
    expect(data.heightened).toEqual({ '+1': 'Counteract higher level.' });
    // bloodline (unmodelled) round-trips through the raw-JSON box.
    expect(data.bloodline).toBe(true);
  });

  it('requires a spell name', async () => {
    setContent();
    render(<GmSpells />);
    const form = screen.getByTestId('spell-form-guidance');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: '' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(/Spell name is required/i)
    );
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('creates a new spell with a slug id', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmSpells />);
    fireEvent.click(screen.getByText('+ New spell'));
    const form = screen.getByTestId('spell-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Mage Armor' } });
    fireEvent.change(within(form).getByLabelText('level'), { target: { value: '1' } });
    fireEvent.click(within(form).getByText('Create spell'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id, data] = saveDocument.mock.calls[0];
    expect(id).toBe('mage-armor');
    expect(data.name).toBe('Mage Armor');
    expect(data.level).toBe(1);
  });

  it('warns before overwriting an existing id when creating', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmSpells />);
    fireEvent.click(screen.getByText('+ New spell'));
    const form = screen.getByTestId('spell-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Guidance' } });
    fireEvent.click(within(form).getByText('Create spell'));
    expect(saveDocument).not.toHaveBeenCalled();
    fireEvent.click(within(form).getByText('Overwrite'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith(
        'spell',
        'guidance',
        expect.objectContaining({ id: 'guidance', name: 'Guidance' })
      )
    );
  });

  it('deletes a spell only after typed confirmation', async () => {
    setContent();
    deleteDocument.mockResolvedValue({ ok: true });
    render(<GmSpells />);
    const form = screen.getByTestId('spell-form-guidance');
    fireEvent.click(within(form).getByText('Delete'));
    expect(within(form).getByText('Delete forever')).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('confirm-input'), { target: { value: 'Guidance' } });
    fireEvent.click(within(form).getByText('Delete forever'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('spell', 'guidance'));
  });

  it('rejects invalid JSON / non-object in the raw-JSON box', async () => {
    setContent();
    render(<GmSpells />);
    const form = screen.getByTestId('spell-form-cleanse-affliction');
    fireEvent.change(within(form).getByLabelText('rest-json'), { target: { value: '{ broken' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(/invalid JSON/i)
    );
    fireEvent.change(within(form).getByLabelText('rest-json'), { target: { value: '[1,2]' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(/must be a JSON object/i)
    );
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('exposes a safe empty list when the catalog is undefined', () => {
    useContent.mockReturnValue({});
    render(<GmSpells />);
    expect(screen.getByText('Showing 0 of 0')).toBeInTheDocument();
    expect(screen.getByText('+ New spell')).toBeInTheDocument();
  });

  it('round-trips foundryEffect — set persists to saved payload', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmSpells />);
    const form = screen.getByTestId('spell-form-guidance');
    fireEvent.change(within(form).getByLabelText('spell-foundry-effect-ref'), {
      target: { value: 'Compendium.pf2e.spell-effects.Item.testUUID' },
    });
    fireEvent.change(within(form).getByLabelText('spell-foundry-effect-apply-to'), {
      target: { value: 'all-allies' },
    });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, , data] = saveDocument.mock.calls[0];
    expect(data.foundryEffect).toEqual({
      ref: 'Compendium.pf2e.spell-effects.Item.testUUID',
      applyTo: 'all-allies',
    });
  });

  it('round-trips foundryEffect — unset emits no foundryEffect key', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmSpells />);
    const form = screen.getByTestId('spell-form-guidance');
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, , data] = saveDocument.mock.calls[0];
    expect(data.foundryEffect).toBeUndefined();
  });

  it('foundryEffect does not leak into the raw-JSON box on existing spells', () => {
    const spellsWithEffect = [
      {
        ...spells[0],
        foundryEffect: { ref: 'Compendium.pf2e.spell-effects.Item.abc', applyTo: 'self' },
      },
    ];
    useContent.mockReturnValue({ spells: spellsWithEffect });
    render(<GmSpells />);
    const box = screen.getByLabelText('rest-json');
    const parsed = JSON.parse(box.value);
    expect(parsed.foundryEffect).toBeUndefined();
  });

  it('round-trips chain — strike kind persists to saved payload', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmSpells />);
    const form = screen.getByTestId('spell-form-guidance');
    // Select "Strike / Flurry of Blows"
    fireEvent.change(within(form).getByLabelText('spell-chain-into'), {
      target: { value: 'strike' },
    });
    fireEvent.change(within(form).getByLabelText('spell-chain-attack-bonus'), {
      target: { value: '1' },
    });
    fireEvent.change(within(form).getByLabelText('spell-chain-damage-bonus'), {
      target: { value: '1d6' },
    });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, , data] = saveDocument.mock.calls[0];
    expect(data.chain).toMatchObject({ into: 'strike', attackBonus: 1, damageBonus: '1d6' });
  });

  it('round-trips chain — unset emits no chain key', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmSpells />);
    const form = screen.getByTestId('spell-form-guidance');
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, , data] = saveDocument.mock.calls[0];
    expect(data.chain).toBeUndefined();
  });

  it('chain does not leak into the raw-JSON box on existing spells', () => {
    const spellsWithChain = [
      { ...spells[0], chain: { into: 'strike', cost: 'included', modes: ['strike'], attackBonus: 1 } },
    ];
    useContent.mockReturnValue({ spells: spellsWithChain });
    render(<GmSpells />);
    const box = screen.getByLabelText('rest-json');
    const parsed = JSON.parse(box.value);
    expect(parsed.chain).toBeUndefined();
  });
});
