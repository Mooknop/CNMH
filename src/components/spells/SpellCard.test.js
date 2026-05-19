import React from 'react';
import { render, screen } from '@testing-library/react';
import SpellCard from './SpellCard';

jest.mock('../shared/CollapsibleCard', () => ({ header, children, className }) => (
  <div data-testid="collapsible-card" className={className}>
    <div data-testid="card-header">{header}</div>
    <div data-testid="card-content">{children}</div>
  </div>
));

jest.mock('../shared/TraitTag', () => ({ trait }) => (
  <span data-testid="trait-tag">{trait}</span>
));

jest.mock('../shared/ActionIcon', () => ({ actionText }) => (
  <span data-testid="action-icon">{actionText}</span>
));

const baseSpell = {
  id: 'spell1',
  name: 'Fireball',
  level: 3,
  description: 'A ball of fire explodes.',
  traits: ['fire', 'evocation'],
  actions: '2',
  range: '500 feet',
  area: '20-foot burst',
};

describe('SpellCard', () => {
  it('renders without crashing', () => {
    expect(() => render(<SpellCard spell={baseSpell} themeColor="#ff0000" characterLevel={5} />)).not.toThrow();
  });

  it('renders spell name', () => {
    render(<SpellCard spell={baseSpell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Fireball')).toBeInTheDocument();
  });

  it('renders rank indicator for non-cantrip', () => {
    render(<SpellCard spell={baseSpell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Rank 3')).toBeInTheDocument();
  });

  it('renders cantrip indicator with scaled rank', () => {
    const cantripSpell = { ...baseSpell, level: 0, baseLevel: 1 };
    render(<SpellCard spell={cantripSpell} themeColor="#ff0000" characterLevel={5} />);
    // Math.ceil(5/2) = 3
    expect(screen.getByText('Cantrip 1 (3)')).toBeInTheDocument();
  });

  it('renders action icon when spell has actions', () => {
    render(<SpellCard spell={baseSpell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByTestId('action-icon')).toBeInTheDocument();
  });

  it('renders traits as TraitTag components', () => {
    render(<SpellCard spell={baseSpell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getAllByTestId('trait-tag')).toHaveLength(2);
    expect(screen.getByText('fire')).toBeInTheDocument();
  });

  it('renders spell description', () => {
    render(<SpellCard spell={baseSpell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('A ball of fire explodes.')).toBeInTheDocument();
  });

  it('renders range when present', () => {
    render(<SpellCard spell={baseSpell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('500 feet')).toBeInTheDocument();
  });

  it('renders area when present', () => {
    render(<SpellCard spell={baseSpell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('20-foot burst')).toBeInTheDocument();
  });

  it('renders defense when present', () => {
    const spell = { ...baseSpell, defense: 'Reflex' };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Reflex')).toBeInTheDocument();
  });

  it('renders duration when present', () => {
    const spell = { ...baseSpell, duration: '1 minute' };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('1 minute')).toBeInTheDocument();
  });

  it('renders targets when present', () => {
    const spell = { ...baseSpell, targets: '1 creature' };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('1 creature')).toBeInTheDocument();
  });

  it('renders trigger when present', () => {
    const spell = { ...baseSpell, trigger: 'An enemy attacks you.' };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('An enemy attacks you.')).toBeInTheDocument();
  });

  it('renders Signature indicator when spell is signature', () => {
    const spell = { ...baseSpell, signature: true };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Signature')).toBeInTheDocument();
  });

  it('renders Innate indicator when spell is from innate', () => {
    const spell = { ...baseSpell, fromInnate: true };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Innate')).toBeInTheDocument();
  });

  it('renders Prepared indicator', () => {
    const spell = { ...baseSpell, prepared: true };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Prepared')).toBeInTheDocument();
  });

  it('renders Not Prepared indicator', () => {
    const spell = { ...baseSpell, prepared: false };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Not Prepared')).toBeInTheDocument();
  });

  it('renders scroll indicator when fromScroll', () => {
    const spell = { ...baseSpell, fromScroll: true, scrollName: 'Scroll of Fireball' };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Scroll of Fireball')).toBeInTheDocument();
  });

  it('renders wand indicator when fromWand', () => {
    const spell = { ...baseSpell, fromWand: true, wandName: 'Wand of Fireball' };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Wand of Fireball')).toBeInTheDocument();
  });

  it('disables a scroll spell whose item is not in hand', () => {
    const spell = { ...baseSpell, fromScroll: true, scrollName: 'Scroll of Fireball', active: false };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Not in hand')).toBeInTheDocument();
    expect(screen.getByText(/hold Scroll of Fireball to cast/)).toBeInTheDocument();
    expect(screen.getByTestId('collapsible-card').className).toContain('is-inactive');
  });

  it('does not disable a spell that is active or has no active flag', () => {
    render(<SpellCard spell={{ ...baseSpell, fromScroll: true, scrollName: 'S', active: true }} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.queryByText('Not in hand')).not.toBeInTheDocument();
    expect(screen.getByTestId('collapsible-card').className).not.toContain('is-inactive');
  });

  it('renders degrees of success when present', () => {
    const spell = {
      ...baseSpell,
      degrees: { 'Critical Success': 'Double damage.', 'Failure': 'Half damage.' },
    };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Critical Success:')).toBeInTheDocument();
    expect(screen.getByText('Double damage.')).toBeInTheDocument();
  });

  it('renders heightened effects when present', () => {
    const spell = {
      ...baseSpell,
      heightened: { '+1': 'Increase damage by 2d6.' },
    };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('+1:')).toBeInTheDocument();
    expect(screen.getByText('Increase damage by 2d6.')).toBeInTheDocument();
  });

  it('renders bloodline indicator when spell is bloodline', () => {
    const spell = { ...baseSpell, bloodline: 'Draconic' };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Bloodline')).toBeInTheDocument();
  });

  it('renders innate source when fromInnate and innateSource present', () => {
    const spell = { ...baseSpell, fromInnate: true, innateSource: 'Elvish Heritage' };
    render(<SpellCard spell={spell} themeColor="#ff0000" characterLevel={5} />);
    expect(screen.getByText('Source: Elvish Heritage')).toBeInTheDocument();
  });
});
