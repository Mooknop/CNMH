import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmEffects from './GmEffects';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn(), deleteDocument: vi.fn() }));
vi.mock('../../components/gm/HistoryModal', () => ({ default: () => null }));
import { useContent } from '../../contexts/ContentContext';
import { saveDocument } from '../../utils/gmApi';

const effects = [
  {
    id: 'inspire-courage',
    name: 'Inspire Courage',
    description: '+1 status bonus to attack and damage.',
    modifiers: [
      { stat: 'meleeAttack', kind: 'status', amount: 1 },
      { stat: 'rangedAttack', kind: 'status', amount: 1 },
    ],
  },
  {
    id: 'bless',
    name: 'Bless',
    description: '+1 status to attacks.',
    modifiers: [{ stat: 'meleeAttack', kind: 'status', amount: 1 }],
  },
];

const setContent = (overrides = {}) =>
  useContent.mockReturnValue({ effects, syncEffects: vi.fn(), ...overrides });

afterEach(() => vi.restoreAllMocks());

// Helper: select an effect list item to open its form in the detail pane.
const selectEffect = (name) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('GmEffects', () => {
  it('lists effects sorted alphabetically as master-list buttons', () => {
    setContent();
    render(<GmEffects />);
    expect(screen.getByRole('button', { name: 'Bless' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inspire Courage' })).toBeInTheDocument();
    expect(screen.queryByTestId('effect-form-bless')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument();
  });

  it('filters by name', () => {
    setContent();
    render(<GmEffects />);
    fireEvent.change(screen.getByLabelText(/filter/i), { target: { value: 'bless' } });
    expect(screen.getByRole('button', { name: 'Bless' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inspire Courage' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2')).toBeInTheDocument();
  });

  it('shows + New effect button and opens new form on click', () => {
    setContent();
    render(<GmEffects />);
    fireEvent.click(screen.getByRole('button', { name: '+ New effect' }));
    expect(screen.getByTestId('effect-form-new')).toBeInTheDocument();
  });

  it('saves a new effect via saveDocument', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmEffects />);
    fireEvent.click(screen.getByRole('button', { name: '+ New effect' }));
    const form = screen.getByTestId('effect-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Heroism' } });
    fireEvent.change(within(form).getByLabelText('description'), {
      target: { value: '+1 status to checks.' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Create effect' }));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('effect');
    expect(id).toBe('heroism');
    expect(data.name).toBe('Heroism');
  });

  it('saves an existing effect', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmEffects />);
    selectEffect('Bless');
    const form = screen.getByTestId('effect-form-bless');
    fireEvent.change(within(form).getByLabelText('description'), {
      target: { value: 'Updated description.' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id] = saveDocument.mock.calls[0];
    expect(id).toBe('bless');
  });

  it('adds and removes a modifier row', () => {
    setContent();
    render(<GmEffects />);
    selectEffect('Bless');
    const form = screen.getByTestId('effect-form-bless');
    const before = within(form).getAllByLabelText(/^modifier-\d+-stat$/).length;
    fireEvent.click(within(form).getByRole('button', { name: 'Add modifier' }));
    expect(within(form).getAllByLabelText(/^modifier-\d+-stat$/).length).toBe(before + 1);
    const removeBtns = within(form).getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removeBtns[0]);
    expect(within(form).getAllByLabelText(/^modifier-\d+-stat$/).length).toBe(before);
  });

  it('shows a validation error when saving with no name', async () => {
    setContent();
    render(<GmEffects />);
    fireEvent.click(screen.getByRole('button', { name: '+ New effect' }));
    const form = screen.getByTestId('effect-form-new');
    fireEvent.click(within(form).getByRole('button', { name: 'Create effect' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Effect name is required');
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('opens delete confirm dialog on Delete click', () => {
    setContent();
    render(<GmEffects />);
    selectEffect('Bless');
    const form = screen.getByTestId('effect-form-bless');
    fireEvent.click(within(form).getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/Permanently delete the effect/i)).toBeInTheDocument();
  });

  it('renders empty state when no effects', () => {
    useContent.mockReturnValue({ effects: [], syncEffects: vi.fn() });
    render(<GmEffects />);
    expect(screen.getByText('Showing 0 of 0')).toBeInTheDocument();
  });
});
