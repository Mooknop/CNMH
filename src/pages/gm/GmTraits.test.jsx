import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmTraits from './GmTraits';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn(), deleteDocument: vi.fn() }));
vi.mock('../../components/gm/HistoryModal', () => ({ default: () => null }));
import { useContent } from '../../contexts/ContentContext';
import { saveDocument } from '../../utils/gmApi';

const traits = [
  { id: 'manipulate', name: 'Manipulate', description: 'Requires a free hand or gesture.' },
  { id: 'fire', name: 'Fire', description: 'Deals fire damage.' },
];

const setContent = (overrides = {}) =>
  useContent.mockReturnValue({ traits, ...overrides });

afterEach(() => vi.restoreAllMocks());

const selectTrait = (name) => fireEvent.click(screen.getByRole('button', { name }));

describe('GmTraits', () => {
  it('lists traits sorted alphabetically as master-list buttons', () => {
    setContent();
    render(<GmTraits />);
    expect(screen.getByRole('button', { name: 'Fire' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manipulate' })).toBeInTheDocument();
    expect(screen.queryByTestId('trait-form-fire')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument();
  });

  it('filters by name', () => {
    setContent();
    render(<GmTraits />);
    fireEvent.change(screen.getByLabelText(/filter/i), { target: { value: 'fire' } });
    expect(screen.getByRole('button', { name: 'Fire' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manipulate' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2')).toBeInTheDocument();
  });

  it('shows + New trait button and opens new form on click', () => {
    setContent();
    render(<GmTraits />);
    fireEvent.click(screen.getByRole('button', { name: '+ New trait' }));
    expect(screen.getByTestId('trait-form-new')).toBeInTheDocument();
  });

  it('saves a new trait via saveDocument with a slugified id and no leaked keys', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmTraits />);
    fireEvent.click(screen.getByRole('button', { name: '+ New trait' }));
    const form = screen.getByTestId('trait-form-new');
    fireEvent.change(within(form).getByLabelText('name'), { target: { value: 'Concentrate' } });
    fireEvent.change(within(form).getByLabelText('description'), {
      target: { value: 'Requires focus.' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Create trait' }));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('trait');
    expect(id).toBe('concentrate');
    expect(data).toEqual({ id: 'concentrate', name: 'Concentrate', description: 'Requires focus.' });
  });

  it('saves an existing trait under its existing id', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmTraits />);
    selectTrait('Fire');
    const form = screen.getByTestId('trait-form-fire');
    fireEvent.change(within(form).getByLabelText('description'), {
      target: { value: 'Updated.' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id] = saveDocument.mock.calls[0];
    expect(id).toBe('fire');
  });

  it('shows a validation error when saving with no name', async () => {
    setContent();
    render(<GmTraits />);
    fireEvent.click(screen.getByRole('button', { name: '+ New trait' }));
    const form = screen.getByTestId('trait-form-new');
    fireEvent.click(within(form).getByRole('button', { name: 'Create trait' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Trait name is required');
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('opens delete confirm dialog on Delete click', () => {
    setContent();
    render(<GmTraits />);
    selectTrait('Fire');
    const form = screen.getByTestId('trait-form-fire');
    fireEvent.click(within(form).getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/Permanently delete the trait/i)).toBeInTheDocument();
  });

  it('renders empty state when no traits', () => {
    useContent.mockReturnValue({ traits: [] });
    render(<GmTraits />);
    expect(screen.getByText('Showing 0 of 0')).toBeInTheDocument();
  });

  it('coverage report lists referenced traits with no definition', () => {
    setContent({
      items: [{ id: 'elixir', name: 'Elixir', traits: ['Healing', 'Frobnicate'] }],
      spells: [{ id: 'breathe-fire', name: 'Breathe Fire', traits: ['Fire'] }],
    });
    render(<GmTraits />);
    const panel = screen.getByLabelText('Trait coverage');
    // 'Healing' and 'Frobnicate' have no definition; 'Fire' does.
    expect(within(panel).getByText(/2 referenced traits have no definition/i)).toBeInTheDocument();
    expect(within(panel).getByText('Frobnicate')).toBeInTheDocument();
    expect(within(panel).getByText('Healing')).toBeInTheDocument();
    expect(within(panel).getAllByText(/Elixir/).length).toBeGreaterThan(0);
    expect(within(panel).queryByText('Fire')).not.toBeInTheDocument();
  });

  it('coverage report shows all-clear when every reference resolves', () => {
    setContent({ spells: [{ id: 's', name: 'S', traits: ['Fire', 'Manipulate'] }] });
    render(<GmTraits />);
    expect(
      within(screen.getByLabelText('Trait coverage')).getByText(/All referenced traits have definitions/i)
    ).toBeInTheDocument();
  });

  it('reverse view lists content referencing the selected definition', () => {
    setContent({
      spells: [{ id: 'breathe-fire', name: 'Breathe Fire', traits: ['Fire'] }],
      items: [{ id: 'flaming', name: 'Flaming Sword', traits: ['Fire'] }],
    });
    render(<GmTraits />);
    selectTrait('Fire');
    const form = screen.getByTestId('trait-form-fire');
    expect(within(form).getByText('Referenced by 2:')).toBeInTheDocument();
    expect(within(form).getByText(/Breathe Fire/)).toBeInTheDocument();
    expect(within(form).getByText(/Flaming Sword/)).toBeInTheDocument();
  });

  it('reverse view shows the empty state for an unreferenced definition', () => {
    setContent({ spells: [{ id: 'breathe-fire', name: 'Breathe Fire', traits: ['Fire'] }] });
    render(<GmTraits />);
    selectTrait('Manipulate');
    const form = screen.getByTestId('trait-form-manipulate');
    expect(within(form).getByText('Not referenced by any content.')).toBeInTheDocument();
  });
});
