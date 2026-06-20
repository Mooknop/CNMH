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
