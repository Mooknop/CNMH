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

const character = {
  id: 'char-1',
  crafting: [
    { ref: 'minor-elixir-of-life', name: 'Minor Elixir of Life', level: 1, label: 'Minor' },
    { ref: 'antidote', name: 'Antidote', level: 6, label: 'Moderate' },
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

const withProjects = (projects) =>
  useSyncedState.mockReturnValue([
    projects != null ? { projects } : null,
    mockSetProjects,
  ]);

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(screen.getByText('Minor Elixir of Life (Minor)')).toBeInTheDocument();
    expect(screen.getByText('Antidote (Moderate)')).toBeInTheDocument();
  });

  it('Start project button is disabled until a recipe is selected', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    expect(screen.getByRole('button', { name: 'Start project' })).toBeDisabled();
  });

  it('enables Start project and creates a recipe project on confirm', () => {
    render(<CraftingProjects character={character} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    fireEvent.click(screen.getByTestId('cp-recipe-0')); // select first recipe
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
      name: 'Minor Elixir of Life (Minor)',
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

  describe('Item Completed flow', () => {
    const readyProject = {
      id: 'p-ready',
      ref: 'antidote',
      level: 1,
      name: 'Antidote (Lesser)',
      source: 'recipe',
      threshold: 8,
      hours: 8,
    };

    it('shows Ready badge and d20 input when hours meet the threshold', () => {
      withProjects([readyProject]);
      render(<CraftingProjects character={character} />);
      expect(screen.getByText(/ready to complete/i)).toBeInTheDocument();
      expect(screen.getByLabelText(`d20 roll for ${readyProject.name}`)).toBeInTheDocument();
    });

    it('does not show progress bar for a ready project', () => {
      withProjects([readyProject]);
      render(<CraftingProjects character={character} />);
      expect(screen.queryByText('8h / 8h')).not.toBeInTheDocument();
    });

    it('Complete button is disabled until a roll value is entered', () => {
      withProjects([readyProject]);
      render(<CraftingProjects character={character} />);
      expect(screen.getByRole('button', { name: `Complete ${readyProject.name}` })).toBeDisabled();
    });

    it('Complete button enables after entering a roll', () => {
      withProjects([readyProject]);
      render(<CraftingProjects character={character} />);
      fireEvent.change(screen.getByLabelText(`d20 roll for ${readyProject.name}`), {
        target: { value: '18' },
      });
      expect(screen.getByRole('button', { name: `Complete ${readyProject.name}` })).not.toBeDisabled();
    });

    it('clicking Complete removes the project from state', () => {
      withProjects([readyProject]);
      render(<CraftingProjects character={character} />);
      fireEvent.change(screen.getByLabelText(`d20 roll for ${readyProject.name}`), {
        target: { value: '15' },
      });
      fireEvent.click(screen.getByRole('button', { name: `Complete ${readyProject.name}` }));
      expect(mockSetProjects).toHaveBeenCalled();
      const updater = mockSetProjects.mock.calls[0][0];
      const result = updater({ projects: [readyProject] });
      expect(result.projects).toHaveLength(0);
    });

    it('shows an Item Completed banner with the rolled number after completing', () => {
      withProjects([readyProject]);
      render(<CraftingProjects character={character} />);
      fireEvent.change(screen.getByLabelText(`d20 roll for ${readyProject.name}`), {
        target: { value: '20' },
      });
      fireEvent.click(screen.getByRole('button', { name: `Complete ${readyProject.name}` }));
      expect(screen.getByRole('status')).toHaveTextContent(/Item Completed/i);
      expect(screen.getByRole('status')).toHaveTextContent('20');
      expect(screen.getByRole('status')).toHaveTextContent(readyProject.name);
    });

    it('Abandon still works on a ready project', () => {
      withProjects([readyProject]);
      render(<CraftingProjects character={character} />);
      fireEvent.click(screen.getByRole('button', { name: `Abandon ${readyProject.name}` }));
      expect(mockSetProjects).toHaveBeenCalled();
      const updater = mockSetProjects.mock.calls[0][0];
      const result = updater({ projects: [readyProject] });
      expect(result.projects).toHaveLength(0);
    });

    it('an in-progress project still shows a progress bar when threshold not yet met', () => {
      withProjects([
        { ...readyProject, hours: 4 },
      ]);
      render(<CraftingProjects character={character} />);
      expect(screen.getByText('4h / 8h')).toBeInTheDocument();
      expect(screen.queryByText(/ready to complete/i)).not.toBeInTheDocument();
    });
  });
});
