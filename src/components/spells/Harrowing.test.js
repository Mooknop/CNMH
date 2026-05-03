import React from 'react';
import { render, screen } from '@testing-library/react';
import Harrowing from './Harrowing';

jest.mock('../shared/CollapsibleCard', () => {
  return function DummyCollapsibleCard({ children, header }) {
    return (
      <div data-testid="collapsible-card">
        <div>{header}</div>
        <div>{children}</div>
      </div>
    );
  };
});

jest.mock('../shared/TraitTag', () => {
  return function DummyTraitTag({ trait }) {
    return <span data-testid="trait-tag">{typeof trait === 'string' ? trait : trait?.name}</span>;
  };
});

jest.mock('../shared/ActionIcon', () => {
  return function DummyActionIcon({ actionText }) {
    return <span data-testid="action-icon">{actionText}</span>;
  };
});

const baseCharacter = { name: 'Aria', feats: [] };

describe('Harrowing', () => {
  it('renders Harrowing header', () => {
    render(<Harrowing character={baseCharacter} themeColor="#4a90d9" />);
    expect(screen.getByText('Harrowing')).toBeInTheDocument();
  });

  it('renders Harrow Suits reference card', () => {
    render(<Harrowing character={baseCharacter} themeColor="#4a90d9" />);
    expect(screen.getByText('Harrow Suits')).toBeInTheDocument();
    expect(screen.getByText('Hammers')).toBeInTheDocument();
    expect(screen.getByText('Keys')).toBeInTheDocument();
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
