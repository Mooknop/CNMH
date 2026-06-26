import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmArmorRunes from './GmArmorRunes';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn(), deleteDocument: vi.fn() }));
vi.mock('../../components/gm/HistoryModal', () => ({ default: () => null }));
import { useContent } from '../../contexts/ContentContext';
import { saveDocument } from '../../utils/gmApi';

const runes = [
  // A weapon property rune — must NOT appear in this armor-only editor.
  { id: 'vitalizing', type: 'property', name: 'Vitalizing', price: 150 },
  {
    id: 'shadow',
    type: 'property',
    armorRune: true,
    name: 'Shadow',
    level: 5,
    price: 55,
    description: '+1 Stealth.',
    modifiers: [{ stat: 'stealth', kind: 'item', amount: 1 }],
  },
  {
    id: 'quenching',
    type: 'property',
    armorRune: true,
    name: 'Quenching',
    price: 250,
    riders: [{ id: 'quenching-reminder', text: 'Flat check 15 → 12.' }],
  },
];

const setContent = () => useContent.mockReturnValue({ runes });
afterEach(() => vi.restoreAllMocks());

const selectRune = (name) => fireEvent.click(screen.getByRole('button', { name }));

describe('GmArmorRunes', () => {
  it('lists only armor runes, not weapon runes', () => {
    setContent();
    render(<GmArmorRunes />);
    expect(screen.getByRole('button', { name: 'Shadow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quenching' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vitalizing' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument();
  });

  it('loads an existing rune into the modifier rows', () => {
    setContent();
    render(<GmArmorRunes />);
    selectRune('Shadow');
    const form = screen.getByTestId('armor-rune-form-shadow');
    expect(within(form).getByLabelText('modifier-0-stat')).toHaveValue('stealth');
    expect(within(form).getByLabelText('modifier-0-kind')).toHaveValue('item');
    expect(within(form).getByLabelText('modifier-0-amount')).toHaveValue(1);
  });

  it('loads a reminder-only rune into the reminder rows', () => {
    setContent();
    render(<GmArmorRunes />);
    selectRune('Quenching');
    const form = screen.getByTestId('armor-rune-form-quenching');
    expect(within(form).getByLabelText('reminder-0')).toHaveValue('Flat check 15 → 12.');
  });

  it('authors a new armor rune with a modifier + reminder, flagged armorRune', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmArmorRunes />);
    fireEvent.click(screen.getByRole('button', { name: '+ New armor rune' }));
    const form = screen.getByTestId('armor-rune-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Winterstep' } });
    fireEvent.change(within(form).getByLabelText('level'), { target: { value: '7' } });
    fireEvent.change(within(form).getByLabelText('price'), { target: { value: '320' } });

    fireEvent.click(within(form).getByText('Add modifier'));
    fireEvent.change(within(form).getByLabelText('modifier-0-stat'), { target: { value: 'reflex' } });
    fireEvent.change(within(form).getByLabelText('modifier-0-amount'), { target: { value: '1' } });

    fireEvent.click(within(form).getByText('Add reminder'));
    fireEvent.change(within(form).getByLabelText('reminder-0'), { target: { value: 'Leaves no tracks on snow.' } });

    fireEvent.click(within(form).getByText('Create rune'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [collection, id, payload] = saveDocument.mock.calls[0];
    expect(collection).toBe('rune');
    expect(id).toBe('winterstep');
    expect(payload).toMatchObject({
      type: 'property',
      armorRune: true,
      name: 'Winterstep',
      level: 7,
      price: 320,
      modifiers: [{ stat: 'reflex', kind: 'item', amount: 1 }],
      riders: [{ id: 'winterstep-reminder-0', text: 'Leaves no tracks on snow.' }],
    });
  });

  it('requires a name', async () => {
    setContent();
    render(<GmArmorRunes />);
    fireEvent.click(screen.getByRole('button', { name: '+ New armor rune' }));
    const form = screen.getByTestId('armor-rune-form-new');
    fireEvent.click(within(form).getByText('Create rune'));
    expect(await within(form).findByRole('alert')).toHaveTextContent(/name is required/i);
    expect(saveDocument).not.toHaveBeenCalled();
  });
});
