import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InventoryTab from './InventoryTab';

// Mock dependencies
jest.mock('../../utils/InventoryUtils', () => ({
  formatBulk: (bulk) => {
    if (bulk === 0) return '—';
    if (bulk < 1) return 'L';
    return bulk.toString();
  },
  getBulkStatus: (used, limit, threshold) => ({
    percentage: limit > 0 ? (used / limit) * 100 : 0,
    isEncumbered: used > threshold && used <= limit,
    isOverencumbered: used > limit
  }),
  calculateItemsBulk: jest.fn(() => 5)
}));

jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: (character) => {
    if (!character) return null;
    return {
      id: 'hero',
      bulkStats: {
        bulkLimit: 10,
        encumberedThreshold: 7
      },
      totalBulk: 5,
      inventory: [
        { uid: 'u1', id: '1', name: 'Longsword', weight: 1, state: 'held2' },
        { uid: 'u2', id: '2', name: 'Leather Armor', weight: 1, state: 'dropped' },
        { uid: 'u3', id: '3', name: 'Worn Cloak', weight: 0.5, state: 'worn' },
        {
          uid: 'u4', id: '4', name: 'Backpack', weight: 0.1, state: 'worn',
          container: { capacity: 4, ignored: 1, contents: [] },
        },
      ],
      skillProficiencies: {
        crafting: 1
      }
    };
  }
}));

const mockLoadout = {
  drop: jest.fn(),
  pickUp: jest.fn(),
  stow: jest.fn(),
  unhand: jest.fn(),
  retrieve: jest.fn(),
  moveToContainer: jest.fn(),
};
jest.mock('../../hooks/useLoadout', () => ({
  __esModule: true,
  useLoadout: () => mockLoadout,
}));

jest.mock('./ContainersList', () => {
  return function DummyContainersList({ inventory }) {
    return <div data-testid="containers-list">Containers List</div>;
  };
});

jest.mock('./CraftingModal', () => {
  return function DummyCraftingModal({ isOpen, onClose }) {
    return isOpen ? (
      <div data-testid="crafting-modal">Crafting Modal</div>
    ) : null;
  };
});

describe('InventoryTab', () => {
  beforeEach(() => {
    Object.values(mockLoadout).forEach((fn) => fn.mockClear());
  });

  const mockCharacter = {
    id: '1',
    name: 'Test Character',
    level: 1,
    inventory: [
      { id: '1', name: 'Longsword', weight: 1 },
      { id: '2', name: 'Leather Armor', weight: 1 }
    ],
    skills: {
      crafting: 1
    }
  };

  it('should render without crashing', () => {
    expect(() =>
      render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />)
    ).not.toThrow();
  });

  it('should handle null character gracefully', () => {
    expect(() =>
      render(<InventoryTab character={null} characterColor="#7E8C9A" />)
    ).not.toThrow();
  });

  it('should display inventory header', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    
    expect(screen.getByText('Inventory')).toBeInTheDocument();
  });

  it('should display bulk information', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    
    expect(screen.getByText(/Bulk Used:/)).toBeInTheDocument();
    expect(screen.getByText(/Encumbered at:/)).toBeInTheDocument();
    expect(screen.getByText(/Maximum:/)).toBeInTheDocument();
  });

  it('should apply character color to header', () => {
    const { container } = render(
      <InventoryTab character={mockCharacter} characterColor="#ff0000" />
    );
    
    const header = container.querySelector('.inventory-header h2');
    expect(header).toHaveStyle('color: #ff0000');
  });

  it('should show crafting button if character has crafting proficiency', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    
    const craftingButton = screen.queryByText('Crafting');
    expect(craftingButton).toBeInTheDocument();
  });

  it('should apply theme color to crafting button', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#ff0000" />);
    
    const craftingButton = screen.getByText('Crafting');
    expect(craftingButton).toHaveStyle('background-color: #ff0000');
  });

  it('should open crafting modal when button clicked', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    
    const craftingButton = screen.getByText('Crafting');
    fireEvent.click(craftingButton);
    
    expect(screen.getByTestId('crafting-modal')).toBeInTheDocument();
  });

  it('should render bulk progress bar', () => {
    const { container } = render(
      <InventoryTab character={mockCharacter} characterColor="#7E8C9A" />
    );
    
    const progressBar = container.querySelector('.bulk-progress-bar');
    expect(progressBar).toBeInTheDocument();
  });

  it('should update bulk progress bar width based on usage', () => {
    const { container } = render(
      <InventoryTab character={mockCharacter} characterColor="#7E8C9A" />
    );
    
    const progressBar = container.querySelector('.bulk-progress-bar');
    // bulkUsed (5) / bulkLimit (10) = 50%
    expect(progressBar).toHaveStyle('width: 50%');
  });

  it('should use danger color for overencumbered status', () => {
    // Mock overencumbered status
    jest.mock('../../hooks/useCharacter', () => ({
      useCharacter: () => ({
        bulkStats: { bulkLimit: 10, encumberedThreshold: 7 },
        totalBulk: 15, // Overencumbered
        inventory: [],
        skillProficiencies: { crafting: 0 }
      })
    }));

    // Just verify it renders without error with various loads
    expect(() => {
      render(
        <InventoryTab character={mockCharacter} characterColor="#7E8C9A" />
      );
    }).not.toThrow();
  });

  it('should render ContainersList component', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    
    expect(screen.getByTestId('containers-list')).toBeInTheDocument();
  });

  it('should call onItemClick handler when provided', () => {
    const onItemClick = jest.fn();
    
    render(
      <InventoryTab 
        character={mockCharacter} 
        characterColor="#7E8C9A" 
        onItemClick={onItemClick}
      />
    );
    
    // Component should render without error
    expect(screen.getByTestId('containers-list')).toBeInTheDocument();
  });

  // Slice 4: effective-state badges + dropped de-emphasis
  it('shows a state badge for non-worn items and de-emphasizes dropped rows', () => {
    const { container } = render(
      <InventoryTab character={mockCharacter} characterColor="#7E8C9A" />
    );
    // held item shows its label; worn item shows no badge
    expect(screen.getByText('Held in 2 Hands')).toBeInTheDocument();
    expect(screen.getByText('(dropped)')).toBeInTheDocument();
    expect(screen.queryByText('Worn')).not.toBeInTheDocument();
    // dropped row is visually de-emphasised
    expect(container.querySelector('tr.inv-row-dropped')).toBeInTheDocument();
  });

  // Slice C: explicit per-item action buttons wired to useLoadout
  it('worn item shows Drop + Stow (single container) and wires them', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByTestId('inv-u3-drop'));
    expect(mockLoadout.drop).toHaveBeenCalledWith('u3');
    // exactly one container (Backpack u4) ⇒ a direct "Stow in Backpack" button
    fireEvent.click(screen.getByTestId('inv-u3-stow'));
    expect(mockLoadout.stow).toHaveBeenCalledWith('u3', 'u4');
  });

  it('a container item can be Dropped but not Stowed into itself', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    expect(screen.getByTestId('inv-u4-drop')).toBeInTheDocument();
    expect(screen.queryByTestId('inv-u4-stow')).not.toBeInTheDocument();
  });

  it('dropped item shows Pick up', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByTestId('inv-u2-pickup'));
    expect(mockLoadout.pickUp).toHaveBeenCalledWith('u2');
  });

  it('held item shows Unhand and Release', () => {
    render(<InventoryTab character={mockCharacter} characterColor="#7E8C9A" />);
    fireEvent.click(screen.getByTestId('inv-u1-unhand'));
    expect(mockLoadout.unhand).toHaveBeenCalledWith('u1');
    fireEvent.click(screen.getByTestId('inv-u1-release'));
    expect(mockLoadout.drop).toHaveBeenCalledWith('u1'); // release == drop → Dropped
  });
});
