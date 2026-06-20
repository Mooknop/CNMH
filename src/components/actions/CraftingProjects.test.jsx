import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CraftingProjects from './CraftingProjects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';

vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: vi.fn(() => [null, vi.fn()]),
}));

vi.mock('../../contexts/ContentContext', () => ({
  useContent: vi.fn(() => ({ items: [] })),
}));

const mockSetProjects = vi.fn();
const mockSetGold = vi.fn();
let goldValue = 100;

const character = {
  id: 'char-1',
  crafting: [
    { ref: 'minor-elixir-of-life', name: 'Minor Elixir of Life' },
    {
      ref: 'antidote',
      name: 'Antidote',
      variants: [
        { level: 1, label: 'Lesser', price: 3, effect: '+2 bonus' },
        { level: 6, label: 'Moderate', price: 35, effect: '+3 bonus' },
      ],
    },
  ],
};

const catalogItems = [
  { id: 'torch', name: 'Torch' },
  {
    id: 'antidote',
    name: 'Antidote',
    variants: [
      { level: 1, label: 'Lesser', price: 3, effect: '+2 bonus' },
      { level: 6, label: 'Moderate', price: 35, effect: '+3 bonus' },
    ],
  },
];

// Key-aware: the gold key returns [goldValue, mockSetGold]; everything else is
// the craftprojects state. (CraftingProjects reads its own gold to charge the
// up-front half-cost on start.)
const withProjects = (projects) =>
  useSyncedState.mockImplementation((key) => {
    if (typeof key === 'string' && key.startsWith('cnmh_gold_')) {
      return [goldValue, mockSetGold];
    }
    return [projects != null ? { projects } : null, mockSetProjects];
  });

beforeEach(() => {
  vi.clearAllMocks();
  goldValue = 100;
  withProjects(null);
  useContent.mockReturnValue({ items: catalogItems });
});

describe('CraftingProjects', () => {
  it('shows empty state when no projects', () => {
    render(<CraftingProjects character={character} />);
    expect(screen.getByText(/no active projects/i)).toBeInTheDocument();
  });

  it('renders in-progress projects with progress labels', () => {
    withProjects([
      { id: 'p1', ref: 'antidote', level: 1, name: 'Antidote (Lesser)', source: 'recipe', threshold: 8, hours: 4 },
    ]);
    render(<CraftingProjects character={character} />);
    expect(screen.getByText('Antidote (Lesser)')).toBeInTheDocument();
    expect(screen.getByText('4h / 8h')).toBeInTheDocument();
  });

  it('shows level and DC in project meta when level is set', () => {
    withProjects([
      { id: 'p1', ref: 'antidote', level: 6, name: 'Antidote (Moderate)', source: 'recipe', threshold: 8, hours: 0 },
    ]);
    render(<CraftingProjects character={character} />);
    expect(screen.getByText(/Level 6/)).toBeInTheDocument();
  });

  it('removes a project when Abandon is clicked', () => {
    withProjects([
      { id: 'p1', ref: 'antidote', level: 1, name: 'Antidote (Lesser)', source: 'recipe', threshold: 8, hours: 0 },
    ]);
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abandon Antidote (Lesser)' }));
    expect(mockSetProjects).toHaveBeenCalled();
    const updater = mockSetProjects.mock.calls[0][0];
    const result = updater({ projects: [{ id: 'p1', name: 'Antidote (Lesser)' }] });
    expect(result.projects).toHaveLength(0);
  });

  it('opens the add panel with Recipe tab active on + New click', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    expect(screen.getByText(/from recipe/i)).toBeInTheDocument();
    expect(screen.getByText(/from catalog/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Known recipes')).toBeInTheDocument();
  });

  it('shows known recipes in the recipe list', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    expect(screen.getByTestId('cp-recipe-0')).toBeInTheDocument();
    expect(screen.getByTestId('cp-recipe-1')).toBeInTheDocument();
    expect(screen.getByText('Minor Elixir of Life')).toBeInTheDocument();
    expect(screen.getByText('Antidote')).toBeInTheDocument();
  });

  it('Start project button is disabled until a recipe is selected', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    expect(screen.getByRole('button', { name: 'Start project' })).toBeDisabled();
  });

  it('enables Start project and creates a flat recipe project on confirm', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByTestId('cp-recipe-0')); // flat recipe — no variants
    expect(screen.queryByLabelText('Recipe grade')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start project' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start project' }));
    expect(mockSetProjects).toHaveBeenCalled();
    const updater = mockSetProjects.mock.calls[0][0];
    const result = updater(null);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toMatchObject({
      source: 'recipe',
      threshold: 8,
      hours: 0,
      name: 'Minor Elixir of Life',
    });
  });

  it('shows grade select for recipe with variants', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByTestId('cp-recipe-1')); // Antidote — has variants
    expect(screen.getByLabelText('Recipe grade')).toBeInTheDocument();
  });

  it('Start project disabled until grade chosen for multi-variant recipe', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByTestId('cp-recipe-1'));
    expect(screen.getByRole('button', { name: 'Start project' })).toBeDisabled();
  });

  it('creates a recipe project with chosen variant level and name', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByTestId('cp-recipe-1')); // Antidote
    fireEvent.change(screen.getByLabelText('Recipe grade'), { target: { value: '6' } });
    expect(screen.getByRole('button', { name: 'Start project' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start project' }));
    const updater = mockSetProjects.mock.calls[0][0];
    const result = updater(null);
    expect(result.projects[0]).toMatchObject({
      ref: 'antidote',
      level: 6,
      source: 'recipe',
      threshold: 8,
      name: 'Antidote (Moderate)',
    });
  });

  it('closes the add panel after starting a project', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByTestId('cp-recipe-0'));
    fireEvent.click(screen.getByRole('button', { name: 'Start project' }));
    // Add panel is gone
    expect(screen.queryByLabelText('Known recipes')).not.toBeInTheDocument();
  });

  it('Cancel hides the add panel', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Known recipes')).not.toBeInTheDocument();
  });

  it('switches to Catalog tab and shows item select', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByText('From Catalog'));
    expect(screen.getByLabelText('Catalog item')).toBeInTheDocument();
  });

  it('shows grade select for multi-level catalog items', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByText('From Catalog'));
    fireEvent.change(screen.getByLabelText('Catalog item'), { target: { value: 'antidote' } });
    expect(screen.getByLabelText('Item grade')).toBeInTheDocument();
  });

  it('does not show grade select for flat catalog items', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByText('From Catalog'));
    fireEvent.change(screen.getByLabelText('Catalog item'), { target: { value: 'torch' } });
    expect(screen.queryByLabelText('Item grade')).not.toBeInTheDocument();
  });

  it('Start project disabled until grade is chosen for multi-level item', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByText('From Catalog'));
    fireEvent.change(screen.getByLabelText('Catalog item'), { target: { value: 'antidote' } });
    expect(screen.getByRole('button', { name: 'Start project' })).toBeDisabled();
  });

  it('creates a catalog-item project with threshold 16h', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByText('From Catalog'));
    fireEvent.change(screen.getByLabelText('Catalog item'), { target: { value: 'torch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start project' }));
    const updater = mockSetProjects.mock.calls[0][0];
    const result = updater(null);
    expect(result.projects[0]).toMatchObject({
      ref: 'torch',
      source: 'catalog-item',
      threshold: 16,
      hours: 0,
      name: 'Torch',
    });
  });

  it('creates a catalog-item project with correct name for multi-level item', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByText('From Catalog'));
    fireEvent.change(screen.getByLabelText('Catalog item'), { target: { value: 'antidote' } });
    fireEvent.change(screen.getByLabelText('Item grade'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start project' }));
    const updater = mockSetProjects.mock.calls[0][0];
    const result = updater(null);
    expect(result.projects[0]).toMatchObject({
      ref: 'antidote',
      level: 1,
      source: 'catalog-item',
      threshold: 16,
      name: 'Antidote (Lesser)',
    });
  });

  it('shows empty recipe message when character has no recipes', () => {
    render(<CraftingProjects character={{ id: 'char-1', crafting: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    expect(screen.getByText(/no known recipes/i)).toBeInTheDocument();
  });

  describe('start cost (half up front)', () => {
    const startAntidoteModerate = () => {
      render(<CraftingProjects character={character} />);
      fireEvent.click(screen.getByRole('button', { name: '+ New' }));
      fireEvent.click(screen.getByTestId('cp-recipe-1')); // Antidote (has variants)
      fireEvent.change(screen.getByLabelText('Recipe grade'), { target: { value: '6' } }); // price 35
    };

    it('previews the up-front half-cost once a priced grade is chosen', () => {
      startAntidoteModerate();
      expect(screen.getByText(/Up-front: 17\.5 gp/)).toBeInTheDocument();
      expect(screen.getByText(/½ of 35 gp/)).toBeInTheDocument();
    });

    it('deducts the half-cost from personal gold on start', () => {
      startAntidoteModerate();
      fireEvent.click(screen.getByRole('button', { name: 'Start project' }));
      expect(mockSetGold).toHaveBeenCalled();
      // 35 gp → 1750 cp half → 17.5 gp off 100
      expect(mockSetGold.mock.calls[0][0](100)).toBe(82.5);
    });

    it('stores cost + craft state on the project entry', () => {
      startAntidoteModerate();
      fireEvent.click(screen.getByRole('button', { name: 'Start project' }));
      const result = mockSetProjects.mock.calls[0][0](null);
      expect(result.projects[0]).toMatchObject({
        ref: 'antidote', level: 6,
        price: 35, costCp: 3500, paidCp: 1750, remainingCp: 1750,
        craftRank: 0, status: 'in-progress',
      });
    });

    it('warns but does not block when the up-front cost exceeds gold', () => {
      goldValue = 10; // less than 17.5
      startAntidoteModerate();
      expect(screen.getByText(/over your 10 gp/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start project' })).not.toBeDisabled();
    });

    it('does not touch gold for a price-less item', () => {
      render(<CraftingProjects character={character} />);
      fireEvent.click(screen.getByRole('button', { name: '+ New' }));
      fireEvent.click(screen.getByTestId('cp-recipe-0')); // Minor Elixir of Life — no price
      fireEvent.click(screen.getByRole('button', { name: 'Start project' }));
      expect(mockSetGold).not.toHaveBeenCalled();
    });

    it('shows remaining gold owed on an in-progress card', () => {
      withProjects([
        { id: 'p1', ref: 'antidote', level: 6, name: 'Antidote (Moderate)', source: 'recipe', threshold: 8, hours: 2, remainingCp: 1750 },
      ]);
      render(<CraftingProjects character={character} />);
      expect(screen.getByText(/17\.5 gp left/)).toBeInTheDocument();
    });
  });

  describe('craft check + finish decision', () => {
    // Level 6 → DC 22. craftRank 2 (expert) → lvl-6 expert Earn Income = 2 gp/day.
    const readyProject = {
      id: 'p-ready', ref: 'antidote', level: 6, name: 'Antidote (Moderate)',
      source: 'recipe', threshold: 8, hours: 8,
      price: 35, costCp: 3500, paidCp: 1750, remainingCp: 1750, craftRank: 2, status: 'in-progress',
    };
    const awaiting = (degree) => ({ ...readyProject, status: 'awaiting-decision', craftDegree: degree });

    const enterCheck = (d20, total) => {
      fireEvent.change(screen.getByLabelText(`d20 die for ${readyProject.name}`), { target: { value: String(d20) } });
      fireEvent.change(screen.getByLabelText(`check total for ${readyProject.name}`), { target: { value: String(total) } });
    };

    it('prompts the Craft check (with DC) once setup hours are met', () => {
      withProjects([readyProject]);
      render(<CraftingProjects character={character} />);
      expect(screen.getByText(/make your Craft check \(DC 22\)/i)).toBeInTheDocument();
      expect(screen.queryByText('8h / 8h')).not.toBeInTheDocument();
    });

    it('Resolve is disabled until a valid d20 + total are entered', () => {
      withProjects([readyProject]);
      render(<CraftingProjects character={character} />);
      const btn = screen.getByRole('button', { name: `Resolve Craft check for ${readyProject.name}` });
      expect(btn).toBeDisabled();
      enterCheck(15, 25);
      expect(btn).not.toBeDisabled();
    });

    it('resolving a passing check parks the project on its degree', () => {
      withProjects([readyProject]);
      render(<CraftingProjects character={character} />);
      enterCheck(15, 25); // total 25 ≥ DC 22 → success
      fireEvent.click(screen.getByRole('button', { name: `Resolve Craft check for ${readyProject.name}` }));
      const result = mockSetProjects.mock.calls[0][0]({ projects: [readyProject] });
      expect(result.projects[0]).toMatchObject({ status: 'awaiting-decision', craftDegree: 'success' });
    });

    it('a success offers Complete now and Continue', () => {
      withProjects([awaiting('success')]);
      render(<CraftingProjects character={character} />);
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Complete ${readyProject.name} now` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Continue ${readyProject.name}` })).toBeInTheDocument();
    });

    it('Complete now pays the remaining cost and marks completed', () => {
      withProjects([awaiting('success')]);
      render(<CraftingProjects character={character} />);
      fireEvent.click(screen.getByRole('button', { name: `Complete ${readyProject.name} now` }));
      expect(mockSetGold.mock.calls[0][0](100)).toBe(82.5); // 100 − 17.5 remaining
      const result = mockSetProjects.mock.calls[0][0]({ projects: [awaiting('success')] });
      expect(result.projects[0]).toMatchObject({ status: 'completed', remainingCp: 0 });
    });

    it('Continue switches the project to reducing (no gold spent yet)', () => {
      withProjects([awaiting('success')]);
      render(<CraftingProjects character={character} />);
      fireEvent.click(screen.getByRole('button', { name: `Continue ${readyProject.name}` }));
      expect(mockSetGold).not.toHaveBeenCalled();
      const result = mockSetProjects.mock.calls[0][0]({ projects: [awaiting('success')] });
      expect(result.projects[0].status).toBe('reducing');
    });

    it('a failure offers Keep working, which re-banks the setup', () => {
      withProjects([awaiting('failure')]);
      render(<CraftingProjects character={character} />);
      fireEvent.click(screen.getByRole('button', { name: `Keep working ${readyProject.name}` }));
      const result = mockSetProjects.mock.calls[0][0]({ projects: [awaiting('failure')] });
      expect(result.projects[0]).toMatchObject({ status: 'in-progress', hours: 0, craftDegree: null });
    });

    it('a critical failure ruins materials and discards on confirm', () => {
      withProjects([awaiting('criticalFailure')]);
      render(<CraftingProjects character={character} />);
      expect(screen.getByText(/Materials ruined — lose 3\.5 gp/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: `Discard ${readyProject.name}` }));
      expect(mockSetGold.mock.calls[0][0](100)).toBe(96.5); // −3.5 gp ruined
      const result = mockSetProjects.mock.calls[0][0]({ projects: [awaiting('criticalFailure')] });
      expect(result.projects).toHaveLength(0);
    });

    it('a reducing project shows remaining cost and a finish-now option', () => {
      withProjects([{ ...readyProject, status: 'reducing', craftDegree: 'success' }]);
      render(<CraftingProjects character={character} />);
      expect(screen.getByText(/17\.5 gp left, −2 gp per crafting day/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Finish ${readyProject.name} now` })).toBeInTheDocument();
    });

    it('a completed project shows the completed card', () => {
      withProjects([{ ...readyProject, status: 'completed', craftDegree: 'success' }]);
      render(<CraftingProjects character={character} />);
      expect(screen.getByText('✓ Completed')).toBeInTheDocument();
      expect(screen.getByText(/awaiting GM grant/)).toBeInTheDocument();
    });

    it('an in-progress project below threshold still shows a progress bar', () => {
      withProjects([{ ...readyProject, hours: 4 }]);
      render(<CraftingProjects character={character} />);
      expect(screen.getByText('4h / 8h')).toBeInTheDocument();
      expect(screen.queryByText(/make your Craft check/i)).not.toBeInTheDocument();
    });
  });
});
