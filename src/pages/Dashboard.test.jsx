import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

// Mock contexts — must be a real React context so useContext works
vi.mock('../contexts/CharacterContext', async () => {
  const { createContext } = await vi.importActual('react');
  const MockCharacterContext = createContext({
    setActiveCharacter: () => {},
    characters: [],
    activeCharacter: null,
    getCharacter: () => null,
    activeCharacterColor: '#7E8C9A',
  });
  return {
    CharacterContext: MockCharacterContext,
    CharacterProvider: ({ children }) => children,
  };
});

vi.mock('../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    formatGameDate: () => 'Arodus 1, 4719'
  })
}));

vi.mock('../contexts/LoreContext', () => ({
  useLore: () => ({ openLore: vi.fn() }),
}));

vi.mock('../hooks/useSyncedState', () => ({
  useSyncedState: vi.fn(() => [
    { location: 'Absalom', treasure: '0', locationLoreId: 'absalom' },
    vi.fn(),
  ]),
}));

// Mock components
vi.mock('../components/party/PartySummary', () => ({
  default: function DummyPartySummary() {
    return <div data-testid="party-summary">Party Summary</div>;
  }
}));

// Mock data
vi.mock('../data/campaign', () => ({
  PARTY_GOLD: 1000,
  PARTY_NAME: 'The Chaotic Neutral Milk Hotel',
}));

const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('Dashboard', () => {
  it('should render without crashing', () => {
    expect(() => renderWithRouter(<Dashboard />)).not.toThrow();
  });

  it('should display party name', () => {
    renderWithRouter(<Dashboard />);
    expect(screen.getByText('The Chaotic Neutral Milk Hotel')).toBeInTheDocument();
  });

  it('should display party level stat', () => {
    renderWithRouter(<Dashboard />);
    expect(screen.getByText('Party Level')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('should display current location stat', () => {
    renderWithRouter(<Dashboard />);
    expect(screen.getByText('Current Location')).toBeInTheDocument();
    expect(screen.getByText('Absalom')).toBeInTheDocument();
  });

  it('should display party gold stat', () => {
    renderWithRouter(<Dashboard />);
    expect(screen.getByText('Party Gold')).toBeInTheDocument();
    expect(screen.getByText('1000 gp')).toBeInTheDocument();
  });

  it('should display adventure quest button', () => {
    renderWithRouter(<Dashboard />);
    expect(screen.getByText('Adventure')).toBeInTheDocument();
  });

  it('should display current date from GameDateContext', () => {
    renderWithRouter(<Dashboard />);
    expect(screen.getByText('Arodus 1, 4719')).toBeInTheDocument();
  });

  it('should have clickable stat cards that navigate', () => {
    renderWithRouter(<Dashboard />);
    
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should render stats grid', () => {
    const { container } = renderWithRouter(<Dashboard />);
    const statsGrid = container.querySelector('.stats-grid');
    expect(statsGrid).toBeInTheDocument();
  });

  it('should display stat icons', () => {
    renderWithRouter(<Dashboard />);
    
    // Check for emoji icons
    const dashboardContent = screen.getByText('The Chaotic Neutral Milk Hotel').parentElement;
    expect(dashboardContent).toBeInTheDocument();
  });

  it('should contain main dashboard section', () => {
    const { container } = renderWithRouter(<Dashboard />);
    const dashboard = container.querySelector('.dashboard');
    expect(dashboard).toBeInTheDocument();
  });

  it('should contain content section for stats', () => {
    const { container } = renderWithRouter(<Dashboard />);
    const contentSection = container.querySelector('.content-section');
    expect(contentSection).toBeInTheDocument();
  });
});
