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
      { id: 'menacing', type: 'property', target: 'accessory', name: 'Menacing' },
      { id: 'weapon-potency-1', type: 'fundamental', fundamental: 'potency', target: 'weapon', name: '+1 Weapon Potency' },
    ] });
    render(<GmRunes />);
    // 2 weapon + 1 armor + 1 ring + 1 accessory property runes; the fundamental is excluded.
    expect(screen.getByText('Showing 5 of 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Slick' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Energy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menacing' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Weapon Potency/ })).not.toBeInTheDocument();
    // Grouped by target.
    expect(screen.getByText('Weapon runes')).toBeInTheDocument();
    expect(screen.getByText('Armor runes')).toBeInTheDocument();
    expect(screen.getByText('Ring runes')).toBeInTheDocument();
    expect(screen.getByText('Accessory runes')).toBeInTheDocument();
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

  it('edits an accessory rune, preserving its activation fields (#1033 S4)', async () => {
    saveDocument.mockResolvedValue({ ok: true });
    useContent.mockReturnValue({ runes: [
      { id: 'called', type: 'property', target: 'accessory', name: 'Called', level: 3, price: 60,
        rarity: 'uncommon', usage: ['light'], description: 'retrieve an item',
        actuated: { cost: 'none', name: 'Call Item', frequency: 'once per hour' } },
    ] });
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: 'Called' }));
    const form = screen.getByTestId('rune-form-called');
    expect(within(form).getByLabelText('name')).toHaveValue('Called');
    expect(within(form).getByLabelText('rarity')).toHaveValue('uncommon');
    expect(within(form).getByLabelText('usage-light')).toHaveAttribute('aria-pressed', 'true');
    expect(within(form).getByLabelText('usage-clothing')).toHaveAttribute('aria-pressed', 'false');
    expect(within(form).getByTestId('accessory-preserved-note')).toHaveTextContent('an activation');
    fireEvent.change(within(form).getByLabelText('description'), { target: { value: 'teleports to hand' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('rune');
    expect(id).toBe('called');
    // Descriptive edit applied; target, usage, rarity + the actuated block preserved.
    expect(data).toMatchObject({
      type: 'property', target: 'accessory', name: 'Called', rarity: 'uncommon',
      usage: ['light'], description: 'teleports to hand',
      actuated: { cost: 'none', name: 'Call Item', frequency: 'once per hour' },
    });
  });

  it('groups shield runes under their own target and facet (#1196)', () => {
    useContent.mockReturnValue({ runes: [
      ...runes,
      { id: 'weapon-storing', type: 'property', target: 'shield', name: 'Weapon-Storing', level: 8, price: 550,
        actuated: { cost: 'none', name: 'Weapon-Storing', actionCount: 1, frequency: 'at will' } },
    ] });
    render(<GmRunes />);
    expect(screen.getByText('Shield runes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weapon-Storing' })).toBeInTheDocument();
    // Shield facet filters to just the shield rune.
    fireEvent.click(screen.getByRole('button', { name: 'Shield' }));
    expect(screen.getByText('Showing 1 of 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Frost' })).not.toBeInTheDocument();
  });

  it('edits a shield rune through a safe form that preserves its activation, choices, and category gate (#1196)', async () => {
    saveDocument.mockResolvedValue({ ok: true });
    useContent.mockReturnValue({ runes: [
      { id: 'energy-resistant', type: 'property', target: 'shield', name: 'Energy-Resistant', level: 8, price: 500,
        description: 'resist an element', rarity: 'uncommon', duplicable: true,
        choices: ['fire', 'cold', 'acid', 'electricity', 'sonic'], shieldCategories: ['medium', 'heavy'],
        actuated: { cost: 'none', name: 'Toggle', actionCount: 1, frequency: 'once per day' } },
    ] });
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: 'Energy-Resistant' }));
    const form = screen.getByTestId('rune-form-energy-resistant');
    expect(within(form).getByLabelText('name')).toHaveValue('Energy-Resistant');
    expect(within(form).getByTestId('shield-preserved-note'))
      .toHaveTextContent('an activation · 5 etch choices · a shield-category restriction');
    // No weapon rider controls leak onto the shield form.
    expect(within(form).queryByLabelText('rider-vsTrait')).not.toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('description'), { target: { value: 'resist a chosen element' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('rune');
    expect(id).toBe('energy-resistant');
    // Descriptive edit applied; target stays 'shield' and every mechanic survives.
    expect(data).toMatchObject({
      type: 'property', target: 'shield', name: 'Energy-Resistant', description: 'resist a chosen element',
      rarity: 'uncommon', duplicable: true,
      choices: ['fire', 'cold', 'acid', 'electricity', 'sonic'], shieldCategories: ['medium', 'heavy'],
      actuated: { cost: 'none', name: 'Toggle', actionCount: 1, frequency: 'once per day' },
    });
  });

  it('creates a new rune under the shield facet with the safe form (#1196)', () => {
    setContent();
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: 'Shield' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New shield rune' }));
    const form = screen.getByTestId('rune-form-new');
    expect(within(form).getByLabelText('name')).toBeInTheDocument();
    expect(within(form).queryByLabelText('rider-vsTrait')).not.toBeInTheDocument(); // shield form, not weapon
  });

  it('authors a new accessory rune with usage tags, modifiers, and reminders (#1033 S4)', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: 'Accessory' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New accessory rune' }));
    const form = screen.getByTestId('rune-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Menacing' } });
    fireEvent.change(within(form).getByLabelText('level'), { target: { value: '3' } });
    fireEvent.change(within(form).getByLabelText('price'), { target: { value: '50' } });
    fireEvent.click(within(form).getByLabelText('usage-clothing'));
    fireEvent.click(within(form).getByText('Add modifier'));
    fireEvent.change(within(form).getByLabelText('modifier-0-stat'), { target: { value: 'intimidation' } });
    fireEvent.change(within(form).getByLabelText('modifier-0-amount'), { target: { value: '1' } });
    fireEvent.click(within(form).getByText('Add reminder'));
    fireEvent.change(within(form).getByLabelText('reminder-0'), { target: { value: 'Coerce only.' } });
    fireEvent.click(within(form).getByText('Create rune'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id, data] = saveDocument.mock.calls[0];
    expect(id).toBe('menacing');
    expect(data).toEqual({
      id: 'menacing', type: 'property', target: 'accessory', name: 'Menacing',
      level: 3, price: 50, usage: ['clothing'],
      modifiers: [{ stat: 'intimidation', kind: 'item', amount: 1 }],
      riders: [{ id: 'menacing-reminder-0', text: 'Coerce only.' }],
    });
  });

  it('authors a resistance modifier with a descriptor and flat-check ease (#1033 S4)', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: 'Accessory' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New accessory rune' }));
    const form = screen.getByTestId('rune-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Fire-Resistant' } });
    fireEvent.click(within(form).getByLabelText('usage-clothing'));
    fireEvent.click(within(form).getByText('Add modifier'));
    fireEvent.change(within(form).getByLabelText('modifier-0-stat'), { target: { value: 'resistance' } });
    // The kind select swaps out for the descriptor + ease controls.
    expect(within(form).queryByLabelText('modifier-0-kind')).not.toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('modifier-0-vs'), { target: { value: 'Fire' } });
    fireEvent.change(within(form).getByLabelText('modifier-0-amount'), { target: { value: '5' } });
    fireEvent.click(within(form).getByLabelText('modifier-0-ease'));
    fireEvent.click(within(form).getByText('Create rune'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const data = saveDocument.mock.calls[0][2];
    expect(data.modifiers).toEqual([
      { stat: 'resistance', vs: 'fire', amount: 5, flatCheckEase: true },
    ]);
  });

  it('requires a usage tag on an accessory rune (#1033 S4)', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: 'Accessory' }));
    fireEvent.click(screen.getByRole('button', { name: '+ New accessory rune' }));
    const form = screen.getByTestId('rune-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Snagging' } });
    fireEvent.click(within(form).getByText('Create rune'));
    expect(await within(form).findByRole('alert')).toHaveTextContent(/usage tag/i);
    expect(saveDocument).not.toHaveBeenCalled();
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

  it('authors the immediate-dice + crit-persistent forms (#1019 flaming)', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmRunes />);
    fireEvent.click(screen.getByRole('button', { name: '+ New rune' }));
    const form = screen.getByTestId('rune-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Flaming' } });
    fireEvent.change(within(form).getByLabelText('level'), { target: { value: '8' } });
    fireEvent.change(within(form).getByLabelText('price'), { target: { value: '500' } });
    fireEvent.change(within(form).getByLabelText('rider-dice'), { target: { value: '1d6' } });
    fireEvent.change(within(form).getByLabelText('rider-critPersistent'), { target: { value: '1d10' } });
    fireEvent.change(within(form).getByLabelText('rider-damageType'), { target: { value: 'fire' } });

    fireEvent.click(within(form).getByText('Create rune'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id, data] = saveDocument.mock.calls[0];
    expect(id).toBe('flaming');
    expect(data.rider).toEqual({
      dice: '1d6',
      damageType: 'fire',
      onCrit: { persistent: '1d10' },
    });
  });

  it('round-trips the immediate-dice fields back into the form', () => {
    useContent.mockReturnValue({ runes: [
      ...runes,
      { id: 'flaming', type: 'property', name: 'Flaming', level: 8, price: 500,
        rider: { dice: '1d6', damageType: 'fire', onCrit: { persistent: '1d10' } } },
    ] });
    render(<GmRunes />);
    selectRune('Flaming');
    const form = screen.getByTestId('rune-form-flaming');
    expect(within(form).getByLabelText('rider-dice')).toHaveValue('1d6');
    expect(within(form).getByLabelText('rider-critPersistent')).toHaveValue('1d10');
    expect(within(form).getByLabelText('rider-damageType')).toHaveValue('fire');
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
