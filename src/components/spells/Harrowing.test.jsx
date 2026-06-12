import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Harrowing from './Harrowing';

vi.mock('../shared/CollapsibleCard', () => ({
  default: function DummyCollapsibleCard({ children, header }) {
    return (
      <div data-testid="collapsible-card">
        <div>{header}</div>
        <div>{children}</div>
      </div>
    );
  }
}));

vi.mock('../shared/TraitTag', () => ({
  default: function DummyTraitTag({ trait }) {
    return <span data-testid="trait-tag">{typeof trait === 'string' ? trait : trait?.name}</span>;
  }
}));

vi.mock('../shared/ActionIcon', () => ({
  default: function DummyActionIcon({ actionText }) {
    return <span data-testid="action-icon">{actionText}</span>;
  }
}));

const baseCharacter = { id: 'Aria', name: 'Aria', feats: [] };

beforeEach(() => localStorage.clear());

describe('Harrowing', () => {
  it('renders Harrowing header', () => {
    render(<Harrowing character={baseCharacter} themeColor="#4a90d9" />);
    expect(screen.getByText('Harrowing')).toBeInTheDocument();
  });

  it('renders Harrow Suits reference card', () => {
    render(<Harrowing character={baseCharacter} themeColor="#4a90d9" />);
    expect(screen.getByText('Harrow Suits')).toBeInTheDocument();
    // Suit names appear in both the omen picker and the reference card.
    expect(screen.getAllByText('Hammers').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Keys').length).toBeGreaterThanOrEqual(2);
  });

  it('renders Tell Fortune card', () => {
    render(<Harrowing character={baseCharacter} themeColor="#4a90d9" />);
    expect(screen.getByText('Tell Fortune')).toBeInTheDocument();
  });

  it('renders Harrowing Ritual card', () => {
    render(<Harrowing character={baseCharacter} themeColor="#4a90d9" />);
    expect(screen.getByText('Harrowing Ritual')).toBeInTheDocument();
  });

  it('renders Harrow Casting feat section when character has the feat', () => {
    const character = {
      name: 'Aria',
      feats: [{ name: 'Harrow Casting', level: 4 }],
    };
    render(<Harrowing character={character} themeColor="#4a90d9" />);
    expect(screen.getByText('Harrow Casting')).toBeInTheDocument();
  });

  it('does NOT render Harrow Casting section when feat is absent', () => {
    render(<Harrowing character={baseCharacter} themeColor="#4a90d9" />);
    expect(screen.queryByText('Harrow Casting')).toBeNull();
  });

  it('does NOT render Harrow Casting section when feats is undefined', () => {
    const character = { name: 'Aria' };
    render(<Harrowing character={character} themeColor="#4a90d9" />);
    expect(screen.queryByText('Harrow Casting')).toBeNull();
  });

  it('does NOT render Harrow Casting section when feats array is empty', () => {
    const character = { name: 'Aria', feats: [] };
    render(<Harrowing character={character} themeColor="#4a90d9" />);
    expect(screen.queryByText('Harrow Casting')).toBeNull();
  });

  it('does NOT render Harrow Casting when character has other feats but not Harrow Casting', () => {
    const character = {
      name: 'Aria',
      feats: [{ name: 'Sudden Charge', level: 1 }],
    };
    render(<Harrowing character={character} themeColor="#4a90d9" />);
    expect(screen.queryByText('Harrow Casting')).toBeNull();
  });
});

describe('Harrowing — active omen picker (#227)', () => {
  it('starts with no active omen', () => {
    render(<Harrowing character={baseCharacter} themeColor="#4a90d9" />);
    expect(screen.getByText(/none — draw from your deck/)).toBeInTheDocument();
  });

  it('picking a suit sets the synced omen and shows it as active', () => {
    render(<Harrowing character={baseCharacter} themeColor="#4a90d9" />);
    fireEvent.click(screen.getByRole('button', { name: 'Keys' }));

    expect(screen.getByText('🂠 Keys')).toBeInTheDocument();
    expect(screen.getByText('(Reflex Saves)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keys' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('cnmh_omen_Aria'))).toMatchObject({ suit: 'Keys' });
  });

  it('Clear resets the omen', () => {
    render(<Harrowing character={baseCharacter} themeColor="#4a90d9" />);
    fireEvent.click(screen.getByRole('button', { name: 'Stars' }));
    fireEvent.click(screen.getByLabelText('Clear omen'));

    expect(screen.getByText(/none — draw from your deck/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('cnmh_omen_Aria'))).toMatchObject({ suit: null });
  });

  it('drawing a new omen replaces the previous suit', () => {
    render(<Harrowing character={baseCharacter} themeColor="#4a90d9" />);
    fireEvent.click(screen.getByRole('button', { name: 'Hammers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Books' }));
    expect(screen.getByText('🂠 Books')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('cnmh_omen_Aria'))).toMatchObject({ suit: 'Books' });
  });
});
