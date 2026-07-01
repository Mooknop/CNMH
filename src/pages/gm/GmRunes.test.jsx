import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmRunes from './GmRunes';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn(), deleteDocument: vi.fn() }));
vi.mock('../../components/gm/HistoryModal', () => ({ default: () => null }));
import { useContent } from '../../contexts/ContentContext';
import { saveDocument } from '../../utils/gmApi';

const runes = [
  {
    id: 'vitalizing',
    type: 'property',
    name: 'Vitalizing',
    level: 5,
    price: 150,
    description: 'Vitality vs undead.',
    rider: {
      vsTrait: 'undead',
      persistent: '1d6',
      damageType: 'vitality',
      onCrit: { conditions: [{ name: 'enfeebled', value: 1, duration: 'end-of-next-turn' }] },
    },
  },
  {
    id: 'frost',
    type: 'property',
    name: 'Frost',
    level: 8,
    price: 500,
    rider: { persistent: '1d6', damageType: 'cold' },
  },
];

const setContent = () => useContent.mockReturnValue({ runes });
afterEach(() => vi.restoreAllMocks());

const selectRune = (name) => fireEvent.click(screen.getByRole('button', { name }));

describe('GmRunes', () => {
  it('lists runes sorted alphabetically', () => {
    setContent();
    render(<GmRunes />);
    expect(screen.getByRole('button', { name: 'Frost' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vitalizing' })).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument();
  });

  it('shows all property-rune targets grouped, excluding fundamentals (#885, #967 R9)', () => {
    useContent.mockReturnValue({ runes: [
      ...runes,
      { id: 'slick', type: 'property', armorRune: true, name: 'Slick' },
      { id: 'ring-energy', type: 'property', target: 'ring', name: 'Energy' },
      { id: 'weapon-potency-1', type: 'fundamental', fundamental: 'potency', target: 'weapon', name: '+1 Weapon Potency' },
    ] });
    render(<GmRunes />);
    // 2 weapon + 1 armor + 1 ring property runes; the fundamental is excluded.
    expect(screen.getByText('Showing 4 of 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Slick' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Energy' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Weapon Potency/ })).not.toBeInTheDocument();
    // Grouped by target.
    expect(screen.getByText('Weapon runes')).toBeInTheDocument();
    expect(screen.getByText('Armor runes')).toBeInTheDocument();
    expect(screen.getByText('Ring runes')).toBeInTheDocument();
  });

  it('facet filters the list to one target (#967 R9)', () => {
    useContent.mockReturnValue({ runes: [
      ...runes,
      { id: 'slick', type: 'property', armorRune: true, name: 'Slick' },
    ] });
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: 'Armor' }));
    expect(screen.getByText('Showing 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Slick' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Frost' })).not.toBeInTheDocument();
  });

  it('edits a ring rune through a safe form that preserves its activations (#967 R9)', async () => {
    saveDocument.mockResolvedValue({ ok: true });
    useContent.mockReturnValue({ runes: [
      { id: 'ring-energy', type: 'property', target: 'ring', name: 'Energy', level: 7, price: 300,
        description: 'shimmering',
        freeActions: [{ name: 'Gather Power', description: 'g' }],
        actions: [{ name: 'Release Power', actionCount: 1, description: 'r' }] },
    ] });
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: 'Energy' }));
    const form = screen.getByTestId('rune-form-ring-energy');
    expect(within(form).getByLabelText('name')).toHaveValue('Energy');
    expect(within(form).getByTestId('ring-preserved-note')).toHaveTextContent('2 activations · 0 riders');
    // No weapon rider controls on the ring form.
    expect(within(form).queryByLabelText('rider-vsTrait')).not.toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('description'), { target: { value: 'brighter' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('rune');
    expect(id).toBe('ring-energy');
    // Descriptive edit applied; target + activations preserved (not dropped).
    expect(data).toMatchObject({
      type: 'property', target: 'ring', name: 'Energy', description: 'brighter',
      freeActions: [{ name: 'Gather Power' }],
      actions: [{ name: 'Release Power', actionCount: 1 }],
    });
  });

  it('creates a new rune under the selected target facet (#967 R9)', () => {
    setContent();
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: 'Ring' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New ring rune' }));
    const form = screen.getByTestId('rune-form-new');
    expect(within(form).getByLabelText('name')).toBeInTheDocument();
    expect(within(form).queryByLabelText('rider-vsTrait')).not.toBeInTheDocument(); // ring form, not weapon
  });

  it('loads an existing rune into the structured rider fields', () => {
    setContent();
    render(<GmRunes />);
    selectRune('Vitalizing');
    const form = screen.getByTestId('rune-form-vitalizing');
    expect(within(form).getByLabelText('rider-vsTrait')).toHaveValue('undead');
    expect(within(form).getByLabelText('rider-persistent')).toHaveValue('1d6');
    expect(within(form).getByLabelText('rider-damageType')).toHaveValue('vitality');
    expect(within(form).getByLabelText('condition-0-name')).toHaveValue('enfeebled');
    expect(within(form).getByLabelText('condition-0-duration')).toHaveValue('end-of-next-turn');
  });

  it('authors a new property rune into the rich rider schema', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: '+ New rune' }));
    const form = screen.getByTestId('rune-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Sundering' } });
    fireEvent.change(within(form).getByLabelText('level'), { target: { value: '5' } });
    fireEvent.change(within(form).getByLabelText('price'), { target: { value: '150' } });
    fireEvent.change(within(form).getByLabelText('rider-vsTrait'), { target: { value: 'Undead' } });
    fireEvent.change(within(form).getByLabelText('rider-persistent'), { target: { value: '1d6' } });
    fireEvent.change(within(form).getByLabelText('rider-damageType'), { target: { value: 'vitality' } });
    fireEvent.click(within(form).getByText('Add crit condition'));
    fireEvent.change(within(form).getByLabelText('condition-0-name'), { target: { value: 'enfeebled' } });

    fireEvent.click(within(form).getByText('Create rune'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('rune');
    expect(id).toBe('sundering');
    expect(data).toMatchObject({
      type: 'property',
      name: 'Sundering',
      level: 5,
      price: 150,
      rider: {
        vsTrait: 'undead', // lowercased
        persistent: '1d6',
        damageType: 'vitality',
        onCrit: { conditions: [{ name: 'enfeebled', value: 1, duration: 'end-of-next-turn' }] },
      },
    });
  });

  it('drops the damage type when no persistent dice are set', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: '+ New rune' }));
    const form = screen.getByTestId('rune-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Returning' } });
    // damageType select is disabled without persistent dice — emit no rider.
    fireEvent.click(within(form).getByText('Create rune'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    expect(saveDocument.mock.calls[0][2].rider).toBeUndefined();
  });

  it('requires a name', async () => {
    setContent();
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: '+ New rune' }));
    const form = screen.getByTestId('rune-form-new');
    fireEvent.click(within(form).getByText('Create rune'));
    expect(await within(form).findByRole('alert')).toHaveTextContent(/name is required/i);
    expect(saveDocument).not.toHaveBeenCalled();
  });
});
